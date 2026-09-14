import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import User from './models/User';
import Ticket from './models/Ticket';
import QRTransaction from './models/QRTransaction';
import { createSignedQrPayload } from './utils/qrSigner';

const PORT = 5098;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

async function runPhase2Tests() {
  console.log('====================================================');
  console.log('  TRANSITCHANGE PHASE 2 VERIFICATION TEST SUITE');
  console.log('  Passenger QR Scan + Layer 1 Deterministic Validation');
  console.log('====================================================\n');

  // 1. Setup in-process Express test server
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/qr', qrRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  // Test mode: default to REAL ATLAS verification mode
  const isAtlasMode = !process.argv.includes('--memory') && process.env.TEST_MODE !== 'memory';
  let mongoMemoryServer: any = null;

  if (isAtlasMode) {
    console.log('[TEST MODE] REAL ATLAS VERIFICATION MODE (MongoMemoryServer is strictly DISABLED)');

    const envUri = process.env.MONGODB_URI;
    if (!envUri) {
      console.error('[DB] ❌ MONGODB_URI environment variable is required for this test.');
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. Configure MONGODB_URI in backend/.env or run with --memory.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }

    try {
      console.log('[DB] Attempting connection via MONGODB_URI (15s timeout)...');
      await mongoose.connect(envUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`[DB] ✅ MongoDB Atlas Connected successfully (Host: ${mongoose.connection.host})\n`);
    } catch (err: any) {
      console.error(`[DB] ❌ MongoDB Atlas connection failed: ${err.message}`);
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. MongoMemoryServer will NOT be used.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }
  } else {
    console.log('[TEST MODE] OFFLINE / ISOLATED MEMORY MODE');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoMemoryServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const uri = mongoMemoryServer.getUri();
    await mongoose.connect(uri);
    console.log(`[DB] MongoMemoryServer connected at ${uri}\n`);
  }

  // Tracking test-created IDs for non-destructive teardown
  const testUserIds: any[] = [];
  const testTicketNumbers: string[] = [];
  const testTicketIds: any[] = [];

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || 'Assertion failed'}`);
      failedCount++;
    }
  }

  try {
    // 2. Setup Test Users
    const conductorEmail = `conductor_p2_${Date.now()}@example.com`;
    const passengerEmail = `passenger_p2_${Date.now()}@example.com`;
    const secondPassengerEmail = `passenger2_p2_${Date.now()}@example.com`;

    const conductorUser = await User.create({
      fullName: 'Conductor Phase2 Test',
      email: conductorEmail,
      mobileNumber: `911${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      role: 'Conductor',
      staffId: 'STF-P2-01',
    });

    const passengerUser = await User.create({
      fullName: 'Passenger Phase2 Test',
      email: passengerEmail,
      mobileNumber: `922${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      role: 'Passenger',
    });

    const secondPassengerUser = await User.create({
      fullName: 'Second Passenger Phase2 Test',
      email: secondPassengerEmail,
      mobileNumber: `933${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      role: 'Passenger',
    });

    testUserIds.push(conductorUser._id, passengerUser._id, secondPassengerUser._id);

    const conductorToken = jwt.sign(
      { id: conductorUser._id.toString(), role: conductorUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const passengerToken = jwt.sign(
      { id: passengerUser._id.toString(), role: passengerUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const secondPassengerToken = jwt.sign(
      { id: secondPassengerUser._id.toString(), role: secondPassengerUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    // =========================================================================
    // SCENARIO 1: Conductor issues a valid ticket (fare=25, paid=30 -> change=5)
    // =========================================================================
    console.log('--- Test 1: Conductor issues ticket for Phase 2 claiming ---');
    const issueRes1 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 25, amountPaid: 30 }),
    });
    const issueData1: any = await issueRes1.json();
    assert(
      issueRes1.status === 201 && issueData1.success === true,
      'Test 1: Conductor successfully issues change ticket (HTTP 201)',
      `Status was ${issueRes1.status}`
    );

    const ticketNumber1 = issueData1.ticket.ticketId;
    const qrPayloadStr1 = issueData1.qr.payload;
    testTicketNumbers.push(ticketNumber1);

    // =========================================================================
    // SCENARIO 2: Valid passenger claim with signed QR payload
    // =========================================================================
    console.log('\n--- Test 2: Passenger claims ticket with valid signed QR ---');
    const claimRes1 = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr1 }),
    });
    const claimData1: any = await claimRes1.json();
    assert(
      claimRes1.status === 200 && claimData1.success === true,
      'Test 2: Valid claim returns HTTP 200 with success status',
      `Got status ${claimRes1.status}: ${JSON.stringify(claimData1)}`
    );
    assert(
      claimData1.claim?.changeDue === 5 &&
        claimData1.claim?.status === 'CLAIMED' &&
        claimData1.ticket?.ticketNumber === ticketNumber1 &&
        claimData1.ticket?.status === 'CLAIMED',
      'Test 2b: Claim response contains trusted database receipt data',
      `Claim payload response: ${JSON.stringify(claimData1.claim)}`
    );

    // =========================================================================
    // SCENARIO 3: Verify database persistence and state transitions in MongoDB
    // =========================================================================
    console.log('\n--- Test 3: Database persistence verification ---');
    const dbTicket1 = await Ticket.findOne({ ticketNumber: ticketNumber1 });
    if (dbTicket1) testTicketIds.push(dbTicket1._id);
    const dbQr1 = await QRTransaction.findOne({ ticketId: dbTicket1?._id });

    assert(
      dbTicket1?.status === 'CLAIMED' &&
        dbTicket1?.passengerId?.toString() === passengerUser._id.toString(),
      'Test 3a: Ticket.status transitioned to CLAIMED and passengerId recorded in DB',
      `Status: ${dbTicket1?.status}, PassengerId: ${dbTicket1?.passengerId}`
    );
    assert(
      dbQr1?.status === 'CLAIMED' &&
        dbQr1?.claimedBy?.toString() === passengerUser._id.toString() &&
        dbQr1?.claimedAt !== null &&
        dbQr1?.claimedAt !== undefined,
      'Test 3b: QRTransaction.status transitioned to CLAIMED with claimedBy and claimedAt',
      `QR Status: ${dbQr1?.status}, ClaimedBy: ${dbQr1?.claimedBy}`
    );

    // =========================================================================
    // SCENARIO 4: Invalid QR payload string (malformed JSON)
    // =========================================================================
    console.log('\n--- Test 4: Reject malformed QR JSON string ---');
    const claimResMalformed = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: '{"ticketId": "TC-123", invalid_json' }),
    });
    const dataMalformed: any = await claimResMalformed.json();
    assert(
      claimResMalformed.status === 400 && dataMalformed.errorCode === 'INVALID_PAYLOAD',
      'Test 4: Malformed JSON string rejected with 400 and INVALID_PAYLOAD',
      `Got status ${claimResMalformed.status}, code: ${dataMalformed.errorCode}`
    );

    // =========================================================================
    // SCENARIO 5: Missing required fields in QR payload
    // =========================================================================
    console.log('\n--- Test 5: Missing required fields in QR payload ---');
    const claimResMissingFields = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        qrPayload: { ticketId: ticketNumber1, changeAmount: 5 }, // missing nonce, timestamp, signature
      }),
    });
    const dataMissingFields: any = await claimResMissingFields.json();
    assert(
      claimResMissingFields.status === 400 && dataMissingFields.errorCode === 'INVALID_PAYLOAD',
      'Test 5: Incomplete payload rejected with 400 and INVALID_PAYLOAD',
      `Got status ${claimResMissingFields.status}, code: ${dataMissingFields.errorCode}`
    );

    // =========================================================================
    // SCENARIO 6: Invalid HMAC signature
    // =========================================================================
    console.log('\n--- Test 6: Invalid HMAC cryptographic signature ---');
    const originalPayload1 = JSON.parse(qrPayloadStr1);
    const tamperedSigPayload = {
      ...originalPayload1,
      signature: 'badc0ffee0000000000000000000000000000000000000000000000000000000',
    };
    const claimResBadSig = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: tamperedSigPayload }),
    });
    const dataBadSig: any = await claimResBadSig.json();
    assert(
      claimResBadSig.status === 400 && dataBadSig.errorCode === 'INVALID_SIGNATURE',
      'Test 6: Invalid signature rejected with 400 and INVALID_SIGNATURE',
      `Got status ${claimResBadSig.status}, code: ${dataBadSig.errorCode}`
    );

    // =========================================================================
    // SCENARIO 7: Tampered changeAmount in payload (with original signature)
    // =========================================================================
    console.log('\n--- Test 7: Tampered changeAmount in payload ---');
    const tamperedAmountPayload = {
      ...originalPayload1,
      changeAmount: 500, // Tampered from 5 to 500
    };
    const claimResTamperedAmount = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: tamperedAmountPayload }),
    });
    const dataTamperedAmount: any = await claimResTamperedAmount.json();
    assert(
      claimResTamperedAmount.status === 400 && dataTamperedAmount.errorCode === 'INVALID_SIGNATURE',
      'Test 7: Tampered change amount fails signature verification with INVALID_SIGNATURE',
      `Got status ${claimResTamperedAmount.status}, code: ${dataTamperedAmount.errorCode}`
    );

    // =========================================================================
    // SCENARIO 8: Unknown ticket number (properly signed for non-existent ticket)
    // =========================================================================
    console.log('\n--- Test 8: Non-existent ticket number lookup ---');
    const nonExistentTicketSigned = createSignedQrPayload(
      'TC-20260911-999999',
      10
    );
    const claimResNonExistent = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: nonExistentTicketSigned.payloadString }),
    });
    const dataNonExistent: any = await claimResNonExistent.json();
    assert(
      claimResNonExistent.status === 404 && dataNonExistent.errorCode === 'TICKET_NOT_FOUND',
      'Test 8: Non-existent ticket rejected with 404 and TICKET_NOT_FOUND',
      `Got status ${claimResNonExistent.status}, code: ${dataNonExistent.errorCode}`
    );

    // =========================================================================
    // SCENARIO 9: Ticket data discrepancy (ticket changeDue != QR changeAmount)
    // =========================================================================
    console.log('\n--- Test 9: Ticket data discrepancy check ---');
    // Issue a new ticket with changeDue=8 (fare 12, paid 20)
    const issueResDisc = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 12, amountPaid: 20 }),
    });
    const issueDataDisc: any = await issueResDisc.json();
    const discTicketNumber = issueDataDisc.ticket.ticketId;
    testTicketNumbers.push(discTicketNumber);

    // Sign a payload pointing to discTicketNumber but claiming amount is 15 instead of 8
    const discSigned = createSignedQrPayload(
      discTicketNumber,
      15
    );
    const claimResDisc = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: discSigned.payloadString }),
    });
    const dataDisc: any = await claimResDisc.json();
    assert(
      claimResDisc.status === 400 && dataDisc.errorCode === 'INVALID_TICKET_DATA',
      'Test 9: Change amount discrepancy rejected with 400 and INVALID_TICKET_DATA',
      `Got status ${claimResDisc.status}, code: ${dataDisc.errorCode}`
    );

    // =========================================================================
    // SCENARIO 10: Expired QR token
    // =========================================================================
    console.log('\n--- Test 10: Expired QR token rejection ---');
    // Issue a new ticket
    const issueResExp = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 15, amountPaid: 20 }),
    });
    const issueDataExp: any = await issueResExp.json();
    const expTicketNumber = issueDataExp.ticket.ticketId;
    testTicketNumbers.push(expTicketNumber);

    // Artificially expire the QRTransaction in MongoDB
    const expTicketDoc = await Ticket.findOne({ ticketNumber: expTicketNumber });
    if (expTicketDoc) {
      testTicketIds.push(expTicketDoc._id);
      await QRTransaction.updateOne(
        { ticketId: expTicketDoc._id },
        { expiresAt: new Date(Date.now() - 60000) } // 1 minute in the past
      );
    }

    const claimResExp = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issueDataExp.qr.payload }),
    });
    const dataExp: any = await claimResExp.json();
    assert(
      claimResExp.status === 400 && dataExp.errorCode === 'EXPIRED',
      'Test 10: Expired QR rejected with 400 and EXPIRED error code',
      `Got status ${claimResExp.status}, code: ${dataExp.errorCode}`
    );

    // =========================================================================
    // SCENARIO 11: Already claimed QR (re-claim attempt)
    // =========================================================================
    console.log('\n--- Test 11: Duplicate claim rejection (ALREADY_CLAIMED) ---');
    // Attempting to claim the ticket from Test 2 again
    const claimResDup = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr1 }),
    });
    const dataDup: any = await claimResDup.json();
    assert(
      claimResDup.status === 400 && dataDup.errorCode === 'ALREADY_CLAIMED',
      'Test 11: Second claim attempt rejected with 400 and ALREADY_CLAIMED',
      `Got status ${claimResDup.status}, code: ${dataDup.errorCode}`
    );

    // =========================================================================
    // SCENARIO 12: Already redeemed QR (status = REDEEMED)
    // =========================================================================
    console.log('\n--- Test 12: Redeemed QR rejection (ALREADY_REDEEMED) ---');
    // Issue a ticket and set its QR status to REDEEMED
    const issueResRed = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 10, amountPaid: 20 }),
    });
    const issueDataRed: any = await issueResRed.json();
    const redTicketNumber = issueDataRed.ticket.ticketId;
    testTicketNumbers.push(redTicketNumber);

    const redTicketDoc = await Ticket.findOne({ ticketNumber: redTicketNumber });
    if (redTicketDoc) {
      testTicketIds.push(redTicketDoc._id);
      await QRTransaction.updateOne({ ticketId: redTicketDoc._id }, { status: 'REDEEMED' });
    }

    const claimResRed = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issueDataRed.qr.payload }),
    });
    const dataRed: any = await claimResRed.json();
    assert(
      claimResRed.status === 400 && dataRed.errorCode === 'ALREADY_REDEEMED',
      'Test 12: Already redeemed QR rejected with 400 and ALREADY_REDEEMED',
      `Got status ${claimResRed.status}, code: ${dataRed.errorCode}`
    );

    // =========================================================================
    // SCENARIO 13: Unauthenticated request rejected (HTTP 401)
    // =========================================================================
    console.log('\n--- Test 13: Unauthenticated claim request guard ---');
    const claimResUnauth = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr1 }),
    });
    assert(
      claimResUnauth.status === 401,
      'Test 13: Unauthenticated claim rejected with 401 Unauthorized',
      `Got status ${claimResUnauth.status}`
    );

    // =========================================================================
    // SCENARIO 14: Unauthorized role rejection (Conductor cannot claim)
    // =========================================================================
    console.log('\n--- Test 14: Role-based authorization guard (Conductor gets 403) ---');
    const claimResConductor = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr1 }),
    });
    assert(
      claimResConductor.status === 403,
      'Test 14: Conductor role rejected with 403 Forbidden',
      `Got status ${claimResConductor.status}`
    );

    // =========================================================================
    // SCENARIO 15: Concurrent Double-Claim Race Condition
    // 5 simultaneous claim requests -> EXACTLY 1 succeeds, EXACTLY 4 fail
    // =========================================================================
    console.log('\n--- Test 15: Concurrent Double-Claim Race Condition (5 simultaneous claims) ---');
    const issueResRace = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 30, amountPaid: 50 }), // change = 20
    });
    const issueDataRace: any = await issueResRace.json();
    const raceTicketNumber = issueDataRace.ticket.ticketId;
    const racePayload = issueDataRace.qr.payload;
    testTicketNumbers.push(raceTicketNumber);

    // Fire 5 concurrent requests simultaneously via Promise.all
    const concurrentClaims = Array.from({ length: 5 }, (_, idx) => {
      const token = idx % 2 === 0 ? passengerToken : secondPassengerToken;
      return fetch(`${BASE_URL}/qr/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ qrPayload: racePayload }),
      }).then(async (res) => {
        const body = await res.json();
        return { status: res.status, body };
      });
    });

    const results = await Promise.all(concurrentClaims);

    const successResponses = results.filter((r) => r.status === 200 && r.body.success === true);
    const failureResponses = results.filter((r) => r.status === 400 && (r.body.errorCode === 'ALREADY_CLAIMED' || r.body.errorCode === 'CLAIM_FAILED'));

    console.log(`[RACE CONDITION RESULTS] 200 Successes: ${successResponses.length}, 400 Failures: ${failureResponses.length}`);

    assert(
      successResponses.length === 1,
      'Test 15a: Concurrency Guarantee — EXACTLY 1 out of 5 simultaneous claims succeeds (HTTP 200)',
      `Expected 1 success, got ${successResponses.length}`
    );
    assert(
      failureResponses.length === 4,
      'Test 15b: Concurrency Guarantee — EXACTLY 4 out of 5 simultaneous claims are rejected (HTTP 400)',
      `Expected 4 rejected, got ${failureResponses.length}`
    );

    // Verify database state for the race-condition ticket
    const raceTicketDoc = await Ticket.findOne({ ticketNumber: raceTicketNumber });
    if (raceTicketDoc) testTicketIds.push(raceTicketDoc._id);
    const raceQrDoc = await QRTransaction.findOne({ ticketId: raceTicketDoc?._id });

    assert(
      raceTicketDoc?.status === 'CLAIMED' &&
        raceQrDoc?.status === 'CLAIMED' &&
        raceQrDoc?.claimedBy !== null,
      'Test 15c: Race condition ticket settled in consistent CLAIMED state in MongoDB',
      `Ticket status: ${raceTicketDoc?.status}, QR status: ${raceQrDoc?.status}`
    );

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');
  } catch (err: any) {
    console.error('Fatal test error:', err);
    failedCount++;
  } finally {
    // Teardown: cleanly delete ONLY records created by this test suite
    try {
      if (testTicketNumbers.length > 0) {
        const tickets = await Ticket.find({ ticketNumber: { $in: testTicketNumbers } });
        const ids = tickets.map((t) => t._id);
        await QRTransaction.deleteMany({ ticketId: { $in: ids } });
        await Ticket.deleteMany({ ticketNumber: { $in: testTicketNumbers } });
      }
      if (testUserIds.length > 0) {
        await User.deleteMany({ _id: { $in: testUserIds } });
      }
      console.log('[TEARDOWN] Safely cleaned up test records (existing data preserved).');
    } catch (cleanupErr) {
      console.warn('[TEARDOWN] Cleanup note:', cleanupErr);
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await mongoose.connection.close();
    if (mongoMemoryServer) {
      await mongoMemoryServer.stop();
    }
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runPhase2Tests();
