import { Request, Response } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import Ticket from '../models/Ticket';
import QRTransaction from '../models/QRTransaction';
import Trip from '../models/Trip';
import { createSignedQrPayload } from '../utils/qrSigner';

const isTwoDecimalPlaces = (val: number): boolean => {
  return /^\d+(\.\d{1,2})?$/.test(val.toString());
};

const issueTicketSchema = z
  .object({
    fareAmount: z
      .number({ message: 'Fare amount must be a number' })
      .positive({ message: 'Fare amount must be greater than 0' })
      .finite({ message: 'Fare amount must be a finite number' })
      .refine(isTwoDecimalPlaces, {
        message: 'Fare amount cannot have more than 2 decimal places',
      }),
    amountPaid: z
      .number({ message: 'Amount paid must be a number' })
      .positive({ message: 'Amount paid must be greater than 0' })
      .finite({ message: 'Amount paid must be a finite number' })
      .refine(isTwoDecimalPlaces, {
        message: 'Amount paid cannot have more than 2 decimal places',
      }),
  })
  .refine((data) => data.amountPaid >= data.fareAmount, {
    message: 'Amount paid must be greater than or equal to fare amount',
    path: ['amountPaid'],
  });

/**
 * Helper to generate a unique ticket identifier: TC-YYYYMMDD-XXXXXX
 */
const generateTicketId = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TC-${dateStr}-${randomHex}`;
};

// @desc    Issue change ticket and generate secure single-use QR
// @route   POST /api/tickets/issue
// @access  Private (Conductor only)
export const issueTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validate request body
    const validationResult = issueTicketSchema.safeParse(req.body);
    if (!validationResult.success) {
      const firstError = validationResult.error.issues[0]?.message || 'Invalid input data';
      res.status(400).json({
        success: false,
        error: firstError,
        details: validationResult.error.flatten(),
      });
      return;
    }

    const { fareAmount, amountPaid } = validationResult.data;

    // Feature 3: Server-side zero change validation
    const changeDueCents = Math.round(amountPaid * 100) - Math.round(fareAmount * 100);
    const changeDue = Number((changeDueCents / 100).toFixed(2));

    if (changeDue === 0 || amountPaid === fareAmount) {
      res.status(400).json({
        success: false,
        errorCode: 'EXACT_FARE_RECEIVED',
        error: 'Exact fare received — no change ticket required.',
      });
      return;
    }

    // 3. Conductor ID strictly taken from authenticated req.user
    const conductorId = req.user._id;

    // Feature 2 & 4: Link ticket to active trip or conductor bus profile
    const activeTrip = await Trip.findOne({ conductorId, status: 'ACTIVE' });
    const tripId = activeTrip ? activeTrip._id : undefined;
    const busNumber = activeTrip?.busNumber || req.user.busNumber || 'TN-58-N-1234';
    const source = activeTrip?.source || 'Madurai';
    const destination = activeTrip?.destination || 'Sivakasi';
    const dateStr = new Date().toISOString().slice(0, 10);

    // 4. Generate unique Ticket Number (TC-YYYYMMDD-XXXXXX)
    let ticketNumber = generateTicketId();
    let existingTicket = await Ticket.findOne({ ticketNumber });
    while (existingTicket) {
      ticketNumber = generateTicketId();
      existingTicket = await Ticket.findOne({ ticketNumber });
    }

    // 5. Generate cryptographic signed QR payload covering all canonical fields
    const { payloadString, nonce, signature } = createSignedQrPayload(
      ticketNumber,
      changeDue,
      busNumber,
      source,
      destination,
      dateStr
    );

    // 6. Failure-safe creation of Ticket + QRTransaction
    let ticket: any = null;
    let qrTransaction: any = null;

    // Check if topology supports replica-set transactions
    const client = mongoose.connection.getClient();
    const topologyType = (client as any)?.topology?.description?.type;
    const supportsTransactions =
      topologyType === 'ReplicaSetWithPrimary' ||
      topologyType === 'ReplicaSetNoPrimary' ||
      topologyType === 'Sharded';

    if (supportsTransactions) {
      let session: mongoose.ClientSession | null = null;
      try {
        session = await mongoose.startSession();
        session.startTransaction();

        const tickets = await Ticket.create(
          [
            {
              ticketNumber,
              conductorId,
              tripId,
              busNumber,
              source,
              destination,
              fareAmount,
              amountPaid,
              changeDue,
              status: 'ISSUED',
              issuedAt: new Date(),
            },
          ],
          { session }
        );
        ticket = tickets[0];

        const qrTransactions = await QRTransaction.create(
          [
            {
              ticketId: ticket._id,
              qrCodeString: payloadString,
              nonce,
              signature,
              status: 'ACTIVE',
              isFraudulent: false,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours validity
            },
          ],
          { session }
        );
        qrTransaction = qrTransactions[0];

        await session.commitTransaction();
      } catch (txErr: any) {
        if (session && session.inTransaction()) {
          await session.abortTransaction();
        }
        ticket = null;
        qrTransaction = null;
      } finally {
        if (session) {
          session.endSession();
        }
      }
    }

    // Fallback if session wasn't executed or topology does not support sessions
    if (!ticket || !qrTransaction) {
      ticket = await Ticket.create({
        ticketNumber,
        conductorId,
        tripId,
        busNumber,
        source,
        destination,
        fareAmount,
        amountPaid,
        changeDue,
        status: 'ISSUED',
        issuedAt: new Date(),
      });

      try {
        qrTransaction = await QRTransaction.create({
          ticketId: ticket._id,
          qrCodeString: payloadString,
          nonce,
          signature,
          status: 'ACTIVE',
          isFraudulent: false,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
      } catch (qrErr) {
        await Ticket.findByIdAndDelete(ticket._id);
        throw qrErr;
      }
    }

    // 7. Optionally emit real-time event via socket.io
    if (req.io) {
      req.io.emit('ticket:issued', {
        ticketId: ticket.ticketNumber,
        busNumber: ticket.busNumber,
        source: ticket.source,
        destination: ticket.destination,
        fareAmount: ticket.fareAmount,
        amountPaid: ticket.amountPaid,
        changeDue: ticket.changeDue,
        issuedAt: ticket.issuedAt,
      });
    }

    // 8. Return clean response with digital receipt metadata
    res.status(201).json({
      success: true,
      message: 'Change ticket created successfully',
      ticket: {
        ticketId: ticket.ticketNumber,
        ticketNumber: ticket.ticketNumber,
        busNumber: ticket.busNumber,
        source: ticket.source,
        destination: ticket.destination,
        fareAmount: ticket.fareAmount,
        amountPaid: ticket.amountPaid,
        changeDue: ticket.changeDue,
        issuedAt: ticket.issuedAt,
        status: ticket.status,
      },
      qr: {
        payload: payloadString,
        status: qrTransaction.status,
      },
      disclaimer: 'Demo / Simulated Transaction — No real money was transferred.',
    });
  } catch (error: any) {
    console.error('Error issuing ticket:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to issue ticket',
    });
  }
};

// @desc    Get ticket issuance history for the authenticated conductor
// @route   GET /api/tickets/conductor/history
// @access  Private (Conductor only)
export const getConductorHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const conductorId = req.user._id;
    const tickets = await Ticket.find({ conductorId })
      .sort({ issuedAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: tickets.length,
      tickets,
      data: tickets,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get transaction history for the authenticated passenger
// @route   GET /api/tickets/passenger/history
// @access  Private (Passenger only)
export const getPassengerHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const passengerId = req.user._id;

    // Find all QR transactions claimed by this passenger
    const qrTransactions = await QRTransaction.find({ claimedBy: passengerId })
      .populate('ticketId')
      .sort({ updatedAt: -1 })
      .limit(100);

    const history = qrTransactions
      .filter((qr) => qr.ticketId)
      .map((qr: any) => {
        const t = qr.ticketId;
        return {
          transactionId: qr._id,
          ticketNumber: t.ticketNumber,
          ticketId: t._id,
          busNumber: t.busNumber || 'TN-58-N-1234',
          source: t.source || 'Madurai',
          destination: t.destination || 'Sivakasi',
          fareAmount: t.fareAmount,
          amountPaid: t.amountPaid,
          changeDue: t.changeDue,
          status: qr.status,
          ticketStatus: t.status,
          claimedAt: qr.claimedAt,
          redeemedAt: qr.redeemedAt,
          upiId: qr.upiId,
          mockUpiRef: qr.mockUpiRef,
          fraudScore: qr.fraudScore,
          issuedAt: t.issuedAt,
        };
      });

    res.status(200).json({
      success: true,
      count: history.length,
      tickets: history,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
