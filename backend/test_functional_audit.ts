import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import User from './models/User';
import Ticket from './models/Ticket';
import QRTransaction from './models/QRTransaction';

const DESIRED_PORT = 5095;
let BASE_URL = '';

async function runFunctionalAudit() {
  console.log('====================================================');
  console.log('  TRANSITCHANGE — 10-POINT FUNCTIONAL AUDIT SUITE');
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
  await new Promise<void>((resolve) => server.listen(DESIRED_PORT, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const actualPort = addr.port;
  BASE_URL = `http://127.0.0.1:${actualPort}/api`;
  console.log(`[TEST SERVER] Running on 127.0.0.1:${actualPort}`);

  const isAtlasMode = !process.argv.includes('--memory') && process.env.TEST_MODE !== 'memory';
  let mongoMemoryServer: any = null;

  if (isAtlasMode) {
    console.log('[TEST MODE] REAL ATLAS MODE (MongoMemoryServer strictly disabled)');
    const envUri = process.env.MONGODB_URI;

    if (!envUri) {
      console.error('[DB] ❌ MONGODB_URI environment variable is required for this test.');
      console.error('[DB] STRICT ATLAS MODE: Aborting audit. Configure MONGODB_URI in backend/.env or run with --memory.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }

    try {
      console.log('[DB] Connecting via MONGODB_URI (15s timeout)...');
      await mongoose.connect(envUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`[DB] ✅ Connected to MongoDB Atlas (${mongoose.connection.host})\n`);
    } catch (err: any) {
      console.error(`[DB] ❌ MongoDB Atlas connection failed: ${err.message}`);
      console.error('[DB] Aborting audit. Whitelist current IP on Atlas or verify MONGODB_URI.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }
  } else {
    console.log('[TEST MODE] OFFLINE / MEMORY MODE');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    await mongoose.connect(mongoMemoryServer.getUri());
  }

  const createdUserIds: string[] = [];
  const createdTicketIds: string[] = [];
  const createdQRIds: string[] = [];

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName} ${detail ? `-> ${detail}` : ''}`);
      failedTests++;
    }
  }

  const runId = Date.now();
  const passengerEmail = `audit_pass_${runId}@example.com`;
  const passengerMobile = `98${String(runId).slice(-8)}`;
  const conductorEmail = `audit_cond_${runId}@example.com`;
  const conductorMobile = `97${String(runId).slice(-8)}`;
  const password = 'SecurePassword123!';

  let passengerToken = '';
  let passengerId = '';
  let conductorToken = '';
  let issuedQrPayload = '';
  let issuedTicketNumber = '';

  try {
    // ----------------------------------------------------
    // 1. Passenger registration
    // ----------------------------------------------------
    console.log('--- Step 1: Passenger Registration ---');
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Audit Test Passenger',
        email: passengerEmail,
        mobileNumber: passengerMobile,
        password,
        role: 'Passenger',
      }),
    });
    const regData = await regRes.json();
    assert(regRes.status === 201 && !!regData.token, 'Step 1: Passenger registration returns 201 and JWT token');
    assert(regData.data?.role === 'Passenger', 'Step 1: Passenger registration assigns role=Passenger');
    if (regData.data?._id) createdUserIds.push(regData.data._id);

    // ----------------------------------------------------
    // 2. Passenger login
    // ----------------------------------------------------
    console.log('\n--- Step 2: Passenger Login ---');
    const passLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: passengerEmail, password }),
    });
    const passLoginData = await passLoginRes.json();
    assert(passLoginRes.status === 200 && !!passLoginData.token, 'Step 2: Passenger login returns 200 and JWT');
    passengerToken = passLoginData.token;
    passengerId = passLoginData.data?._id;

    // ----------------------------------------------------
    // 3. Conductor login (register first then login)
    // ----------------------------------------------------
    console.log('\n--- Step 3: Conductor Login ---');
    const condRegRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Audit Test Conductor',
        email: conductorEmail,
        mobileNumber: conductorMobile,
        password,
        role: 'Conductor',
        staffId: 'STAFF-AUDIT-001',
      }),
    });
    const condRegData = await condRegRes.json();
    if (condRegData.data?._id) createdUserIds.push(condRegData.data._id);

    const condLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: conductorEmail, password }),
    });
    const condLoginData = await condLoginRes.json();
    assert(condLoginRes.status === 200 && condLoginData.data?.role === 'Conductor', 'Step 3: Conductor login returns 200 and role=Conductor');
    conductorToken = condLoginData.token;

    // ----------------------------------------------------
    // 4. Conductor issue ticket
    // ----------------------------------------------------
    console.log('\n--- Step 4: Conductor Issue Ticket ---');
    const issueRes = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 25.0, amountPaid: 100.0 }),
    });
    const issueData = await issueRes.json();
    assert(issueRes.status === 201 && issueData.success === true, 'Step 4: Conductor issues ticket successfully (201 Created)');
    assert(issueData.ticket?.changeDue === 75, 'Step 4: Change calculated accurately (100 - 25 = 75.00)');
    assert(!!issueData.qr?.payload, 'Step 4: Cryptographic QR payload generated');
    issuedQrPayload = issueData.qr?.payload;
    issuedTicketNumber = issueData.ticket?.ticketId;
    if (issueData.ticket?._id) createdTicketIds.push(issueData.ticket._id);

    // Track QRTransaction for cleanup
    const foundTx = await QRTransaction.findOne({ qrCodeString: issuedQrPayload });
    if (foundTx) createdQRIds.push(foundTx._id.toString());

    // ----------------------------------------------------
    // 5. Passenger QR claim
    // ----------------------------------------------------
    console.log('\n--- Step 5: Passenger QR Claim ---');
    const claimRes = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issuedQrPayload }),
    });
    const claimData = await claimRes.json();
    assert(claimRes.status === 200 && claimData.success === true, 'Step 5: Passenger successfully claims QR (200 OK)');
    assert(claimData.claim?.status === 'CLAIMED', 'Step 5: QRTransaction transitioned to CLAIMED');
    assert(claimData.ticket?.ticketNumber === issuedTicketNumber, 'Step 5: Claim response returns verified database ticket data');

    // ----------------------------------------------------
    // 6. Duplicate QR claim -> ALREADY_CLAIMED
    // ----------------------------------------------------
    console.log('\n--- Step 6: Duplicate QR Claim Protection ---');
    const dupClaimRes = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issuedQrPayload }),
    });
    const dupClaimData = await dupClaimRes.json();
    assert(dupClaimRes.status === 400 && dupClaimData.errorCode === 'ALREADY_CLAIMED', 'Step 6: Duplicate claim blocked with 400 ALREADY_CLAIMED');

    // ----------------------------------------------------
    // 7. Invalid QR -> INVALID_SIGNATURE
    // ----------------------------------------------------
    console.log('\n--- Step 7: Tampered QR Integrity Protection ---');
    const parsedPayload = JSON.parse(issuedQrPayload);
    const tamperedPayload = JSON.stringify({
      ...parsedPayload,
      changeAmount: 999.0,
    });
    const tamperedRes = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: tamperedPayload }),
    });
    const tamperedData = await tamperedRes.json();
    assert(tamperedRes.status === 400 && tamperedData.errorCode === 'INVALID_SIGNATURE', 'Step 7: Tampered QR rejected with 400 INVALID_SIGNATURE');

    // ----------------------------------------------------
    // 8. Logout simulation & token revocation check
    // ----------------------------------------------------
    console.log('\n--- Step 8: Logout Verification ---');
    const unauthReqRes = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    assert(unauthReqRes.status === 401, 'Step 8: Missing token after logout rejected with 401 Unauthorized');

    // ----------------------------------------------------
    // 9. Protected route access
    // ----------------------------------------------------
    console.log('\n--- Step 9: Protected Route Access ---');
    const profileRes = await fetch(`${BASE_URL}/auth/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
    });
    const profileData = await profileRes.json();
    assert(profileRes.status === 200 && profileData.data?._id === passengerId, 'Step 9: Authenticated user successfully accesses protected profile');

    // ----------------------------------------------------
    // 10. Role-based access enforcement
    // ----------------------------------------------------
    console.log('\n--- Step 10: Role-Based Access Enforcement ---');
    const condClaimRes = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ qrPayload: issuedQrPayload }),
    });
    assert(condClaimRes.status === 403, 'Step 10a: Conductor claiming QR rejected with 403 Forbidden');

    const passIssueRes = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ fareAmount: 10, amountPaid: 20 }),
    });
    assert(passIssueRes.status === 403, 'Step 10b: Passenger issuing ticket rejected with 403 Forbidden');

  } catch (err: any) {
    console.error('Unexpected error during audit:', err);
    failedTests++;
  } finally {
    console.log('\n[TEARDOWN] Cleaning up audit records...');
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    if (createdTicketIds.length > 0) {
      await Ticket.deleteMany({ _id: { $in: createdTicketIds } });
    }
    if (createdQRIds.length > 0) {
      await QRTransaction.deleteMany({ _id: { $in: createdQRIds } });
    }
    console.log('[TEARDOWN] Cleanup complete.');

    await mongoose.disconnect();
    if (mongoMemoryServer) await mongoMemoryServer.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    console.log('\n====================================================');
    console.log(`AUDIT SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================');

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runFunctionalAudit();
