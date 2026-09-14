import mongoose from 'mongoose';

const rewardSchema = new mongoose.Schema(
  {
    rewardId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    busNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    triggerTicketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      unique: true, // Guarantees at database level that duplicate rewards cannot be issued for the same ride
      index: true,
    },
    rewardAmount: {
      type: Number,
      required: true,
      enum: [0, 5, 10],
    },
    status: {
      type: String,
      enum: ['AVAILABLE', 'LOCKED', 'SCRATCHED', 'CLAIMED', 'EXPIRED'],
      default: 'AVAILABLE',
      index: true,
    },
    scratchedAt: {
      type: Date,
    },
    claimedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const Reward = mongoose.model('Reward', rewardSchema);
export default Reward;
