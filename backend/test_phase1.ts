import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import connectDB from './config/db';
import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import User from './models/User';
import Ticket from './models/Ticket';
import QRTransaction from './models/QRTransaction';
import { verifyQrPayload } from './utils/qrSigner';

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

async function runTests() {
  console.log('====================================================');
  console.log('  TRANSITCHANGE PHASE 1 VERIFICATION TEST SUITE');
  console.log('====================================================\n');

  // 1. Setup in-process Express server on test port
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

  // Determine test mode: default to REAL ATLAS verification mode unless explicitly set to memory
  const isAtlasMode = !process.argv.includes('--memory') && process.env.TEST_MODE !== 'memory';
  let mongoMemoryServer: any = null;
  let connectionMethodUsed = '';

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
      connectionMethodUsed = 'MONGODB_URI environment variable';
    } catch (err: any) {
      console.error(`[DB] ❌ MongoDB Atlas connection failed: ${err.message}`);
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. MongoMemoryServer will NOT be used.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }
  } else {
    // Offline / isolated memory mode only when explicitly requested
    console.log('[TEST MODE] OFFLINE / ISOLATED MEMORY MODE');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoMemoryServer = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const uri = mongoMemoryServer.getUri();
    await mongoose.connect(uri);
    connectionMethodUsed = 'MongoMemoryServer (Isolated)';
    console.log(`[DB] MongoMemoryServer connected at ${uri}\n`);
  }

  // Track test-created IDs to protect existing database data
  const testUserIds: any[] = [];
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
    // Setup Test Users
    const conductorEmail = `conductor_test_${Date.now()}@example.com`;
    const passengerEmail = `passenger_test_${Date.now()}@example.com`;

    const conductorUser = await User.create({
      fullName: 'Test Conductor',
      email: conductorEmail,
      mobileNumber: `987${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      role: 'Conductor',
      staffId: 'STF-9988',
    });

    const passengerUser = await User.create({
      fullName: 'Test Passenger',
      email: passengerEmail,
      mobileNumber: `988${Math.floor(1000000 + Math.random() * 9000000)}`,
      password: 'password123',
      role: 'Passenger',
    });

    testUserIds.push(conductorUser._id, passengerUser._id);

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

    // TEST 1 & 2: Conductor creates valid ticket with fare=18, paid=20 -> changeDue=2
    console.log('--- Test 1 & 2: Valid Ticket Issuance and Change Calculation ---');
    const res1 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 18, amountPaid: 20 }),
    });
    const data1: any = await res1.json();

    assert(
      res1.status === 201 && data1.success === true,
      'Test 1: Conductor creates valid ticket (HTTP 201)',
      `Status was ${res1.status}`
    );
    if (data1.ticket?.ticketId) testTicketIds.push(data1.ticket.ticketId);
    assert(
      data1.ticket?.changeDue === 2 && data1.ticket?.fareAmount === 18 && data1.ticket?.amountPaid === 20,
      'Test 2: Correct changeDue calculation (18 fare, 20 paid -> 2 changeDue)',
      `changeDue was ${data1.ticket?.changeDue}`
    );

    // TEST 3: amountPaid = 15, fareAmount = 20 -> expected validation failure (HTTP 400)
    console.log('\n--- Test 3: Insufficient Paid Amount Rejection ---');
    const res2 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 20, amountPaid: 15 }),
    });
    const data2: any = await res2.json();
    assert(
      res2.status === 400 && data2.success === false,
      'Test 3: Reject amountPaid < fareAmount with 400 Bad Request',
      `Got status ${res2.status}: ${data2.error}`
    );

    // TEST 3b: Reject more than 2 decimal places
    const res2b = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 18.555, amountPaid: 20 }),
    });
    const data2b: any = await res2b.json();
    assert(
      res2b.status === 400 && data2b.success === false,
      'Test 3b: Reject floating point / >2 decimal places with 400 Bad Request',
      `Got status ${res2b.status}: ${data2b.error}`
    );

    // TEST 4: Passenger attempts ticket issuance -> expected 403 Forbidden
    console.log('\n--- Test 4: Role-based Authorization Guard ---');
    const res3 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ fareAmount: 18, amountPaid: 20 }),
    });
    const data3: any = await res3.json();
    assert(
      res3.status === 403,
      'Test 4: Passenger denied access with 403 Forbidden',
      `Got status ${res3.status}`
    );

    // TEST 5: Unauthenticated request -> expected 401 Unauthorized
    console.log('\n--- Test 5: Authentication Requirement ---');
    const res4 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fareAmount: 18, amountPaid: 20 }),
    });
    assert(
      res4.status === 401,
      'Test 5: Unauthenticated request rejected with 401 Unauthorized',
      `Got status ${res4.status}`
    );

    // TEST 6 & 7: Two tickets receive different ticket IDs and different QR nonces
    console.log('\n--- Test 6 & 7: Uniqueness of Ticket IDs and Nonces ---');
    const res5 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 25, amountPaid: 50 }),
    });
    const data5: any = await res5.json();
    if (data5.ticket?.ticketId) testTicketIds.push(data5.ticket.ticketId);

    const ticketId1 = data1.ticket.ticketId;
    const ticketId2 = data5.ticket.ticketId;
    const payload1 = JSON.parse(data1.qr.payload);
    const payload2 = JSON.parse(data5.qr.payload);

    assert(
      ticketId1 !== ticketId2 && /^TC-\d{8}-[A-F0-9]{6}$/.test(ticketId1),
      'Test 6: Two tickets receive distinct unique Ticket IDs in TC-YYYYMMDD-XXXXXX format',
      `ID1: ${ticketId1}, ID2: ${ticketId2}`
    );
    assert(
      payload1.nonce !== payload2.nonce && payload1.nonce.length === 32,
      'Test 7: Two tickets receive distinct cryptographic random nonces',
      `Nonce1: ${payload1.nonce}, Nonce2: ${payload2.nonce}`
    );

    // TEST 8: QR signature can be verified using the backend secret
    console.log('\n--- Test 8: QR Signature Verification ---');
    const verifyResultValid = verifyQrPayload(data1.qr.payload);
    assert(
      verifyResultValid.valid === true,
      'Test 8: QR signature verifies successfully using server HMAC secret',
      verifyResultValid.reason
    );

    // TEST 9: Changing changeAmount inside QR payload causes signature validation to fail
    console.log('\n--- Test 9: Tamper Detection ---');
    const tamperedPayload = {
      ...payload1,
      changeAmount: 200, // Tampered from 2 to 200!
    };
    const verifyResultTampered = verifyQrPayload(tamperedPayload);
    assert(
      verifyResultTampered.valid === false,
      'Test 9: Tampered changeAmount correctly fails HMAC signature validation',
      `Expected valid=false, got valid=${verifyResultTampered.valid}`
    );

    // TEST 10: QR transaction stored with ACTIVE status in MongoDB
    console.log('\n--- Test 10: Database Persistence & Status Verification ---');
    const storedTicket = await Ticket.findOne({ ticketNumber: ticketId1 });
    const storedQR = await QRTransaction.findOne({ ticketId: storedTicket?._id });

    assert(
      storedTicket !== null &&
        storedTicket.status === 'ISSUED' &&
        storedQR !== null &&
        storedQR.status === 'ACTIVE' &&
        storedQR.isFraudulent === false,
      'Test 10: Ticket status is ISSUED and QRTransaction status is ACTIVE in MongoDB',
      `Stored QR status: ${storedQR?.status}`
    );

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('====================================================\n');
  } catch (error: any) {
    console.error('Fatal test execution error:', error);
    failedCount++;
  } finally {
    // Teardown: cleanly remove only the records created by this test run
    try {
      if (testTicketIds.length > 0) {
        const createdTickets = await Ticket.find({ ticketNumber: { $in: testTicketIds } });
        const ids = createdTickets.map((t) => t._id);
        await QRTransaction.deleteMany({ ticketId: { $in: ids } });
        await Ticket.deleteMany({ ticketNumber: { $in: testTicketIds } });
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

runTests();
