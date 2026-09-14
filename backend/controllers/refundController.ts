import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Ticket from '../models/Ticket';
import QRTransaction from '../models/QRTransaction';
import FraudLog from '../models/FraudLog';
import { extractTelemetryFeatures, evaluateClaimRisk } from '../services/aiFraudService';
import { disburseSimulatedRefund, validateUpiId } from '../services/mockUpiService';
import { evaluateAndGrantRepeatReward } from './rewardController';

const DISCLAIMER = 'Demo / Simulated UPI Transaction — No real money is transferred.';

/**
 * @desc    Process Layer 2 AI risk assessment & Simulated UPI Settlement for a CLAIMED ticket
 * @route   POST /api/refund/process
 * @access  Private (Passenger only)
 */
export const processRefund = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketNumber, upiId } = req.body;
    const passengerId = (req as any).user?._id;

    if (!ticketNumber || typeof ticketNumber !== 'string') {
      res.status(400).json({
        success: false,
        errorCode: 'MISSING_TICKET_NUMBER',
        error: 'ticketNumber is required',
      });
      return;
    }

    if (!upiId || !validateUpiId(upiId)) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_UPI_ID',
        error: 'A valid Virtual Payment Address (UPI ID) is required (e.g. passenger@okhdfcbank)',
      });
      return;
    }

    // 1. Locate Ticket by ticketNumber
    const ticket = await Ticket.findOne({ ticketNumber: ticketNumber.trim() });
    if (!ticket) {
      res.status(404).json({
        success: false,
        errorCode: 'TICKET_NOT_FOUND',
        error: `No ticket found with identifier ${ticketNumber}`,
      });
      return;
    }

    // 2. Zero-Change Due Validation (Must be positive amount)
    if (!ticket.changeDue || ticket.changeDue <= 0) {
      res.status(400).json({
        success: false,
        errorCode: 'NO_CHANGE_DUE',
        error: 'This ticket has no change balance to refund',
      });
      return;
    }

    // 3. Locate associated QRTransaction
    const qrTransaction = await QRTransaction.findOne({ ticketId: ticket._id });
    if (!qrTransaction) {
      res.status(404).json({
        success: false,
        errorCode: 'TRANSACTION_NOT_FOUND',
        error: 'No QR transaction record associated with this ticket',
      });
      return;
    }

    // 4. Verify Passenger ownership
    if (!qrTransaction.claimedBy || qrTransaction.claimedBy.toString() !== passengerId.toString()) {
      res.status(403).json({
        success: false,
        errorCode: 'FORBIDDEN_CLAIMANT',
        error: 'Only the passenger who claimed this ticket can initiate refund disbursement',
      });
      return;
    }

    // 5. Validate current lifecycle state
    if (qrTransaction.status === 'REDEEMED') {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REDEEMED',
        error: 'This change balance has already been refunded and settled',
      });
      return;
    }

    if (qrTransaction.status === 'REFUND_PENDING') {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REDEEMED',
        error: 'Refund settlement is already in progress for this ticket',
      });
      return;
    }

    if (qrTransaction.status === 'MANUAL_REVIEW') {
      res.status(400).json({
        success: false,
        errorCode: 'UNDER_MANUAL_REVIEW',
        error: 'This transaction is currently undergoing administrative security review',
      });
      return;
    }

    if (qrTransaction.status === 'FAILED') {
      res.status(400).json({
        success: false,
        errorCode: 'TRANSACTION_VOIDED',
        error: 'This transaction was rejected during fraud audit and cannot be refunded',
      });
      return;
    }

    if (qrTransaction.status !== 'CLAIMED') {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_CLAIM_STATE',
        error: `Ticket must be in CLAIMED state to disburse refund. Current status: ${qrTransaction.status}`,
      });
      return;
    }

    // 6. Idempotent Atomic Reservation: CLAIMED -> REFUND_PENDING
    // Ensures exactly 1 request acquires the reservation before any simulated payout reference is generated
    const reservedQr = await QRTransaction.findOneAndUpdate(
      {
        _id: qrTransaction._id,
        status: 'CLAIMED',
      },
      {
        $set: {
          status: 'REFUND_PENDING',
          upiId: upiId.trim().toLowerCase(),
        },
      },
      { returnDocument: 'after' }
    );

    if (!reservedQr) {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REDEEMED',
        error: 'Duplicate refund prevented: transaction was already settled or in progress',
      });
      return;
    }

    // 7. Extract Layer 2 features from database
    const features = await extractTelemetryFeatures(ticket._id as mongoose.Types.ObjectId, passengerId);

    // 8. Evaluate Layer 2 AI Risk
    const riskResult = await evaluateClaimRisk(features);

    // -------------------------------------------------------------
    // BRANCH A: LOW RISK (Score < 0.50) -> Instant Simulated Settlement
    // -------------------------------------------------------------
    if (riskResult.riskTier === 'LOW_RISK') {
      // Execute Mock UPI transfer with ticket number for idempotent mock reference
      const upiReceipt = await disburseSimulatedRefund(upiId, ticket.changeDue, ticket.ticketNumber);

      // Atomic Conditional Settlement
      const client = mongoose.connection.getClient();
      const topologyType = (client as any)?.topology?.description?.type;
      const supportsTransactions =
        topologyType === 'ReplicaSetWithPrimary' ||
        topologyType === 'ReplicaSetNoPrimary' ||
        topologyType === 'Sharded';

      let session: mongoose.ClientSession | null = null;
      let updatedQr: any = null;
      let updatedTicket: any = null;

      try {
        if (supportsTransactions) {
          session = await mongoose.startSession();
          session.startTransaction();

          updatedQr = await QRTransaction.findOneAndUpdate(
            {
              _id: qrTransaction._id,
              status: 'REFUND_PENDING',
            },
            {
              $set: {
                status: 'REDEEMED',
                redeemedAt: new Date(),
                upiId: upiReceipt.upiId,
                mockUpiRef: upiReceipt.txnRef,
                fraudScore: riskResult.fraudScore,
                isFraudulent: false,
              },
            },
            { session, returnDocument: 'after' }
          );

          if (!updatedQr) {
            await session.abortTransaction();
            res.status(400).json({
              success: false,
              errorCode: 'ALREADY_REDEEMED',
              error: 'Duplicate refund prevented: transaction reservation state changed',
            });
            return;
          }

          updatedTicket = await Ticket.findOneAndUpdate(
            {
              _id: ticket._id,
              status: 'CLAIMED',
            },
            {
              $set: { status: 'COMPLETED' },
            },
            { session, returnDocument: 'after' }
          );

          await session.commitTransaction();
        } else {
          // Atomic standalone fallback
          updatedQr = await QRTransaction.findOneAndUpdate(
            {
              _id: qrTransaction._id,
              status: 'REFUND_PENDING',
            },
            {
              $set: {
                status: 'REDEEMED',
                redeemedAt: new Date(),
                upiId: upiReceipt.upiId,
                mockUpiRef: upiReceipt.txnRef,
                fraudScore: riskResult.fraudScore,
                isFraudulent: false,
              },
            },
            { returnDocument: 'after' }
          );

          if (!updatedQr) {
            res.status(400).json({
              success: false,
              errorCode: 'ALREADY_REDEEMED',
              error: 'Duplicate refund prevented: transaction reservation state changed',
            });
            return;
          }

          updatedTicket = await Ticket.findOneAndUpdate(
            {
              _id: ticket._id,
              status: 'CLAIMED',
            },
            {
              $set: { status: 'COMPLETED' },
            },
            { returnDocument: 'after' }
          );
        }

        // Evaluate repeat-bus travel reward
        let reward: any = null;
        try {
          reward = await evaluateAndGrantRepeatReward(
            passengerId,
            ticket.busNumber || 'TN-58-N-1234',
            ticket._id
          );
        } catch (rErr) {
          console.warn('Could not evaluate reward:', rErr);
        }

        res.status(200).json({
          success: true,
          status: 'COMPLETED',
          riskTier: 'LOW_RISK',
          fraudScore: riskResult.fraudScore,
          modelType: riskResult.modelType,
          reward: reward
            ? {
                rewardId: reward.rewardId,
                status: reward.status,
                rewardAmount: reward.rewardAmount,
                busNumber: reward.busNumber,
              }
            : null,
          settlement: {
            amount: ticket.changeDue,
            upiId: upiReceipt.upiId,
            mockUpiRef: upiReceipt.txnRef,
            redeemedAt: upiReceipt.timestamp,
            disclaimer: DISCLAIMER,
          },
          ticket: {
            ticketNumber: ticket.ticketNumber,
            busNumber: ticket.busNumber,
            source: ticket.source,
            destination: ticket.destination,
            fareAmount: ticket.fareAmount,
            amountPaid: ticket.amountPaid,
            changeDue: ticket.changeDue,
            status: updatedTicket ? updatedTicket.status : 'COMPLETED',
          },
        });
        return;
      } catch (txErr: any) {
        if (session && session.inTransaction()) {
          try {
            await session.abortTransaction();
          } catch (abortErr) {
            console.error('Error aborting transaction:', abortErr);
          }
        }

        // Compensating rollback of reservation if session failed
        await QRTransaction.findByIdAndUpdate(qrTransaction._id, { $set: { status: 'CLAIMED' } });
        throw txErr;
      } finally {
        if (session) session.endSession();
      }
    }

    // -------------------------------------------------------------
    // BRANCH B: HIGH RISK (Score >= 0.50 or AI Outage) -> Manual Review
    // -------------------------------------------------------------
    const flagReasonStr =
      riskResult.flagReasons.length > 0
        ? riskResult.flagReasons.join('; ')
        : 'Multi-feature risk threshold exceeded (Score >= 0.50)';

    // Atomically transition QRTransaction from REFUND_PENDING to MANUAL_REVIEW
    await QRTransaction.findByIdAndUpdate(qrTransaction._id, {
      $set: {
        status: 'MANUAL_REVIEW',
        upiId: upiId.trim().toLowerCase(),
        fraudScore: riskResult.fraudScore,
        flagReason: flagReasonStr,
        isFraudulent: true,
      },
    });

    // Create Audit Log in FraudLog collection
    await FraudLog.create({
      transactionId: qrTransaction._id,
      passengerId,
      upiId: upiId.trim().toLowerCase(),
      aiConfidenceScore: riskResult.fraudScore,
      flagReason: flagReasonStr,
      adminReviewed: false,
      adminDecision: 'Pending',
    });

    res.status(202).json({
      success: true,
      status: 'MANUAL_REVIEW',
      riskTier: 'HIGH_RISK',
      fraudScore: riskResult.fraudScore,
      modelType: riskResult.modelType,
      flagReasons: riskResult.flagReasons,
      message:
        'Your refund claim has been queued for standard transit security audit. An administrator will review your transaction.',
      disclaimer: DISCLAIMER,
    });
  } catch (error: any) {
    console.error('Error in processRefund:', error);
    res.status(500).json({
      success: false,
      errorCode: 'SETTLEMENT_ERROR',
      error: 'Internal server error during refund settlement',
    });
  }
};

/**
 * @desc    Get real-time refund and claim status for a passenger's ticket from MongoDB
 * @route   GET /api/refund/status/:ticketNumber
 * @access  Private (Passenger only)
 */
export const getRefundStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { ticketNumber } = req.params;
    const passengerId = (req as any).user?._id;

    if (!ticketNumber || typeof ticketNumber !== 'string') {
      res.status(400).json({
        success: false,
        errorCode: 'MISSING_TICKET_NUMBER',
        error: 'ticketNumber parameter is required',
      });
      return;
    }

    const ticket = await Ticket.findOne({ ticketNumber: ticketNumber.trim() });
    if (!ticket) {
      res.status(404).json({
        success: false,
        errorCode: 'TICKET_NOT_FOUND',
        error: `No ticket found with identifier ${ticketNumber}`,
      });
      return;
    }

    const qrTransaction = await QRTransaction.findOne({ ticketId: ticket._id });
    if (!qrTransaction) {
      res.status(404).json({
        success: false,
        errorCode: 'TRANSACTION_NOT_FOUND',
        error: 'No QR transaction record associated with this ticket',
      });
      return;
    }

    // Strict ownership guard: passenger can only retrieve their own ticket
    const isClaimedByPassenger =
      qrTransaction.claimedBy && qrTransaction.claimedBy.toString() === passengerId.toString();
    const isTicketPassenger =
      ticket.passengerId && ticket.passengerId.toString() === passengerId.toString();

    if (!isClaimedByPassenger && !isTicketPassenger) {
      res.status(403).json({
        success: false,
        errorCode: 'ACCESS_DENIED',
        error: 'You do not have permission to view status for this ticket',
      });
      return;
    }

    let fraudLog: any = null;
    if (qrTransaction.status === 'MANUAL_REVIEW' || qrTransaction.isFraudulent) {
      fraudLog = await FraudLog.findOne({ transactionId: qrTransaction._id }).sort({ createdAt: -1 });
    }

    res.status(200).json({
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        fareAmount: ticket.fareAmount,
        amountPaid: ticket.amountPaid,
        changeDue: ticket.changeDue,
        status: ticket.status,
        issuedAt: ticket.issuedAt,
      },
      claim: {
        status: qrTransaction.status,
        claimedAt: qrTransaction.claimedAt,
        redeemedAt: qrTransaction.redeemedAt,
        upiId: qrTransaction.upiId,
        mockUpiRef: qrTransaction.mockUpiRef,
        fraudScore: qrTransaction.fraudScore,
        flagReason: qrTransaction.flagReason,
      },
      settlement:
        qrTransaction.status === 'REDEEMED'
          ? {
              amount: ticket.changeDue,
              upiId: qrTransaction.upiId,
              mockUpiRef: qrTransaction.mockUpiRef,
              redeemedAt: qrTransaction.redeemedAt,
              disclaimer: DISCLAIMER,
            }
          : undefined,
      fraud:
        fraudLog
          ? {
              adminDecision: fraudLog.adminDecision,
              adminReviewed: fraudLog.adminReviewed,
              reasons: fraudLog.flagReason ? fraudLog.flagReason.split('; ') : [],
            }
          : undefined,
    });
  } catch (error: any) {
    console.error('Error in getRefundStatus:', error);
    res.status(500).json({
      success: false,
      errorCode: 'FETCH_STATUS_ERROR',
      error: 'Internal server error retrieving refund status',
    });
  }
};
