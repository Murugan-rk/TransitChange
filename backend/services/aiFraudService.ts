import mongoose from 'mongoose';
import Ticket from '../models/Ticket';
import QRTransaction from '../models/QRTransaction';

export interface AiEvaluationResult {
  fraudScore: number;
  riskTier: 'LOW_RISK' | 'HIGH_RISK';
  isFraud: boolean;
  modelType: string;
  flagReasons: string[];
  isFallback: boolean;
}

export interface FeatureVector {
  refund_amount: number;
  fare: number;
  change_amount: number;
  passenger_frequency: number;
  conductor_refund_rate: number;
  duplicate_qr_attempts: number;
  time_gap: number;
  previous_refund_count: number;
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const AI_TIMEOUT_MS = 8000; // 8-second timeout to accommodate remote Atlas round-trips and local IPC

/**
 * Aggregates runtime transit telemetry and historical behavioral features
 * from MongoDB Atlas collections for a given ticket and passenger.
 */
export async function extractTelemetryFeatures(
  ticketId: mongoose.Types.ObjectId,
  passengerId: mongoose.Types.ObjectId,
  duplicateAttemptsOverride?: number
): Promise<FeatureVector> {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    throw new Error('TICKET_NOT_FOUND_FOR_FEATURE_EXTRACTION');
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 1. Passenger claim frequency in the last 24 hours
  const passengerFrequency = await QRTransaction.countDocuments({
    claimedBy: passengerId,
    claimedAt: { $gte: twentyFourHoursAgo },
  });

  // 2. Historical settled refunds for this passenger
  const previousRefundCount = await QRTransaction.countDocuments({
    claimedBy: passengerId,
    status: 'REDEEMED',
  });

  // 3. Conductor refund rate (tickets with changeDue > 0 vs total tickets)
  const conductorTickets = await Ticket.find({ conductorId: ticket.conductorId }).select('changeDue');
  let conductorRefundRate = 0.25; // default fallback
  if (conductorTickets.length > 0) {
    const refundTickets = conductorTickets.filter((t) => t.changeDue > 0).length;
    conductorRefundRate = Number((refundTickets / conductorTickets.length).toFixed(3));
  }

  // 4. Time gap in seconds between ticket issuance and claim
  const issuedTime = ticket.issuedAt ? new Date(ticket.issuedAt).getTime() : now.getTime();
  const timeGapSeconds = Math.max(1, Math.floor((now.getTime() - issuedTime) / 1000));

  // 5. Duplicate attempts recorded (default 0 unless passed from caller)
  const duplicateAttempts = duplicateAttemptsOverride ?? 0;

  return {
    refund_amount: Number(ticket.changeDue.toFixed(2)),
    fare: Number(ticket.fareAmount.toFixed(2)),
    change_amount: Number(ticket.changeDue.toFixed(2)),
    passenger_frequency: passengerFrequency,
    conductor_refund_rate: conductorRefundRate,
    duplicate_qr_attempts: duplicateAttempts,
    time_gap: timeGapSeconds,
    previous_refund_count: previousRefundCount,
  };
}

/**
 * Sanitizes raw AI score and enforces strict bounds [0.0, 1.0].
 * Fails closed to 0.99 HIGH_RISK on NaN, Infinity, strings, negative, or > 1.0.
 * Strictly classifies score >= 0.50 as HIGH_RISK.
 */
export function sanitizeScoreAndTier(rawScore: any, riskTierHint?: string): {
  fraudScore: number;
  isFraud: boolean;
  riskTier: 'LOW_RISK' | 'HIGH_RISK';
  isInvalid: boolean;
} {
  const isValidScore =
    typeof rawScore === 'number' &&
    !isNaN(rawScore) &&
    Number.isFinite(rawScore) &&
    rawScore >= 0.0 &&
    rawScore <= 1.0;

  if (isValidScore) {
    const isFraud = rawScore >= 0.50;
    const riskTier = isFraud ? 'HIGH_RISK' : (riskTierHint === 'LOW_RISK' ? 'LOW_RISK' : 'HIGH_RISK');
    return { fraudScore: rawScore, isFraud, riskTier, isInvalid: false };
  } else {
    return { fraudScore: 0.99, isFraud: true, riskTier: 'HIGH_RISK', isInvalid: true };
  }
}

/**
 * Evaluates Layer 2 AI Risk for a claim.
 * Calls Python FastAPI microservice.
 * Strictly FAILS CLOSED: if AI service is down or times out, marks as HIGH_RISK
 * to prevent silent exploitation or unauthorized automatic disbursement.
 */
export async function evaluateClaimRisk(
  features: FeatureVector
): Promise<AiEvaluationResult> {
  const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

    const response = await fetch(`${aiServiceUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AI_SERVICE_HTTP_ERROR: Status ${response.status}`);
    }

    const data: any = await response.json();

    const sanitized = sanitizeScoreAndTier(data?.fraud_score, data?.risk_tier);
    let flagReasons: string[] = Array.isArray(data?.flag_reasons) ? [...data.flag_reasons] : [];
    if (sanitized.isInvalid) {
      flagReasons.unshift(`AI_INVALID_SCORE: Malformed or out-of-bounds score (${data?.fraud_score}) received from AI service`);
    }

    const modelType = data?.model_type || 'Unknown';

    return {
      fraudScore: sanitized.fraudScore,
      riskTier: sanitized.riskTier,
      isFraud: sanitized.isFraud,
      modelType,
      flagReasons,
      isFallback: false,
    };
  } catch (error: any) {
    console.warn(`[AI Fraud Service] AI prediction unavailable or failed (${error.message}). Failing closed for safety.`);

    // Fail-Closed: Never silently complete an uninspected refund!
    return {
      fraudScore: 0.99,
      riskTier: 'HIGH_RISK',
      isFraud: true,
      modelType: 'SafetyFailClosedFallback',
      flagReasons: ['AI Service unavailable: automated disbursement suspended for manual audit.'],
      isFallback: true,
    };
  }
}
