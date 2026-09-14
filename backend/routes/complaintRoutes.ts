import express from 'express';
import {
  createComplaint,
  getMyComplaints,
  getAdminComplaints,
  updateComplaintStatus,
} from '../controllers/complaintController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// Passenger routes
router.post('/', protect, authorize('Passenger'), createComplaint);
router.get('/my', protect, authorize('Passenger'), getMyComplaints);
router.get('/passenger', protect, authorize('Passenger'), getMyComplaints);

// Admin review routes
router.get('/admin', protect, authorize('Admin'), getAdminComplaints);
router.patch('/admin/:id', protect, authorize('Admin'), updateComplaintStatus);

export default router;
