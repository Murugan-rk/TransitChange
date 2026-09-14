import express from 'express';
import {
  getMyRewards,
  scratchReward,
  claimReward,
} from '../controllers/rewardController';
import { protect, authorize } from '../middlewares/authMiddleware';

const router = express.Router();

router.get('/my', protect, authorize('Passenger'), getMyRewards);
router.post('/:id/scratch', protect, authorize('Passenger'), scratchReward);
router.post('/:id/claim', protect, authorize('Passenger'), claimReward);

export default router;
