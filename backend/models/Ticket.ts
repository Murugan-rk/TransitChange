import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    conductorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // The passenger might not be registered when the ticket is issued,
    // so this is optional and can be linked later when the QR is claimed.
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trip',
      index: true,
    },
    busNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: 'TN-58-N-1234',
    },
    source: {
      type: String,
      required: true,
      trim: true,
      default: 'Madurai',
    },
    destination: {
      type: String,
      required: true,
      trim: true,
      default: 'Sivakasi',
    },
    fareAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    changeDue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['ISSUED', 'CLAIMED', 'COMPLETED', 'CANCELLED'],
      default: 'ISSUED',
      index: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const Ticket = mongoose.model('Ticket', ticketSchema);
export default Ticket;
