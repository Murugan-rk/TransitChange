import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import Trip from '../models/Trip';
import User from '../models/User';

const startTripSchema = z.object({
  source: z.string().trim().min(1, 'Source is required'),
  destination: z.string().trim().min(1, 'Destination is required'),
  fareAmount: z.number().positive('Fare amount must be greater than 0').optional().default(15),
  busNumber: z.string().trim().optional(),
});

const generateTripId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TRP-${dateStr}-${rand}`;
};

// @desc    Start a new conductor trip
// @route   POST /api/trips/start
// @access  Private (Conductor only)
export const startTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = startTripSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid trip data',
      });
      return;
    }

    const { source, destination, fareAmount, busNumber: bodyBusNumber } = parseResult.data;
    const conductorId = req.user._id;

    // Conductor bus number from authenticated profile or body fallback
    const busNumber = (req.user.busNumber || bodyBusNumber)?.trim()?.toUpperCase();
    if (!busNumber) {
      res.status(400).json({
        success: false,
        error: 'Bus number is not configured on conductor profile. Please set up your bus first.',
      });
      return;
    }

    // If profile didn't have busNumber but body provided one, update user profile
    if (!req.user.busNumber && busNumber) {
      await User.findByIdAndUpdate(conductorId, { busNumber });
    }

    // Complete any existing active trip for this conductor
    await Trip.updateMany(
      { conductorId, status: 'ACTIVE' },
      { $set: { status: 'COMPLETED', endedAt: new Date() } }
    );

    let tripId = generateTripId();
    let existing = await Trip.findOne({ tripId });
    while (existing) {
      tripId = generateTripId();
      existing = await Trip.findOne({ tripId });
    }

    const trip = await Trip.create({
      tripId,
      conductorId,
      busNumber,
      source,
      destination,
      fareAmount,
      status: 'ACTIVE',
      startedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Trip started successfully',
      trip,
      data: trip,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get currently active trip for conductor
// @route   GET /api/trips/active
// @access  Private (Conductor only)
export const getActiveTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await Trip.findOne({ conductorId: req.user._id, status: 'ACTIVE' }).sort({
      startedAt: -1,
    });

    res.status(200).json({
      success: true,
      trip: trip || null,
      data: trip || null,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    End currently active trip
// @route   POST /api/trips/end
// @access  Private (Conductor only)
export const endTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await Trip.findOneAndUpdate(
      { conductorId: req.user._id, status: 'ACTIVE' },
      { $set: { status: 'COMPLETED', endedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!trip) {
      res.status(404).json({
        success: false,
        error: 'No active trip found to end',
      });
      return;
    }

    // Calculate tickets issued and total change during this trip
    const Ticket = (await import('../models/Ticket')).default;
    const ticketCount = await Ticket.countDocuments({
      $or: [{ tripId: trip._id }, { busNumber: trip.busNumber, issuedAt: { $gte: trip.startedAt } }],
    });
    const changeSum = await Ticket.aggregate([
      {
        $match: {
          $or: [{ tripId: trip._id }, { busNumber: trip.busNumber, issuedAt: { $gte: trip.startedAt } }],
        },
      },
      { $group: { _id: null, total: { $sum: '$changeDue' } } },
    ]);
    const totalChangeDispensed = changeSum[0]?.total || 0;

    const summary = {
      ...trip.toObject(),
      ticketCount,
      totalChangeDispensed,
    };

    res.status(200).json({
      success: true,
      message: 'Trip completed successfully',
      trip: summary,
      data: summary,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
