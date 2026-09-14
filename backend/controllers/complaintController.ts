import { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import Complaint from '../models/Complaint';
import Ticket from '../models/Ticket';
import QRTransaction from '../models/QRTransaction';

const createComplaintSchema = z.object({
  ticketNumber: z.string().trim().min(1, 'Ticket identifier is required'),
  category: z.enum([
    'QR did not work',
    'Change amount is incorrect',
    'Settlement/refund problem',
    'Ticket already claimed',
    'Other',
    'WRONG_CHANGE_AMOUNT',
    'QR_SCAN_FAILED',
    'REFUND_NOT_RECEIVED',
    'CONDUCTOR_DISPUTE',
    'OTHER',
  ]),
  description: z.string().trim().max(1000).optional(),
});

const generateComplaintId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `CMP-${dateStr}-${rand}`;
};

// @desc    Submit a complaint for a ticket transaction
// @route   POST /api/complaints
// @access  Private (Passenger only)
export const createComplaint = async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createComplaintSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: parseResult.error.issues[0]?.message || 'Invalid complaint data',
      });
      return;
    }

    const { ticketNumber, category, description } = parseResult.data;
    const passengerId = req.user._id;

    // 1. Locate ticket
    const ticket = await Ticket.findOne({ ticketNumber });
    if (!ticket) {
      res.status(404).json({
        success: false,
        error: 'Referenced transit ticket was not found',
      });
      return;
    }

    // 2. Locate associated QRTransaction to verify ownership
    const qrTransaction = await QRTransaction.findOne({ ticketId: ticket._id });

    // Strict passenger ownership check: must be claimed by or assigned to this passenger
    const isOwner =
      (ticket.passengerId && ticket.passengerId.toString() === passengerId.toString()) ||
      (qrTransaction?.claimedBy && qrTransaction.claimedBy.toString() === passengerId.toString());

    if (!isOwner) {
      res.status(403).json({
        success: false,
        error: 'You can only report issues against your own transit tickets',
      });
      return;
    }

    let complaintId = generateComplaintId();
    let existing = await Complaint.findOne({ complaintId });
    while (existing) {
      complaintId = generateComplaintId();
      existing = await Complaint.findOne({ complaintId });
    }

    const complaint = await Complaint.create({
      complaintId,
      ticketId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      passengerId,
      category,
      description: description || '',
      status: 'OPEN',
    });

    res.status(201).json({
      success: true,
      message: 'Complaint lodged successfully. Support team will review it.',
      complaint,
      data: complaint,
    });
  } catch (error: any) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all complaints lodged by the authenticated passenger
// @route   GET /api/complaints/my
// @access  Private (Passenger only)
export const getMyComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const passengerId = req.user._id;
    const complaints = await Complaint.find({ passengerId })
      .populate('ticketId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
      data: complaints,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get all complaints for administrative audit & review
// @route   GET /api/complaints/admin
// @access  Private (Admin only)
export const getAdminComplaints = async (req: Request, res: Response): Promise<void> => {
  try {
    const complaints = await Complaint.find()
      .populate('passengerId', 'fullName email mobileNumber')
      .populate('ticketId')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: complaints.length,
      complaints,
      data: complaints,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update complaint status and admin review notes
// @route   PATCH /api/complaints/admin/:id
// @access  Private (Admin only)
export const updateComplaintStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED'].includes(status)) {
      res.status(400).json({
        success: false,
        error: 'Invalid status. Must be OPEN, IN_REVIEW, RESOLVED, or REJECTED',
      });
      return;
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      res.status(404).json({ success: false, error: 'Complaint record not found' });
      return;
    }

    complaint.status = status;
    if (adminNotes !== undefined) complaint.adminNotes = adminNotes;
    if (status === 'RESOLVED' || status === 'REJECTED') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.user._id;
    }

    await complaint.save();

    res.status(200).json({
      success: true,
      message: `Complaint marked as ${status}`,
      complaint,
      data: complaint,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
