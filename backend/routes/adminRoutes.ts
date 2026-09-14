import express from 'express';
import {
  getFraudQueue,
  reviewFraudClaim,
  getAdminAnalytics,
} from '../controllers/adminController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

// All routes here strictly require Admin authentication
router.use(protect);
router.use(authorize('Admin'));

router.get('/fraud-queue', getFraudQueue);
router.post('/review/:fraudLogId', reviewFraudClaim);
router.get('/analytics', getAdminAnalytics);

export default router;
