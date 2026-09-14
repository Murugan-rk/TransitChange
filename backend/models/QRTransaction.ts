import mongoose from 'mongoose';

const qrTransactionSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
      unique: true, // One QR code per ticket
      index: true,
    },
    qrCodeString: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    nonce: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    signature: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'CLAIMED', 'REFUND_PENDING', 'MANUAL_REVIEW', 'REDEEMED', 'EXPIRED', 'FAILED'],
      default: 'ACTIVE',
      index: true,
    },
    claimedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    upiId: {
      type: String,
    },
    isFraudulent: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
    claimedAt: {
      type: Date,
    },
    redeemedAt: {
      type: Date,
    },
    fraudScore: {
      type: Number,
    },
    flagReason: {
      type: String,
    },
    mockUpiRef: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const QRTransaction = mongoose.model('QRTransaction', qrTransactionSchema);
export default QRTransaction;
