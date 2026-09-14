import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { spawn, ChildProcess } from 'child_process';

import authRoutes from './routes/authRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import refundRoutes from './routes/refundRoutes';
import adminRoutes from './routes/adminRoutes';

import User from './models/User';
import Ticket from './models/Ticket';
import QRTransaction from './models/QRTransaction';
import FraudLog from './models/FraudLog';
import { sanitizeScoreAndTier } from './services/aiFraudService';

const PORT = 5097;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;
const AI_PORT = 8000;

async function isAiServiceRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${AI_PORT}/health`);
    if (res.ok) {
      const data: any = await res.json();
      return data.status === 'healthy';
    }
    return false;
  } catch {
    return false;
  }
}

async function runPhase3Tests() {
  console.log('====================================================');
  console.log('  TRANSITCHANGE PHASE 3 VERIFICATION TEST SUITE');
  console.log('  Layer 2 AI Fraud Intelligence + Simulated UPI Settlement');
  console.log('====================================================\n');

  // 1. Setup in-process Express test server
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/qr', qrRoutes);
  app.use('/api/refund', refundRoutes);
  app.use('/api/admin', adminRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  // 2. Check or launch AI Python Microservice
  let aiProcess: ChildProcess | null = null;
  const alreadyRunning = await isAiServiceRunning();

  if (alreadyRunning) {
    console.log(`[AI SERVICE] Found existing healthy AI microservice on port ${AI_PORT}`);
  } else {
    console.log(`[AI SERVICE] Starting AI FastAPI microservice on port ${AI_PORT}...`);
    const pythonExe = 'C:\\Users\\Murugan R\\Downloads\\anoconda\\python.exe';
    aiProcess = spawn(
      pythonExe,
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(AI_PORT)],
      {
        cwd: 'd:\\Transit Change\\Transit Change\\ai-service',
        stdio: 'ignore',
      }
    );

    // Poll until healthy (max 15s)
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await isAiServiceRunning()) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      console.error('❌ [AI SERVICE] Failed to start Python AI microservice. Aborting test.');
      server.close();
      process.exit(1);
    }
    console.log('[AI SERVICE] AI FastAPI microservice successfully launched and healthy!\n');
  }

  // Verify model loaded
  const healthRes = await fetch(`http://127.0.0.1:${AI_PORT}/health`);
  const healthData: any = await healthRes.json();
  console.log(`[AI SERVICE] Model Type: ${healthData.model_type} (Model Loaded: ${healthData.model_loaded})\n`);

  // 3. Connect to Real MongoDB Atlas
  const isAtlasMode = !process.argv.includes('--memory') && process.env.TEST_MODE !== 'memory';

  if (isAtlasMode) {
    console.log('[TEST MODE] REAL ATLAS VERIFICATION MODE (MongoMemoryServer strictly DISABLED)');
    const envUri = process.env.MONGODB_URI;

    if (!envUri) {
      console.error('[DB] ❌ MONGODB_URI environment variable is required for this test.');
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. Configure MONGODB_URI in backend/.env or run with --memory.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (aiProcess) aiProcess.kill();
      process.exit(1);
    }

    try {
      console.log('[DB] Attempting connection via MONGODB_URI (15s timeout)...');
      await mongoose.connect(envUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`[DB] MongoDB Atlas Connected successfully (Host: ${mongoose.connection.host})\n`);
    } catch (err: any) {
      console.error(`[DB] MongoDB Atlas connection failed: ${err.message}`);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (aiProcess) aiProcess.kill();
      process.exit(1);
    }
  } else {
    // Offline / isolated memory mode only when explicitly requested
    console.log('[TEST MODE] OFFLINE / ISOLATED MEMORY MODE');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mms = await MongoMemoryServer.create({
      instance: { launchTimeout: 60000 },
    });
    const uri = mms.getUri();
    await mongoose.connect(uri);
    console.log(`[DB] MongoMemoryServer connected at ${uri}\n`);
  }

  // Tracking test-created IDs for non-destructive teardown
  const testUserIds: any[] = [];
  const testTicketNumbers: string[] = [];
  const testTicketIds: any[] = [];
  const testQrIds: any[] = [];
  const testFraudLogIds: any[] = [];

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failedCount++;
    }
  }

  try {
    const runId = Math.floor(Math.random() * 90000) + 10000;

    // Create Test Conductor
    const conductorUser = await User.create({
      fullName: `Conductor P3-${runId}`,
      email: `conductor_p3_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Conductor',
      staffId: `STF-P3-${runId}`,
      mobileNumber: `911${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(conductorUser._id);

    // Create Passenger 1
    const passenger1 = await User.create({
      fullName: `Passenger One P3-${runId}`,
      email: `passenger1_p3_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Passenger',
      mobileNumber: `922${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(passenger1._id);

    // Create Passenger 2
    const passenger2 = await User.create({
      fullName: `Passenger Two P3-${runId}`,
      email: `passenger2_p3_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Passenger',
      mobileNumber: `933${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(passenger2._id);

    // Create Admin
    const adminUser = await User.create({
      fullName: `Admin P3-${runId}`,
      email: `admin_p3_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Admin',
      mobileNumber: `944${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(adminUser._id);

    const conductorToken = jwt.sign(
      { id: conductorUser._id.toString(), role: conductorUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const passenger1Token = jwt.sign(
      { id: passenger1._id.toString(), role: passenger1.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const passenger2Token = jwt.sign(
      { id: passenger2._id.toString(), role: passenger2.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const adminToken = jwt.sign(
      { id: adminUser._id.toString(), role: adminUser.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    // =========================================================================
    // TEST 1: Low-Risk End-to-End Flow (Issue -> Layer 1 Claim -> Layer 2 AI -> Instant Simulated UPI)
    // =========================================================================
    console.log('\n--- Test 1: Low-Risk Ticket Issuance, Layer 1 Claim, and Instant Settlement ---');
    const issueRes1 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 20, amountPaid: 50 }), // change = 30
    });
    const issueData1: any = await issueRes1.json();
    assert(issueRes1.status === 201 && issueData1.success, 'Test 1.1: Conductor issues ticket (change=30)');

    const ticketNumber1 = issueData1.ticket.ticketId;
    const qrPayloadStr1 = issueData1.qr.payload;
    testTicketNumbers.push(ticketNumber1);

    // Passenger 1 claims QR
    const claimRes1 = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr1 }),
    });
    const claimData1: any = await claimRes1.json();
    assert(claimRes1.status === 200 && claimData1.claim?.status === 'CLAIMED', 'Test 1.2: Passenger claims QR (status=CLAIMED)');

    // Passenger 1 requests simulated refund
    const refundRes1 = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumber1,
        upiId: 'passenger1@okhdfcbank',
      }),
    });
    const refundData1: any = await refundRes1.json();
    assert(
      refundRes1.status === 200 &&
        refundData1.success === true &&
        refundData1.status === 'COMPLETED' &&
        refundData1.riskTier === 'LOW_RISK',
      'Test 1.3: Low-risk claim automatically settles (HTTP 200, status: COMPLETED, risk: LOW_RISK)'
    );
    assert(
      typeof refundData1.settlement?.mockUpiRef === 'string' &&
        refundData1.settlement.mockUpiRef.startsWith('NPCI-SIM-') &&
        refundData1.settlement?.disclaimer.includes('Simulated UPI'),
      'Test 1.4: Response contains NPCI-SIM reference and explicit academic disclaimer'
    );

    // Verify DB state
    const dbTicket1 = await Ticket.findOne({ ticketNumber: ticketNumber1 });
    if (dbTicket1) testTicketIds.push(dbTicket1._id);
    const dbQr1 = await QRTransaction.findOne({ ticketId: dbTicket1?._id });
    if (dbQr1) testQrIds.push(dbQr1._id);

    assert(
      dbTicket1?.status === 'COMPLETED' &&
        dbQr1?.status === 'REDEEMED' &&
        dbQr1?.mockUpiRef === refundData1.settlement?.mockUpiRef,
      'Test 1.5: MongoDB Atlas state verified: Ticket is COMPLETED and QRTransaction is REDEEMED'
    );

    // =========================================================================
    // TEST 2: High-Risk Claim -> Intercepted -> MANUAL_REVIEW State & FraudLog
    // =========================================================================
    console.log('\n--- Test 2: High-Risk Anomaly Interception and Manual Review Escalation ---');
    const issueRes2 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 10, amountPaid: 650 }), // change = 640 (> 500 triggers high denomination anomaly)
    });
    const issueData2: any = await issueRes2.json();
    const ticketNumber2 = issueData2.ticket.ticketId;
    const qrPayloadStr2 = issueData2.qr.payload;
    testTicketNumbers.push(ticketNumber2);

    // Passenger 2 claims QR
    const claimRes2 = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger2Token}`,
      },
      body: JSON.stringify({ qrPayload: qrPayloadStr2 }),
    });
    const claimData2: any = await claimRes2.json();
    assert(claimRes2.status === 200 && claimData2.claim?.status === 'CLAIMED', 'Test 2.1: Passenger 2 claims high-value ticket (status=CLAIMED)');

    // Passenger 2 requests refund -> AI evaluates high risk
    const refundRes2 = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger2Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumber2,
        upiId: 'passenger2@ybl',
      }),
    });
    const refundData2: any = await refundRes2.json();
    assert(
      (refundRes2.status === 200 || refundRes2.status === 202) &&
        refundData2.status === 'MANUAL_REVIEW' &&
        refundData2.riskTier === 'HIGH_RISK' &&
        refundData2.fraudScore >= 0.50,
      'Test 2.2: AI intercepts high-value anomaly -> Diverts to MANUAL_REVIEW (Score >= 0.50)'
    );
    assert(
      refundData2.settlement === undefined &&
        Array.isArray(refundData2.flagReasons) &&
        refundData2.flagReasons.length > 0,
      'Test 2.3: Zero money disbursed; explainable risk reasons provided'
    );

    // Check DB state: QR is MANUAL_REVIEW, FraudLog exists
    const dbTicket2 = await Ticket.findOne({ ticketNumber: ticketNumber2 });
    if (dbTicket2) testTicketIds.push(dbTicket2._id);
    const dbQr2 = await QRTransaction.findOne({ ticketId: dbTicket2?._id });
    if (dbQr2) testQrIds.push(dbQr2._id);

    const fraudLog2 = await FraudLog.findOne({ transactionId: dbQr2?._id });
    if (fraudLog2) testFraudLogIds.push(fraudLog2._id);

    assert(
      dbQr2?.status === 'MANUAL_REVIEW' &&
        fraudLog2 !== null &&
        fraudLog2?.adminDecision === 'Pending' &&
        fraudLog2?.adminReviewed === false,
      'Test 2.4: MongoDB Atlas state verified: QR is MANUAL_REVIEW and FraudLog is Pending'
    );

    // =========================================================================
    // TEST 3: Admin Review Queue Fetching (GET /api/admin/fraud-queue)
    // =========================================================================
    console.log('\n--- Test 3: Admin Fraud Queue Retrieval ---');
    const queueRes = await fetch(`${BASE_URL}/admin/fraud-queue`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const queueData: any = await queueRes.json();
    assert(
      queueRes.status === 200 &&
        queueData.success === true &&
        Array.isArray(queueData.queue) &&
        queueData.queue.some((item: any) => item._id === fraudLog2?._id.toString()),
      'Test 3: Admin successfully retrieves fraud queue containing flagged ticket'
    );

    // =========================================================================
    // TEST 4: Admin Approves High-Risk Claim (POST /api/admin/review/:id)
    // =========================================================================
    console.log('\n--- Test 4: Admin Manual Approval and Settlement ---');
    const approveRes = await fetch(`${BASE_URL}/admin/review/${fraudLog2?._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'Approved' }),
    });
    const approveData: any = await approveRes.json();
    assert(
      approveRes.status === 200 &&
        approveData.decision === 'Approved' &&
        approveData.settlement?.mockUpiRef?.startsWith('NPCI-SIM-'),
      'Test 4.1: Admin approval dispatches simulated UPI payment'
    );

    const dbQr2After = await QRTransaction.findById(dbQr2?._id);
    const dbTicket2After = await Ticket.findById(dbTicket2?._id);
    const fraudLog2After = await FraudLog.findById(fraudLog2?._id);

    assert(
      dbQr2After?.status === 'REDEEMED' &&
        dbTicket2After?.status === 'COMPLETED' &&
        fraudLog2After?.adminDecision === 'Approved' &&
        fraudLog2After?.adminReviewed === true,
      'Test 4.2: MongoDB Atlas state verified: Approved -> QR REDEEMED, Ticket COMPLETED'
    );

    // =========================================================================
    // TEST 5: Admin Rejection Flow (High-Risk -> Rejected -> FAILED / CANCELLED)
    // =========================================================================
    console.log('\n--- Test 5: Admin Rejection and Voiding of Fraudulent Claim ---');
    const issueRes3 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 10, amountPaid: 700 }), // change = 690
    });
    const issueData3: any = await issueRes3.json();
    const ticketNumber3 = issueData3.ticket.ticketId;
    testTicketNumbers.push(ticketNumber3);

    // Passenger 2 claims
    await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger2Token}`,
      },
      body: JSON.stringify({ qrPayload: issueData3.qr.payload }),
    });

    // Request refund -> MANUAL_REVIEW
    await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger2Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumber3,
        upiId: 'bad_actor@paytm',
      }),
    });

    const dbTicket3 = await Ticket.findOne({ ticketNumber: ticketNumber3 });
    if (dbTicket3) testTicketIds.push(dbTicket3._id);
    const dbQr3 = await QRTransaction.findOne({ ticketId: dbTicket3?._id });
    if (dbQr3) testQrIds.push(dbQr3._id);
    const fraudLog3 = await FraudLog.findOne({ transactionId: dbQr3?._id });
    if (fraudLog3) testFraudLogIds.push(fraudLog3._id);

    // Admin rejects claim
    const rejectRes = await fetch(`${BASE_URL}/admin/review/${fraudLog3?._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'Rejected' }),
    });
    const rejectData: any = await rejectRes.json();
    assert(
      rejectRes.status === 200 && rejectData.decision === 'Rejected',
      'Test 5.1: Admin rejection processed successfully'
    );

    const dbQr3After = await QRTransaction.findById(dbQr3?._id);
    const dbTicket3After = await Ticket.findById(dbTicket3?._id);
    const fraudLog3After = await FraudLog.findById(fraudLog3?._id);

    assert(
      dbQr3After?.status === 'FAILED' &&
        dbQr3After?.isFraudulent === true &&
        dbTicket3After?.status === 'CANCELLED' &&
        fraudLog3After?.adminDecision === 'Rejected',
      'Test 5.2: MongoDB Atlas state verified: Rejected -> QR FAILED, Ticket CANCELLED'
    );

    // =========================================================================
    // TEST 6: Fail-Closed Behavior on AI Service Outage
    // =========================================================================
    console.log('\n--- Test 6: Fail-Closed Protection When AI Service Unreachable ---');
    const issueRes4 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 25, amountPaid: 50 }),
    });
    const issueData4: any = await issueRes4.json();
    const ticketNumber4 = issueData4.ticket.ticketId;
    testTicketNumbers.push(ticketNumber4);

    // Passenger claims
    await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({ qrPayload: issueData4.qr.payload }),
    });

    // Temporarily sabotage AI_SERVICE_URL env to unreachable port
    const originalAiUrl = process.env.AI_SERVICE_URL;
    process.env.AI_SERVICE_URL = 'http://127.0.0.1:59999';

    const failClosedRes = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumber4,
        upiId: 'passenger1@okhdfcbank',
      }),
    });
    const failClosedData: any = await failClosedRes.json();

    // Restore AI_SERVICE_URL
    process.env.AI_SERVICE_URL = originalAiUrl;

    assert(
      (failClosedRes.status === 200 || failClosedRes.status === 202) &&
        failClosedData.status === 'MANUAL_REVIEW' &&
        failClosedData.riskTier === 'HIGH_RISK' &&
        failClosedData.settlement === undefined,
      'Test 6: Fail-Closed verified: AI outage prevents disbursement and routes to MANUAL_REVIEW'
    );

    const dbTicket4 = await Ticket.findOne({ ticketNumber: ticketNumber4 });
    if (dbTicket4) testTicketIds.push(dbTicket4._id);
    const dbQr4 = await QRTransaction.findOne({ ticketId: dbTicket4?._id });
    if (dbQr4) testQrIds.push(dbQr4._id);
    const fraudLog4 = await FraudLog.findOne({ transactionId: dbQr4?._id });
    if (fraudLog4) testFraudLogIds.push(fraudLog4._id);

    // =========================================================================
    // TEST 7: Concurrency Protection Against Double-Refund
    // =========================================================================
    console.log('\n--- Test 7: Concurrency Protection Against Duplicate Refund Calls ---');
    const issueRes5 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 30, amountPaid: 50 }), // change = 20
    });
    const issueData5: any = await issueRes5.json();
    const ticketNumber5 = issueData5.ticket.ticketId;
    testTicketNumbers.push(ticketNumber5);

    // Passenger 1 claims
    await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({ qrPayload: issueData5.qr.payload }),
    });

    const dbTicket5 = await Ticket.findOne({ ticketNumber: ticketNumber5 });
    if (dbTicket5) testTicketIds.push(dbTicket5._id);
    const dbQr5 = await QRTransaction.findOne({ ticketId: dbTicket5?._id });
    if (dbQr5) testQrIds.push(dbQr5._id);

    // Fire 5 simultaneous refund calls
    const concurrentRefunds = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        fetch(`${BASE_URL}/refund/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${passenger1Token}`,
          },
          body: JSON.stringify({
            ticketNumber: ticketNumber5,
            upiId: 'passenger1@okhdfcbank',
          }),
        }).then(async (res) => ({ status: res.status, data: await res.json() }))
      )
    );

    const completedResponses = concurrentRefunds.filter((r) => r.status === 200 && r.data.status === 'COMPLETED');
    const rejectedResponses = concurrentRefunds.filter((r) => r.status === 400 && r.data.errorCode === 'ALREADY_REDEEMED');

    assert(
      completedResponses.length === 1,
      'Test 7.1: Concurrency Shield: Exactly 1 simultaneous request successfully redeemed ticket',
      `Success count: ${completedResponses.length}`
    );
    assert(
      rejectedResponses.length === 4,
      'Test 7.2: Concurrency Shield: Exactly 4 simultaneous requests rejected with ALREADY_REDEEMED',
      `Rejected count: ${rejectedResponses.length}`
    );

    // =========================================================================
    // TEST 8: Prevent Pre-mature or Subsequent Refund
    // =========================================================================
    console.log('\n--- Test 8: State Validation (Already Redeemed / Invalid State) ---');
    const repeatRes = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumber5,
        upiId: 'passenger1@okhdfcbank',
      }),
    });
    const repeatData: any = await repeatRes.json();
    assert(
      repeatRes.status === 400 && repeatData.errorCode === 'ALREADY_REDEEMED',
      'Test 8: Re-submitting already settled refund returns 400 ALREADY_REDEEMED'
    );

    // =========================================================================
    // TEST 9: Role-Based Authorization Security
    // =========================================================================
    console.log('\n--- Test 9: Role-Based Access Control and Unauthorized Protections ---');

    // Conductor calling refund endpoint -> 403
    const conductorRefundRes = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ ticketNumber: ticketNumber1, upiId: 'c@upi' }),
    });
    assert(conductorRefundRes.status === 403, 'Test 9.1: Conductor role blocked from refund endpoint (HTTP 403)');

    // Passenger calling admin queue -> 403
    const passengerAdminRes = await fetch(`${BASE_URL}/admin/fraud-queue`, {
      headers: { Authorization: `Bearer ${passenger1Token}` },
    });
    assert(passengerAdminRes.status === 403, 'Test 9.2: Passenger role blocked from admin queue (HTTP 403)');

    // Unauthenticated request -> 401
    const unauthRes = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketNumber: ticketNumber1, upiId: 'anon@upi' }),
    });
    assert(unauthRes.status === 401, 'Test 9.3: Unauthenticated request rejected (HTTP 401)');

    // =========================================================================
    // TEST 10: Real-Time Admin Analytics Aggregation
    // =========================================================================
    console.log('\n--- Test 10: Real Database Analytics Aggregations ---');
    const analyticsRes = await fetch(`${BASE_URL}/admin/analytics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const analyticsData: any = await analyticsRes.json();
    assert(
      analyticsRes.status === 200 &&
        analyticsData.success === true &&
        typeof analyticsData.data?.totalChangeDispensed === 'number' &&
        analyticsData.data?.totalChangeDispensed > 0 &&
        analyticsData.data?.totalTicketsIssued > 0 &&
        analyticsData.data?.totalClaimsSettled > 0 &&
        typeof analyticsData.data?.settlementRate === 'number',
      'Test 10: Admin analytics returns live MongoDB aggregations (change dispensed, tickets, claims)'
    );

    // =========================================================================
    // TEST 11: AI Score Sanitization & Decision Boundary Verification
    // =========================================================================
    console.log('\n--- Test 11: AI Score Sanitization & Strict Decision Boundaries ---');
    const bLow = sanitizeScoreAndTier(0.49, 'LOW_RISK');
    assert(
      bLow.fraudScore === 0.49 && bLow.riskTier === 'LOW_RISK' && bLow.isFraud === false && !bLow.isInvalid,
      'Test 11.1: Decision Boundary: Score 0.49 classifies strictly as LOW_RISK'
    );

    const bThreshold = sanitizeScoreAndTier(0.50, 'LOW_RISK');
    assert(
      bThreshold.fraudScore === 0.50 && bThreshold.riskTier === 'HIGH_RISK' && bThreshold.isFraud === true && !bThreshold.isInvalid,
      'Test 11.2: Decision Boundary: Score 0.50 classifies strictly as HIGH_RISK'
    );

    const bHigh = sanitizeScoreAndTier(0.51, 'LOW_RISK');
    assert(
      bHigh.fraudScore === 0.51 && bHigh.riskTier === 'HIGH_RISK' && bHigh.isFraud === true && !bHigh.isInvalid,
      'Test 11.3: Decision Boundary: Score 0.51 classifies strictly as HIGH_RISK'
    );

    const bNaN = sanitizeScoreAndTier(NaN, 'LOW_RISK');
    assert(
      bNaN.fraudScore === 0.99 && bNaN.riskTier === 'HIGH_RISK' && bNaN.isFraud === true && bNaN.isInvalid === true,
      'Test 11.4: Fail-Closed Sanitizer: NaN fails closed to 0.99 HIGH_RISK'
    );

    const bInf = sanitizeScoreAndTier(Infinity, 'LOW_RISK');
    assert(
      bInf.fraudScore === 0.99 && bInf.riskTier === 'HIGH_RISK' && bInf.isFraud === true && bInf.isInvalid === true,
      'Test 11.5: Fail-Closed Sanitizer: Infinity fails closed to 0.99 HIGH_RISK'
    );

    const bNeg = sanitizeScoreAndTier(-0.05, 'LOW_RISK');
    assert(
      bNeg.fraudScore === 0.99 && bNeg.riskTier === 'HIGH_RISK' && bNeg.isFraud === true && bNeg.isInvalid === true,
      'Test 11.6: Fail-Closed Sanitizer: Negative score (-0.05) fails closed to 0.99 HIGH_RISK'
    );

    const bOver = sanitizeScoreAndTier(1.05, 'LOW_RISK');
    assert(
      bOver.fraudScore === 0.99 && bOver.riskTier === 'HIGH_RISK' && bOver.isFraud === true && bOver.isInvalid === true,
      'Test 11.7: Fail-Closed Sanitizer: Score > 1.0 (1.05) fails closed to 0.99 HIGH_RISK'
    );

    const bString = sanitizeScoreAndTier('0.25' as any, 'LOW_RISK');
    assert(
      bString.fraudScore === 0.99 && bString.riskTier === 'HIGH_RISK' && bString.isInvalid === true,
      'Test 11.8: Fail-Closed Sanitizer: String type fails closed to 0.99 HIGH_RISK'
    );

    // =========================================================================
    // TEST 12: Zero Change Due Validation (NO_CHANGE_DUE)
    // =========================================================================
    console.log('\n--- Test 12: Zero Change Due Rejection (NO_CHANGE_DUE) ---');
    const issueResZero = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 50, amountPaid: 50 }), // change = 0
    });
    const issueDataZero: any = await issueResZero.json();
    assert(
      issueResZero.status === 400 && issueDataZero.errorCode === 'EXACT_FARE_RECEIVED',
      'Test 12a: Exact fare ticket issuance rejected with HTTP 400 EXACT_FARE_RECEIVED'
    );

    // Create a DB ticket directly with changeDue = 0 to verify refund endpoint rejection
    const zeroTicket = await Ticket.create({
      ticketNumber: `TC-ZERO-${Date.now()}`,
      conductorId: conductorUser._id,
      passengerId: passenger1._id,
      fareAmount: 50,
      amountPaid: 50,
      changeDue: 0,
      status: 'CLAIMED',
      issuedAt: new Date(),
    });
    testTicketIds.push(zeroTicket._id);

    const zeroRefundRes = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: zeroTicket.ticketNumber,
        upiId: 'passenger1@okhdfcbank',
      }),
    });
    const zeroRefundData: any = await zeroRefundRes.json();
    assert(
      zeroRefundRes.status === 400 && zeroRefundData.errorCode === 'NO_CHANGE_DUE',
      'Test 12b: Refund rejected with HTTP 400 NO_CHANGE_DUE when changeDue is 0'
    );

    // =========================================================================
    // TEST 13: Invalid UPI ID Format Validation (INVALID_UPI_ID)
    // =========================================================================
    console.log('\n--- Test 13: Invalid UPI ID Format Validation ---');
    const issueResUpi = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 15, amountPaid: 30 }), // change = 15
    });
    const issueDataUpi: any = await issueResUpi.json();
    const ticketNumberUpi = issueDataUpi.ticket.ticketId;
    testTicketNumbers.push(ticketNumberUpi);

    // Claim QR
    await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({ qrPayload: issueDataUpi.qr.payload }),
    });

    const dbTicketUpi = await Ticket.findOne({ ticketNumber: ticketNumberUpi });
    if (dbTicketUpi) testTicketIds.push(dbTicketUpi._id);
    const dbQrUpi = await QRTransaction.findOne({ ticketId: dbTicketUpi?._id });
    if (dbQrUpi) testQrIds.push(dbQrUpi._id);

    // Bad UPI (no @)
    const badUpiRes1 = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumberUpi,
        upiId: 'invalid-upi-handle-missing-at',
      }),
    });
    const badUpiData1: any = await badUpiRes1.json();
    assert(
      badUpiRes1.status === 400 && badUpiData1.errorCode === 'INVALID_UPI_ID',
      'Test 13.1: Invalid UPI ID rejected with HTTP 400 INVALID_UPI_ID (missing @)'
    );

    // Bad UPI (empty)
    const badUpiRes2 = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passenger1Token}`,
      },
      body: JSON.stringify({
        ticketNumber: ticketNumberUpi,
        upiId: '   ',
      }),
    });
    const badUpiData2: any = await badUpiRes2.json();
    assert(
      badUpiRes2.status === 400 && badUpiData2.errorCode === 'INVALID_UPI_ID',
      'Test 13.2: Empty UPI ID rejected with HTTP 400 INVALID_UPI_ID'
    );

    // =========================================================================
    // TEST 14: Re-hydration Status Endpoint & Ownership Guard
    // =========================================================================
    console.log('\n--- Test 14: Re-hydration Status Endpoint (GET /api/refund/status/:ticketNumber) ---');
    // 14.1 Owner accesses settled ticket
    const statusResOwner = await fetch(`${BASE_URL}/refund/status/${ticketNumber1}`, {
      headers: { Authorization: `Bearer ${passenger1Token}` },
    });
    const statusDataOwner: any = await statusResOwner.json();
    assert(
      statusResOwner.status === 200 &&
        statusDataOwner.success === true &&
        statusDataOwner.ticket?.status === 'COMPLETED' &&
        statusDataOwner.claim?.status === 'REDEEMED' &&
        typeof statusDataOwner.settlement?.mockUpiRef === 'string',
      'Test 14.1: Owner successfully rehydrates status from MongoDB (Ticket: COMPLETED, Claim: REDEEMED)'
    );

    // 14.2 Other passenger accessing ticket -> 403 ACCESS_DENIED
    const statusResOther = await fetch(`${BASE_URL}/refund/status/${ticketNumber1}`, {
      headers: { Authorization: `Bearer ${passenger2Token}` },
    });
    const statusDataOther: any = await statusResOther.json();
    assert(
      statusResOther.status === 403 && statusDataOther.errorCode === 'ACCESS_DENIED',
      'Test 14.2: Unauthorized passenger blocked from viewing ticket status (HTTP 403 ACCESS_DENIED)'
    );

    // 14.3 Non-existent ticket -> 404 TICKET_NOT_FOUND
    const statusResNotFound = await fetch(`${BASE_URL}/refund/status/TC-NON-EXISTENT-999`, {
      headers: { Authorization: `Bearer ${passenger1Token}` },
    });
    const statusDataNotFound: any = await statusResNotFound.json();
    assert(
      statusResNotFound.status === 404 && statusDataNotFound.errorCode === 'TICKET_NOT_FOUND',
      'Test 14.3: Querying non-existent ticket returns HTTP 404 TICKET_NOT_FOUND'
    );

    // =========================================================================
    // TEST 15: Admin State Machine & Double-Action Prevention
    // =========================================================================
    console.log('\n--- Test 15: Admin State Machine & Double-Action Prevention ---');
    // 15.1 Re-approving already approved fraudLog2 -> 400 ALREADY_REVIEWED
    const doubleApproveRes = await fetch(`${BASE_URL}/admin/review/${fraudLog2?._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'Approved' }),
    });
    const doubleApproveData: any = await doubleApproveRes.json();
    assert(
      doubleApproveRes.status === 400 && doubleApproveData.errorCode === 'ALREADY_REVIEWED',
      'Test 15.1: Admin double-approval blocked with HTTP 400 ALREADY_REVIEWED'
    );

    // 15.2 Rejecting already approved fraudLog2 -> 400 ALREADY_REVIEWED
    const rejectAfterApproveRes = await fetch(`${BASE_URL}/admin/review/${fraudLog2?._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'Rejected' }),
    });
    const rejectAfterApproveData: any = await rejectAfterApproveRes.json();
    assert(
      rejectAfterApproveRes.status === 400 && rejectAfterApproveData.errorCode === 'ALREADY_REVIEWED',
      'Test 15.2: Rejecting already approved claim blocked with HTTP 400 ALREADY_REVIEWED'
    );

    // 15.3 Approving already rejected fraudLog3 -> 400 ALREADY_REVIEWED
    const approveAfterRejectRes = await fetch(`${BASE_URL}/admin/review/${fraudLog3?._id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ decision: 'Approved' }),
    });
    const approveAfterRejectData: any = await approveAfterRejectRes.json();
    assert(
      approveAfterRejectRes.status === 400 && approveAfterRejectData.errorCode === 'ALREADY_REVIEWED',
      'Test 15.3: Approving already rejected claim blocked with HTTP 400 ALREADY_REVIEWED'
    );

  } catch (testErr: any) {
    console.error(`\n❌ [TEST EXCEPTION]: ${testErr.message}`);
    failedCount++;
  } finally {
    // Teardown test data from MongoDB Atlas
    console.log('\n====================================================');
    console.log('  TEST CLEANUP (Non-destructive removal of test data)');
    console.log('====================================================');

    if (testFraudLogIds.length > 0) {
      const delFraud = await FraudLog.deleteMany({ _id: { $in: testFraudLogIds } });
      console.log(`[CLEANUP] Deleted ${delFraud.deletedCount} test FraudLog records`);
    }

    if (testQrIds.length > 0) {
      const delQr = await QRTransaction.deleteMany({ _id: { $in: testQrIds } });
      console.log(`[CLEANUP] Deleted ${delQr.deletedCount} test QRTransaction records`);
    }

    if (testTicketIds.length > 0) {
      const delTickets = await Ticket.deleteMany({ _id: { $in: testTicketIds } });
      console.log(`[CLEANUP] Deleted ${delTickets.deletedCount} test Ticket records`);
    }

    if (testUserIds.length > 0) {
      const delUsers = await User.deleteMany({ _id: { $in: testUserIds } });
      console.log(`[CLEANUP] Deleted ${delUsers.deletedCount} test User records`);
    }

    // Close in-process express server
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('[TEST SERVER] In-process Express server closed');

    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('[DB] Disconnected from MongoDB Atlas');

    // Stop AI process if spawned by this test
    if (aiProcess) {
      aiProcess.kill();
      console.log('[AI SERVICE] Terminated spawned Python microservice');
    }

    console.log('\n====================================================');
    console.log(`  PHASE 3 VERIFICATION SUMMARY`);
    console.log(`  Passed: ${passedCount}`);
    console.log(`  Failed: ${failedCount}`);
    console.log('====================================================\n');

    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runPhase3Tests();
