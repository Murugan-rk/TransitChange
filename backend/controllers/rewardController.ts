import { Request, Response } from 'express';
import crypto from 'crypto';
import Reward from '../models/Reward';
import Ticket from '../models/Ticket';

const REWARD_DISCLAIMER =
  'Demo Reward: Simulated academic demonstration — No real money or bank transfer is involved.';

export const pickRandomRewardAmount = (): number => {
  const rand = Math.random();
  if (rand < 0.5) return 0;
  if (rand < 0.85) return 5;
  return 10;
};

const generateRewardId = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `RWD-${dateStr}-${rand}`;
};

/**
 * Checks repeat-bus travel eligibility and atomically grants a scratch reward if qualified.
 */
export const evaluateAndGrantRepeatReward = async (
  passengerId: any,
  busNumber: string,
  ticketId: any
): Promise<any | null> => {
  if (!passengerId || !busNumber || !ticketId) return null;

  try {
    // Check if the passenger completed prior transactions on this same bus
    const priorCompletedCount = await Ticket.countDocuments({
      passengerId,
      busNumber,
      status: 'COMPLETED',
      _id: { $ne: ticketId },
    });

    if (priorCompletedCount >= 1) {
      // Check if reward already granted for this qualifying ticket
      const existing = await Reward.findOne({ triggerTicketId: ticketId });
      if (existing) return existing;

      let rewardId = generateRewardId();
      let collision = await Reward.findOne({ rewardId });
      while (collision) {
        rewardId = generateRewardId();
        collision = await Reward.findOne({ rewardId });
      }

      const rewardAmount = pickRandomRewardAmount();

      const newReward = await Reward.create({
        rewardId,
        passengerId,
        busNumber,
        triggerTicketId: ticketId,
        rewardAmount,
        status: 'AVAILABLE',
      });

      return newReward;
    }
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate key: another concurrent worker already created the reward for this ticket
      return await Reward.findOne({ triggerTicketId: ticketId });
    }
    console.warn('Error evaluating repeat-bus reward:', err.message);
  }
  return null;
};

// @desc    Get all gamification rewards for the authenticated passenger
// @route   GET /api/rewards/my
// @access  Private (Passenger only)
export const getMyRewards = async (req: Request, res: Response): Promise<void> => {
  try {
    const passengerId = req.user._id;
    const rewards = await Reward.find({ passengerId }).sort({ createdAt: -1 });

    const available = rewards.filter((r) => r.status === 'AVAILABLE');
    const scratched = rewards.filter((r) => r.status === 'SCRATCHED');
    const claimed = rewards.filter((r) => r.status === 'CLAIMED');

    res.status(200).json({
      success: true,
      count: rewards.length,
      rewards,
      data: {
        all: rewards,
        available,
        scratched,
        claimed,
      },
      disclaimer: REWARD_DISCLAIMER,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Scratch an available reward card to reveal amount
// @route   POST /api/rewards/:id/scratch
// @access  Private (Passenger only)
export const scratchReward = async (req: Request, res: Response): Promise<void> => {
  try {
    const passengerId = req.user._id;
    const id = String(req.params.id);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const reward = await Reward.findOne({
      $or: [{ _id: isObjectId ? id : undefined }, { rewardId: id }],
      passengerId,
    });

    if (!reward) {
      res.status(404).json({ success: false, error: 'Reward card not found' });
      return;
    }

    if (reward.status !== 'AVAILABLE') {
      res.status(400).json({
        success: false,
        error: `This reward has already been scratched (Status: ${reward.status})`,
        data: reward,
      });
      return;
    }

    reward.status = 'SCRATCHED';
    reward.scratchedAt = new Date();
    await reward.save();

    res.status(200).json({
      success: true,
      message: `🎉 Demo Reward: ₹${reward.rewardAmount}`,
      data: reward,
      disclaimer: 'Demo / Simulated Reward — No real money was transferred.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Claim scratched reward
// @route   POST /api/rewards/:id/claim
// @access  Private (Passenger only)
export const claimReward = async (req: Request, res: Response): Promise<void> => {
  try {
    const passengerId = req.user._id;
    const id = String(req.params.id);
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

    const reward = await Reward.findOne({
      $or: [{ _id: isObjectId ? id : undefined }, { rewardId: id }],
      passengerId,
    });

    if (!reward) {
      res.status(404).json({ success: false, error: 'Reward card not found' });
      return;
    }

    if (reward.status === 'CLAIMED') {
      res.status(400).json({
        success: false,
        error: 'This reward has already been claimed',
      });
      return;
    }

    reward.status = 'CLAIMED';
    reward.claimedAt = new Date();
    await reward.save();

    res.status(200).json({
      success: true,
      message: 'Demo reward claimed successfully',
      data: reward,
      disclaimer: 'Demo / Simulated Reward — No real money was transferred.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
