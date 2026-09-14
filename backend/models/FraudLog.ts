import mongoose from 'mongoose';

const fraudLogSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QRTransaction',
      required: true,
      index: true,
    },
    // The user who attempted the claim, if known
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    upiId: {
      type: String, // Useful if no registered passengerId exists
    },
    aiConfidenceScore: {
      type: Number, // Fraud probability returned by AI (e.g., 0.0 to 1.0)
      required: true,
    },
    flagReason: {
      type: String, // "High claim frequency", "Distance anomaly", etc.
    },
    adminReviewed: {
      type: Boolean,
      default: false,
    },
    adminDecision: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }
  },
  {
    timestamps: true,
  }
);

const FraudLog = mongoose.model('FraudLog', fraudLogSchema);
export default FraudLog;
