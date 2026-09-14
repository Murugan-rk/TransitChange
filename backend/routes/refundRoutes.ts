import express from 'express';
import { processRefund, getRefundStatus } from '../controllers/refundController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// Only authenticated Passengers can trigger refund processing
router.post('/process', protect, authorize('Passenger'), processRefund);

// Only authenticated Passengers can query their ticket refund status
router.get('/status/:ticketNumber', protect, authorize('Passenger'), getRefundStatus);

export default router;
