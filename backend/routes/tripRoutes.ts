import express from 'express';
import { startTrip, getActiveTrip, endTrip } from '../controllers/tripController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// All trip management endpoints are restricted to authenticated conductors
router.post('/start', protect, authorize('Conductor'), startTrip);
router.get('/active', protect, authorize('Conductor'), getActiveTrip);
router.post('/end', protect, authorize('Conductor'), endTrip);

export default router;
