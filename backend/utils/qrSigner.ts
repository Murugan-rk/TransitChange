import crypto from 'crypto';

export interface QrPayloadData {
  ticketId: string;
  busNumber: string;
  source: string;
  destination: string;
  changeAmount: number;
  date: string;
  timestamp: string;
  nonce: string;
  signature: string;
}

const getSecret = (): string => {
  const secret = process.env.QR_SIGNING_SECRET;
  if (!secret) {
    throw new Error('QR_SIGNING_SECRET is not configured in environment variables');
  }
  return secret;
};

/**
 * Builds deterministic, canonical data string for HMAC-SHA256 signing and verification.
 * Format: <ticketId>|<busNumber>|<source>|<destination>|<normalizedChangeAmount>|<date>|<timestamp>|<nonce>
 */
export const buildCanonicalData = (
  ticketId: string,
  busNumber: string,
  source: string,
  destination: string,
  changeAmount: number,
  date: string,
  timestamp: string,
  nonce: string
): string => {
  const normalizedAmount = Number(changeAmount).toFixed(2);
  return `${ticketId}|${busNumber}|${source}|${destination}|${normalizedAmount}|${date}|${timestamp}|${nonce}`;
};

/**
 * Computes an HMAC-SHA256 signature for the given canonical string.
 */
export const signData = (data: string): string => {
  return crypto.createHmac('sha256', getSecret()).update(data).digest('hex');
};

/**
 * Generates a unique, tamper-resistant, signed QR payload.
 */
export const createSignedQrPayload = (
  ticketId: string,
  changeAmount: number,
  busNumber: string = 'TN-58-N-1234',
  source: string = 'Madurai',
  destination: string = 'Sivakasi',
  date: string = new Date().toISOString().slice(0, 10)
): {
  payloadString: string;
  payloadObject: QrPayloadData;
  nonce: string;
  signature: string;
  timestamp: string;
  date: string;
  busNumber: string;
  source: string;
  destination: string;
} => {
  const timestamp = new Date().toISOString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const dataToSign = buildCanonicalData(
    ticketId,
    busNumber,
    source,
    destination,
    changeAmount,
    date,
    timestamp,
    nonce
  );
  const signature = signData(dataToSign);

  const payloadObj: QrPayloadData = {
    ticketId,
    busNumber,
    source,
    destination,
    changeAmount: Number(Number(changeAmount).toFixed(2)),
    date,
    timestamp,
    nonce,
    signature,
  };

  return {
    payloadString: JSON.stringify(payloadObj),
    payloadObject: payloadObj,
    nonce,
    signature,
    timestamp,
    date,
    busNumber,
    source,
    destination,
  };
};

/**
 * Verifies that a QR payload string or object has not been tampered with
 * using constant-time comparison against the server HMAC secret.
 */
export const verifyQrPayload = (
  payloadInput: string | QrPayloadData
): { valid: boolean; reason?: string; data?: QrPayloadData } => {
  try {
    const payload: any =
      typeof payloadInput === 'string' ? JSON.parse(payloadInput) : payloadInput;

    if (
      !payload.ticketId ||
      !payload.busNumber ||
      !payload.source ||
      !payload.destination ||
      payload.changeAmount === undefined ||
      !payload.date ||
      !payload.timestamp ||
      !payload.nonce ||
      !payload.signature
    ) {
      return { valid: false, reason: 'Missing required payload fields' };
    }

    const dataToSign = buildCanonicalData(
      payload.ticketId,
      payload.busNumber,
      payload.source,
      payload.destination,
      payload.changeAmount,
      payload.date,
      payload.timestamp,
      payload.nonce
    );
    const expectedSignature = signData(dataToSign);

    const sigBuffer = Buffer.from(payload.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { valid: false, reason: 'Invalid signature / payload tampered' };
    }

    return { valid: true, data: payload as QrPayloadData };
  } catch (err: any) {
    return { valid: false, reason: `Malformed payload: ${err.message}` };
  }
};
