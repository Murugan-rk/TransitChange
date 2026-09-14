import express from 'express';
import { claimQr } from '../controllers/qrController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// Only authenticated Passengers can claim change tickets
router.post('/claim', protect, authorize('Passenger'), claimQr);

export default router;
