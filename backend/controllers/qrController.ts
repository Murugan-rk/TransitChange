import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Ticket from '../models/Ticket';
import QRTransaction from '../models/QRTransaction';
import { verifyQrPayload } from '../utils/qrSigner';

const qrClaimPayloadSchema = z.object({
  ticketId: z.string({ message: 'ticketId is required' }).min(1, { message: 'ticketId cannot be empty' }),
  busNumber: z.string({ message: 'busNumber is required' }).min(1, { message: 'busNumber cannot be empty' }),
  source: z.string({ message: 'source is required' }).min(1, { message: 'source cannot be empty' }),
  destination: z.string({ message: 'destination is required' }).min(1, { message: 'destination cannot be empty' }),
  date: z.string({ message: 'date is required' }).min(1, { message: 'date cannot be empty' }),
  changeAmount: z
    .number({ message: 'changeAmount must be a number' })
    .positive({ message: 'changeAmount must be positive' })
    .finite({ message: 'changeAmount must be finite' }),
  timestamp: z.string({ message: 'timestamp is required' }).min(1, { message: 'timestamp cannot be empty' }),
  nonce: z.string({ message: 'nonce is required' }).min(1, { message: 'nonce cannot be empty' }),
  signature: z.string({ message: 'signature is required' }).min(1, { message: 'signature cannot be empty' }),
});

// @desc    Validate and claim a change ticket QR code (Layer 1 Deterministic Validation)
// @route   POST /api/qr/claim
// @access  Private (Passenger only)
export const claimQr = async (req: Request, res: Response): Promise<void> => {
  try {
    const { qrPayload } = req.body;

    if (!qrPayload) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_PAYLOAD',
        error: 'Missing qrPayload in request body',
      });
      return;
    }

    // 1. Parse JSON payload if received as string
    let parsedPayload: any;
    if (typeof qrPayload === 'string') {
      try {
        parsedPayload = JSON.parse(qrPayload);
      } catch {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_PAYLOAD',
          error: 'QR payload is not valid JSON',
        });
        return;
      }
    } else if (typeof qrPayload === 'object' && qrPayload !== null) {
      parsedPayload = qrPayload;
    } else {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_PAYLOAD',
        error: 'Invalid QR payload format',
      });
      return;
    }

    // 2. Validate payload structure
    const schemaValidation = qrClaimPayloadSchema.safeParse(parsedPayload);
    if (!schemaValidation.success) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_PAYLOAD',
        error: schemaValidation.error.issues[0]?.message || 'Malformed QR payload structure',
      });
      return;
    }

    const validPayload = schemaValidation.data;

    // 3. Cryptographic signature verification using server-side HMAC secret
    const cryptoVerification = verifyQrPayload(validPayload);
    if (!cryptoVerification.valid) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_SIGNATURE',
        error: 'Cryptographic signature verification failed: QR is invalid or has been tampered with',
      });
      return;
    }

    // 4. Resolve Ticket semantics:
    // QR payload "ticketId" corresponds to the public business identifier Ticket.ticketNumber (e.g. TC-YYYYMMDD-XXXXXX).
    // Mapping: QR payload ticketId -> Ticket.ticketNumber -> Ticket._id -> QRTransaction.ticketId
    const ticket = await Ticket.findOne({ ticketNumber: validPayload.ticketId });
    if (!ticket) {
      res.status(404).json({
        success: false,
        errorCode: 'TICKET_NOT_FOUND',
        error: 'Referenced transit ticket was not found',
      });
      return;
    }

    // 5. Verify consistency between signed payload and database record
    if (Number(ticket.changeDue.toFixed(2)) !== Number(validPayload.changeAmount.toFixed(2))) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_TICKET_DATA',
        error: 'Data discrepancy: QR change amount does not match ticket change due',
      });
      return;
    }

    if (ticket.busNumber && validPayload.busNumber && ticket.busNumber !== validPayload.busNumber) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_TICKET_DATA',
        error: 'Data discrepancy: QR bus number does not match ticket record',
      });
      return;
    }

    if (ticket.source && validPayload.source && ticket.source !== validPayload.source) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_TICKET_DATA',
        error: 'Data discrepancy: QR route source does not match ticket record',
      });
      return;
    }

    if (ticket.destination && validPayload.destination && ticket.destination !== validPayload.destination) {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_TICKET_DATA',
        error: 'Data discrepancy: QR route destination does not match ticket record',
      });
      return;
    }

    // 6. Find QRTransaction associated with this ticket (Ticket._id)
    const qrTransaction = await QRTransaction.findOne({ ticketId: ticket._id });
    if (!qrTransaction) {
      res.status(404).json({
        success: false,
        errorCode: 'TRANSACTION_NOT_FOUND',
        error: 'Associated QR transaction record not found',
      });
      return;
    }

    // 7. Check current lifecycle status
    if (qrTransaction.status === 'CLAIMED') {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_CLAIMED',
        error: 'This QR code has already been claimed',
      });
      return;
    }

    if (qrTransaction.status === 'REDEEMED') {
      res.status(400).json({
        success: false,
        errorCode: 'ALREADY_REDEEMED',
        error: 'This QR code has already been redeemed and paid out',
      });
      return;
    }

    if (qrTransaction.status !== 'ACTIVE') {
      res.status(400).json({
        success: false,
        errorCode: 'CLAIM_FAILED',
        error: `Cannot claim QR with status ${qrTransaction.status}`,
      });
      return;
    }

    // 8. Check expiration
    const now = new Date();
    if (new Date(qrTransaction.expiresAt).getTime() <= now.getTime()) {
      await QRTransaction.findByIdAndUpdate(qrTransaction._id, { status: 'EXPIRED' });
      res.status(400).json({
        success: false,
        errorCode: 'EXPIRED',
        error: 'This QR code has expired (exceeded validity window)',
      });
      return;
    }

    // 9. Atomic Multi-Document Transition (ACTIVE -> CLAIMED)
    // Uses replica-set multi-document transaction when supported; fallback to atomic findOneAndUpdate on standalone
    const passengerId = req.user._id;
    let updatedQr: any = null;
    let updatedTicket: any = null;
    let session: mongoose.ClientSession | null = null;

    const client = mongoose.connection.getClient();
    const topologyType = (client as any)?.topology?.description?.type;
    const supportsTransactions =
      topologyType === 'ReplicaSetWithPrimary' ||
      topologyType === 'ReplicaSetNoPrimary' ||
      topologyType === 'Sharded';

    try {
      if (supportsTransactions) {
        session = await mongoose.startSession();
        session.startTransaction();

        // 9a. Atomically find & update QRTransaction with pre-condition { status: 'ACTIVE', expiresAt > now }
        updatedQr = await QRTransaction.findOneAndUpdate(
          {
            _id: qrTransaction._id,
            status: 'ACTIVE',
            expiresAt: { $gt: now },
          },
          {
            $set: {
              status: 'CLAIMED',
              claimedBy: passengerId,
              claimedAt: now,
            },
          },
          { session, returnDocument: 'after' }
        );

        if (!updatedQr) {
          await session.abortTransaction();
          const currentQr = await QRTransaction.findById(qrTransaction._id);
          if (currentQr?.status === 'CLAIMED') {
            res.status(400).json({
              success: false,
              errorCode: 'ALREADY_CLAIMED',
              error: 'This QR code has already been claimed',
            });
            return;
          }
          res.status(400).json({
            success: false,
            errorCode: 'CLAIM_FAILED',
            error: 'Claim failed: QR status is no longer ACTIVE',
          });
          return;
        }

        // 9b. Atomically update Ticket within the same transaction session
        updatedTicket = await Ticket.findByIdAndUpdate(
          ticket._id,
          {
            $set: {
              status: 'CLAIMED',
              passengerId: passengerId,
            },
          },
          { session, returnDocument: 'after' }
        );

        await session.commitTransaction();
      } else {
        // Atomic single-operation fallback for standalone mongod (in-memory test mode)
        updatedQr = await QRTransaction.findOneAndUpdate(
          {
            _id: qrTransaction._id,
            status: 'ACTIVE',
            expiresAt: { $gt: now },
          },
          {
            $set: {
              status: 'CLAIMED',
              claimedBy: passengerId,
              claimedAt: now,
            },
          },
          { returnDocument: 'after' }
        );

        if (!updatedQr) {
          const currentQr = await QRTransaction.findById(qrTransaction._id);
          if (currentQr?.status === 'CLAIMED') {
            res.status(400).json({
              success: false,
              errorCode: 'ALREADY_CLAIMED',
              error: 'This QR code has already been claimed',
            });
            return;
          }
          res.status(400).json({
            success: false,
            errorCode: 'CLAIM_FAILED',
            error: 'Claim failed: QR status is no longer ACTIVE',
          });
          return;
        }

        updatedTicket = await Ticket.findByIdAndUpdate(
          ticket._id,
          {
            $set: {
              status: 'CLAIMED',
              passengerId: passengerId,
            },
          },
          { returnDocument: 'after' }
        );
      }
    } catch (txErr: any) {
      if (session && session.inTransaction()) {
        try {
          await session.abortTransaction();
        } catch (abortErr) {
          console.error('Error aborting transaction:', abortErr);
        }
      }

      // If write conflict occurred due to concurrent claim collision, check document state
      if (
        txErr?.code === 112 ||
        txErr?.errorLabels?.includes('TransientTransactionError') ||
        txErr?.errorLabels?.has?.('TransientTransactionError') ||
        txErr?.errorResponse?.code === 112
      ) {
        const concurrentQr = await QRTransaction.findById(qrTransaction._id);
        if (concurrentQr?.status === 'CLAIMED') {
          res.status(400).json({
            success: false,
            errorCode: 'ALREADY_CLAIMED',
            error: 'This QR code has already been claimed',
          });
          return;
        }
      }

      console.error('Transaction failed during claim:', txErr);
      res.status(500).json({
        success: false,
        errorCode: 'CLAIM_FAILED',
        error: 'Database transaction failed during claim processing',
      });
      return;
    } finally {
      if (session) {
        session.endSession();
      }
    }

    // 10. Return trusted server receipt data (Frontend displays only this validated data)
    res.status(200).json({
      success: true,
      message: 'QR code verified and change claim recorded successfully',
      claim: {
        ticketId: ticket.ticketNumber,
        changeDue: ticket.changeDue,
        status: updatedQr.status,
        claimedAt: updatedQr.claimedAt,
      },
      ticket: {
        ticketNumber: ticket.ticketNumber,
        busNumber: ticket.busNumber,
        source: ticket.source,
        destination: ticket.destination,
        fareAmount: ticket.fareAmount,
        amountPaid: ticket.amountPaid,
        changeDue: ticket.changeDue,
        status: updatedTicket ? updatedTicket.status : 'CLAIMED',
        issuedAt: ticket.issuedAt,
      },
    });
  } catch (error: any) {
    console.error('Error claiming QR code:', error);
    res.status(500).json({
      success: false,
      errorCode: 'CLAIM_FAILED',
      error: 'An unexpected internal error occurred while claiming the QR code',
    });
  }
};
