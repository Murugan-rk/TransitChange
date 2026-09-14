import express from 'express';
import {
  issueTicket,
  getConductorHistory,
  getPassengerHistory,
} from '../controllers/ticketController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// Only authenticated Conductors can issue tickets and view conductor history
router.post('/issue', protect, authorize('Conductor'), issueTicket);
router.get('/conductor/history', protect, authorize('Conductor'), getConductorHistory);

// Only authenticated Passengers can view their claimed ticket history
router.get('/passenger/history', protect, authorize('Passenger'), getPassengerHistory);

export default router;
