import { Request, Response } from 'express';
import mongoose from 'mongoose';
import FraudLog from '../models/FraudLog';
import QRTransaction from '../models/QRTransaction';
import Ticket from '../models/Ticket';
import Trip from '../models/Trip';
import { disburseSimulatedRefund } from '../services/mockUpiService';
import { evaluateAndGrantRepeatReward } from './rewardController';

const DISCLAIMER = 'Demo / Simulated UPI Transaction — No real money is transferred.';
const AI_DISCLAIMER = 'Academic AI model using synthetic training data';

/**
 * @desc    Get paginated queue of suspicious claims pending manual administrative review
 * @route   GET /api/admin/fraud-queue
 * @access  Private (Admin only)
 */
export const getFraudQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const queue = await FraudLog.find({ adminDecision: 'Pending' })
      .populate({
        path: 'transactionId',
        select: 'status expiresAt claimedAt fraudScore flagReason upiId ticketId',
        populate: {
          path: 'ticketId',
          select: 'ticketNumber fareAmount amountPaid changeDue conductorId busNumber source destination issuedAt',
          populate: {
            path: 'conductorId',
            select: 'fullName email staffId',
          },
        },
      })
      .populate('passengerId', 'fullName email mobileNumber')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: queue.length,
      queue,
    });
  } catch (error: any) {
    console.error('Error fetching fraud queue:', error);
    res.status(500).json({
      success: false,
      errorCode: 'FETCH_QUEUE_ERROR',
      error: 'Internal server error retrieving fraud review queue',
    });
  }
};

/**
 * @desc    Admin reviews and resolves a flagged claim (Approve -> Mock UPI -> REDEEMED / Reject -> FAILED)
 * @route   POST /api/admin/review/:fraudLogId
 * @access  Private (Admin only)
 */
export const reviewFraudClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { fraudLogId } = req.params;
    const { decision } = req.body;
    const adminId = (req as any).user?._id;

    if (!['Approved', 'Rejected'].includes(decision)) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_DECISION',
        error: "Decision must be either 'Approved' or 'Rejected'",
      });
      return;
    }

    const fraudLog = await FraudLog.findById(fraudLogId);
    if (!fraudLog) {
      res.status(404).json({
        success: false,
        errorCode: 'LOG_NOT_FOUND',
        error: 'Fraud audit record not found',
      });
      return;
    }

    // Strictly prevent double-review, approve-after-reject, or reject-after-approve
    if (fraudLog.adminReviewed) {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REVIEWED',
        error: `This transaction has already been resolved with decision: ${fraudLog.adminDecision}`,
      });
      return;
    }

    const qrTransaction = await QRTransaction.findById(fraudLog.transactionId);
    if (!qrTransaction) {
      res.status(404).json({
        success: false,
        errorCode: 'TRANSACTION_NOT_FOUND',
        error: 'Associated QR transaction not found',
      });
      return;
    }

    const ticket = await Ticket.findById(qrTransaction.ticketId);
    if (!ticket) {
      res.status(404).json({
        success: false,
        errorCode: 'TICKET_NOT_FOUND',
        error: 'Associated Ticket not found',
      });
      return;
    }

    // Validate that change amount is positive
    if (!ticket.changeDue || ticket.changeDue <= 0) {
      res.status(400).json({
        success: false,
        errorCode: 'NO_CHANGE_DUE',
        error: 'This ticket has no change balance to refund',
      });
      return;
    }

    // State machine check: Must be in MANUAL_REVIEW state
    if (qrTransaction.status === 'REDEEMED') {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REDEEMED',
        error: 'This transaction has already been redeemed and paid out',
      });
      return;
    }

    if (qrTransaction.status !== 'MANUAL_REVIEW') {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_STATE',
        error: `Transaction must be in MANUAL_REVIEW state to perform admin action. Current status: ${qrTransaction.status}`,
      });
      return;
    }

    // ------------------------------------------------------------------
    // DECISION: APPROVED -> Execute Mock UPI & Settle (REDEEMED / COMPLETED)
    // ------------------------------------------------------------------
    const client = mongoose.connection.getClient();
    const topologyType = (client as any)?.topology?.description?.type;
    const supportsTransactions =
      topologyType === 'ReplicaSetWithPrimary' ||
      topologyType === 'ReplicaSetNoPrimary' ||
      topologyType === 'Sharded';

    if (decision === 'Approved') {
      const targetUpi = fraudLog.upiId || qrTransaction.upiId || 'simulated_passenger@upi';
      const upiReceipt = await disburseSimulatedRefund(targetUpi, ticket.changeDue, ticket.ticketNumber);

      let session: mongoose.ClientSession | null = null;
      try {
        if (supportsTransactions) {
          session = await mongoose.startSession();
          session.startTransaction();

          const updatedQr = await QRTransaction.findOneAndUpdate(
            {
              _id: qrTransaction._id,
              status: 'MANUAL_REVIEW',
            },
            {
              $set: {
                status: 'REDEEMED',
                redeemedAt: new Date(),
                mockUpiRef: upiReceipt.txnRef,
                isFraudulent: false,
              },
            },
            { session, returnDocument: 'after' }
          );

          if (!updatedQr) {
            await session.abortTransaction();
            res.status(400).json({
              success: false,
              errorCode: 'INVALID_STATE',
              error: 'Transaction is no longer in MANUAL_REVIEW state',
            });
            return;
          }

          await Ticket.findByIdAndUpdate(
            ticket._id,
            { $set: { status: 'COMPLETED' } },
            { session }
          );

          fraudLog.adminReviewed = true;
          fraudLog.adminDecision = 'Approved';
          fraudLog.reviewedBy = adminId;
          await fraudLog.save({ session });

          await session.commitTransaction();
        } else {
          const updatedQr = await QRTransaction.findOneAndUpdate(
            {
              _id: qrTransaction._id,
              status: 'MANUAL_REVIEW',
            },
            {
              $set: {
                status: 'REDEEMED',
                redeemedAt: new Date(),
                mockUpiRef: upiReceipt.txnRef,
                isFraudulent: false,
              },
            },
            { returnDocument: 'after' }
          );

          if (!updatedQr) {
            res.status(400).json({
              success: false,
              errorCode: 'INVALID_STATE',
              error: 'Transaction is no longer in MANUAL_REVIEW state',
            });
            return;
          }

          await Ticket.findByIdAndUpdate(
            ticket._id,
            { $set: { status: 'COMPLETED' } }
          );

          fraudLog.adminReviewed = true;
          fraudLog.adminDecision = 'Approved';
          fraudLog.reviewedBy = adminId;
          await fraudLog.save();
        }

        // Evaluate repeat-bus travel reward for passenger
        let reward: any = null;
        try {
          if (ticket.passengerId) {
            reward = await evaluateAndGrantRepeatReward(
              ticket.passengerId,
              ticket.busNumber || 'TN-58-N-1234',
              ticket._id
            );
          }
        } catch (rErr) {
          console.warn('Could not evaluate reward in admin approval:', rErr);
        }

        res.status(200).json({
          success: true,
          message: 'Claim approved and simulated refund disbursed successfully',
          decision: 'Approved',
          reward: reward
            ? {
                rewardId: reward.rewardId,
                status: reward.status,
                rewardAmount: reward.rewardAmount,
              }
            : null,
          settlement: {
            amount: ticket.changeDue,
            upiId: targetUpi,
            mockUpiRef: upiReceipt.txnRef,
            disclaimer: DISCLAIMER,
          },
        });
        return;
      } catch (txErr) {
        if (session && session.inTransaction()) await session.abortTransaction();
        throw txErr;
      } finally {
        if (session) session.endSession();
      }
    }

    // ------------------------------------------------------------------
    // DECISION: REJECTED -> Void Transaction (FAILED / CANCELLED)
    // ------------------------------------------------------------------
    let session: mongoose.ClientSession | null = null;
    try {
      if (supportsTransactions) {
        session = await mongoose.startSession();
        session.startTransaction();

        const updatedQr = await QRTransaction.findOneAndUpdate(
          {
            _id: qrTransaction._id,
            status: 'MANUAL_REVIEW',
          },
          {
            $set: {
              status: 'FAILED',
              isFraudulent: true,
            },
          },
          { session, returnDocument: 'after' }
        );

        if (!updatedQr) {
          await session.abortTransaction();
          res.status(400).json({
            success: false,
            errorCode: 'INVALID_STATE',
            error: 'Transaction is no longer in MANUAL_REVIEW state',
          });
          return;
        }

        await Ticket.findByIdAndUpdate(
          ticket._id,
          { $set: { status: 'CANCELLED' } },
          { session }
        );

        fraudLog.adminReviewed = true;
        fraudLog.adminDecision = 'Rejected';
        fraudLog.reviewedBy = adminId;
        await fraudLog.save({ session });

        await session.commitTransaction();
      } else {
        const updatedQr = await QRTransaction.findOneAndUpdate(
          {
            _id: qrTransaction._id,
            status: 'MANUAL_REVIEW',
          },
          {
            $set: {
              status: 'FAILED',
              isFraudulent: true,
            },
          },
          { returnDocument: 'after' }
        );

        if (!updatedQr) {
          res.status(400).json({
            success: false,
            errorCode: 'INVALID_STATE',
            error: 'Transaction is no longer in MANUAL_REVIEW state',
          });
          return;
        }

        await Ticket.findByIdAndUpdate(
          ticket._id,
          { $set: { status: 'CANCELLED' } }
        );

        fraudLog.adminReviewed = true;
        fraudLog.adminDecision = 'Rejected';
        fraudLog.reviewedBy = adminId;
        await fraudLog.save();
      }

      res.status(200).json({
        success: true,
        message: 'Claim verified as fraudulent and voided',
        decision: 'Rejected',
      });
    } catch (txErr) {
      if (session && session.inTransaction()) await session.abortTransaction();
      throw txErr;
    } finally {
      if (session) session.endSession();
    }
  } catch (error: any) {
    console.error('Error reviewing fraud claim:', error);
    res.status(500).json({
      success: false,
      errorCode: 'REVIEW_ERROR',
      error: 'Internal server error processing admin review decision',
    });
  }
};

/**
 * @desc    Get real-time database aggregations for Admin Dashboard telemetry & Fraud Analytics
 * @route   GET /api/admin/analytics
 * @access  Private (Admin only)
 */
export const getAdminAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { date, bus, route } = req.query;
    const ticketFilter: any = {};

    if (bus && typeof bus === 'string' && bus.trim()) {
      ticketFilter.busNumber = bus.trim().toUpperCase();
    }

    if (route && typeof route === 'string' && route.trim()) {
      ticketFilter.$or = [
        { source: new RegExp(route.trim(), 'i') },
        { destination: new RegExp(route.trim(), 'i') },
      ];
    }

    if (date && typeof date === 'string' && date.trim()) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      ticketFilter.issuedAt = { $gte: start, $lte: end };
    }

    // 1. Total Change Dispensed (sum of changeDue for COMPLETED tickets)
    const matchCompleted: any = { status: 'COMPLETED', ...ticketFilter };
    const changeSumResult = await Ticket.aggregate([
      { $match: matchCompleted },
      { $group: { _id: null, total: { $sum: '$changeDue' }, count: { $sum: 1 } } },
    ]);
    const totalChangeDispensed = changeSumResult[0]?.total || 0;
    const completedTicketsCount = changeSumResult[0]?.count || 0;
    const averageChangeAmount =
      completedTicketsCount > 0
        ? Number((totalChangeDispensed / completedTicketsCount).toFixed(2))
        : 0;

    // 2. Total Passes Issued
    const totalTicketsIssued = await Ticket.countDocuments(ticketFilter);

    // 3. Claims Settled (QRTransaction REDEEMED)
    const totalClaimsSettled = await QRTransaction.countDocuments({ status: 'REDEEMED' });

    // 4. Pending Review Count
    const pendingReviewCount = await FraudLog.countDocuments({ adminDecision: 'Pending' });

    // 5. Fraud Interceptions Count (Rejected or flagged fraudulent)
    const fraudInterceptionsCount = await FraudLog.countDocuments({ adminDecision: 'Rejected' });

    // 6. Failed / Expired Transactions
    const failedTransactions = await QRTransaction.countDocuments({
      status: { $in: ['FAILED', 'EXPIRED'] },
    });

    // 7. Active Trips, Active Buses, Active Conductors
    const activeTrips = await Trip.countDocuments({ status: 'ACTIVE' });
    const activeBusesList = await Trip.distinct('busNumber', { status: 'ACTIVE' });
    const activeBuses = activeBusesList.length;
    const activeConductorsList = await Trip.distinct('conductorId', { status: 'ACTIVE' });
    const activeConductors = activeConductorsList.length;

    // 8. Settlement Rate Percentage: Strictly mathematically bounded between 0.0% and 100.0%
    const rawRate =
      totalTicketsIssued > 0 ? (totalClaimsSettled / totalTicketsIssued) * 100 : 0;
    const settlementRate = Number(Math.min(100, Math.max(0, rawRate)).toFixed(1));

    // 9. AI Fraud Risk Breakdown
    const lowRisk = await QRTransaction.countDocuments({ fraudScore: { $lt: 0.35 } });
    const mediumRisk = await QRTransaction.countDocuments({
      fraudScore: { $gte: 0.35, $lt: 0.5 },
    });
    const highRisk = await QRTransaction.countDocuments({ fraudScore: { $gte: 0.5 } });
    const transactionsAnalyzed = await QRTransaction.countDocuments({
      fraudScore: { $exists: true, $ne: null },
    });

    res.status(200).json({
      success: true,
      data: {
        totalChangeDispensed: Number(totalChangeDispensed.toFixed(2)),
        totalTicketsIssued,
        totalClaimsSettled,
        completedSettlements: totalClaimsSettled,
        settlementRate,
        pendingReviewCount,
        manualReviews: pendingReviewCount,
        fraudInterceptionsCount,
        failedTransactions,
        averageChangeAmount,
        activeTrips,
        activeBuses,
        activeConductors,
        fraudBreakdown: {
          transactionsAnalyzed,
          lowRisk,
          mediumRisk,
          highRisk,
          aiDisclaimer: AI_DISCLAIMER,
        },
      },
    });
  } catch (error: any) {
    console.error('Error calculating analytics:', error);
    res.status(500).json({
      success: false,
      errorCode: 'ANALYTICS_ERROR',
      error: 'Internal server error aggregating admin analytics',
    });
  }
};
