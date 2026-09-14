import crypto from 'crypto';

export interface MockUpiReceipt {
  success: boolean;
  txnRef: string;
  amount: number;
  upiId: string;
  timestamp: Date;
  isSimulated: true;
  disclaimer: string;
}

const UPI_DISCLAIMER = 'Demo / Simulated UPI Transaction — No real money is transferred.';

/**
 * Validates the basic syntax of a Virtual Payment Address (VPA / UPI ID)
 * e.g. passenger@okhdfcbank, 9876543210@paytm, user@upi
 */
export function validateUpiId(upiId: string): boolean {
  if (!upiId || typeof upiId !== 'string') return false;
  const trimmed = upiId.trim();
  // Standard VPA format: username@bankhandle (alphanumeric, dot, underscore, hyphen)
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9.\-_]{2,32}$/;
  return upiRegex.test(trimmed);
}

/**
 * Executes a simulated Mock UPI disbursement.
 * Strictly educational/prototype simulation: no bank connections or real currency involved.
 */
export async function disburseSimulatedRefund(
  upiId: string,
  amount: number,
  ticketNumber?: string
): Promise<MockUpiReceipt> {
  const sanitizedUpi = upiId.trim().toLowerCase();

  if (!validateUpiId(sanitizedUpi)) {
    throw new Error('INVALID_UPI_ID: The provided UPI ID is not in a valid VPA format (e.g. user@bank).');
  }

  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error('INVALID_REFUND_AMOUNT: Refund amount must be a positive number.');
  }

  // Simulate network dispatch latency (150ms)
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Generate an idempotent simulated NPCI transit settlement reference ID
  const suffix = ticketNumber
    ? crypto.createHash('sha256').update(ticketNumber).digest('hex').substring(0, 8).toUpperCase()
    : crypto.randomBytes(4).toString('hex').toUpperCase();
  const txnRef = `NPCI-SIM-${Date.now()}-${suffix}`;

  return {
    success: true,
    txnRef,
    amount: Number(amount.toFixed(2)),
    upiId: sanitizedUpi,
    timestamp: new Date(),
    isSimulated: true,
    disclaimer: UPI_DISCLAIMER,
  };
}
