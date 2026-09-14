import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/authRoutes';
import tripRoutes from './routes/tripRoutes';
import ticketRoutes from './routes/ticketRoutes';
import qrRoutes from './routes/qrRoutes';
import refundRoutes from './routes/refundRoutes';
import adminRoutes from './routes/adminRoutes';
import complaintRoutes from './routes/complaintRoutes';
import rewardRoutes from './routes/rewardRoutes';

import User from './models/User';
import Trip from './models/Trip';
import Ticket from './models/Ticket';
import QRTransaction from './models/QRTransaction';
import Complaint from './models/Complaint';
import Reward from './models/Reward';
import FraudLog from './models/FraudLog';
import { createSignedQrPayload, verifyQrPayload } from './utils/qrSigner';

const PORT = 5096;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

async function runNewFeatureTests() {
  console.log('====================================================');
  console.log('  TRANSITCHANGE — 18-POINT NEW FEATURES VERIFICATION');
  console.log('====================================================\n');

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/qr', qrRoutes);
  app.use('/api/refund', refundRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/complaints', complaintRoutes);
  app.use('/api/rewards', rewardRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', () => resolve()));
  console.log(`[TEST SERVER] Running on port ${PORT}`);

  const isAtlasMode = !process.argv.includes('--memory') && process.env.TEST_MODE !== 'memory';
  let mongoMemoryServer: any = null;

  if (isAtlasMode) {
    console.log('[TEST MODE] REAL ATLAS VERIFICATION MODE');
    const envUri = process.env.MONGODB_URI;

    if (!envUri) {
      console.error('[DB] ❌ MONGODB_URI environment variable is required for this test.');
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. Configure MONGODB_URI in backend/.env or run with --memory.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }

    try {
      console.log('[DB] Connecting via MONGODB_URI (15s timeout)...');
      await mongoose.connect(envUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`[DB] Connected to MongoDB Atlas (${mongoose.connection.host})\n`);
    } catch (err: any) {
      console.error(`[DB] ❌ Atlas connection failed: ${err.message}`);
      console.error('[DB] STRICT ATLAS MODE: Aborting tests. MongoMemoryServer will NOT be used unless --memory flag is provided.');
      await new Promise<void>((resolve) => server.close(() => resolve()));
      process.exit(1);
    }
  } else {
    console.log('[TEST MODE] OFFLINE / ISOLATED MEMORY MODE');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    mongoMemoryServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    const uri = mongoMemoryServer.getUri();
    await mongoose.connect(uri);
    console.log(`[DB] MongoMemoryServer connected at ${uri}\n`);
  }

  // Ensure unique indexes are built immediately
  await Promise.all([
    User.init(),
    Trip.init(),
    Ticket.init(),
    QRTransaction.init(),
    Complaint.init(),
    Reward.init(),
  ]);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
      failed++;
    }
  }

  const testUserIds: any[] = [];
  const testTicketIds: any[] = [];
  const testTripIds: any[] = [];
  const testComplaintIds: any[] = [];
  const testRewardIds: any[] = [];

  try {
    const runId = Math.floor(Math.random() * 90000) + 10000;

    // Create Conductor User without bus number initially
    const conductor = await User.create({
      fullName: `Conductor Feat-${runId}`,
      email: `conductor_feat_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Conductor',
      staffId: `STF-F-${runId}`,
      mobileNumber: `901${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(conductor._id);

    // Create Passenger User
    const passenger: any = await User.create({
      fullName: `Passenger Feat-${runId}`,
      email: `passenger_feat_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Passenger',
      mobileNumber: `902${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(passenger._id);

    // Create Admin User
    const admin = await User.create({
      fullName: `Admin Feat-${runId}`,
      email: `admin_feat_${runId}@transit.com`,
      password: 'Password123!',
      role: 'Admin',
      mobileNumber: `903${Math.floor(1000000 + Math.random() * 9000000)}`,
    });
    testUserIds.push(admin._id);

    const conductorToken = jwt.sign(
      { id: conductor._id.toString(), role: conductor.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const passengerToken = jwt.sign(
      { id: passenger._id.toString(), role: passenger.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    const adminToken = jwt.sign(
      { id: admin._id.toString(), role: admin.role },
      process.env.JWT_SECRET as string,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------
    // TEST 1: Conductor can save bus number
    // -------------------------------------------------------------
    console.log('\n--- Test 1: Conductor Bus Number Setup ---');
    const busRes = await fetch(`${BASE_URL}/auth/bus-number`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ busNumber: 'TN-58-AB-9999' }),
    });
    const busData: any = await busRes.json();
    assert(
      busRes.status === 200 && busData.user?.busNumber === 'TN-58-AB-9999',
      'Test 1: Conductor successfully sets up bus number (TN-58-AB-9999)'
    );

    // -------------------------------------------------------------
    // TEST 2: Conductor cannot start trip with missing fields
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Trip Start Validation ---');
    const invalidTripRes = await fetch(`${BASE_URL}/trips/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ source: '' }),
    });
    assert(
      invalidTripRes.status === 400,
      'Test 2: Reject trip start with missing source/destination with HTTP 400'
    );

    // -------------------------------------------------------------
    // TEST 3: Conductor starts valid trip
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Start Valid Trip ---');
    const tripRes = await fetch(`${BASE_URL}/trips/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({
        source: 'Madurai Central',
        destination: 'Sivakasi Bus Stand',
      }),
    });
    const tripData: any = await tripRes.json();
    assert(
      tripRes.status === 201 && tripData.trip?.status === 'ACTIVE',
      'Test 3: Conductor starts active trip with route Madurai Central -> Sivakasi Bus Stand'
    );
    const activeTripId = tripData.trip?.tripId;
    if (tripData.trip?._id) testTripIds.push(tripData.trip._id);

    // -------------------------------------------------------------
    // TEST 4: Query active trip
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Query Active Trip ---');
    const getTripRes = await fetch(`${BASE_URL}/trips/active`, {
      headers: { Authorization: `Bearer ${conductorToken}` },
    });
    const getTripData: any = await getTripRes.json();
    assert(
      getTripRes.status === 200 && getTripData.trip?.tripId === activeTripId,
      'Test 4: Querying active trip returns the current active trip'
    );

    // -------------------------------------------------------------
    // TEST 5: Exact fare received (changeDue === 0) rejection
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Exact Fare Zero-Change Rejection ---');
    const exactFareRes = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 20, amountPaid: 20 }),
    });
    const exactFareData: any = await exactFareRes.json();
    assert(
      exactFareRes.status === 400 && exactFareData.errorCode === 'EXACT_FARE_RECEIVED',
      'Test 5: Zero-change ticket rejected with HTTP 400 EXACT_FARE_RECEIVED'
    );

    // -------------------------------------------------------------
    // TEST 6: Ticket issued is bound to active trip, bus, and route
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Ticket Linked to Active Trip ---');
    const issueRes1 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 18, amountPaid: 50 }), // change = 32
    });
    const issueData1: any = await issueRes1.json();
    assert(
      issueRes1.status === 201 && issueData1.ticket?.changeDue === 32,
      'Test 6a: Ticket successfully issued with changeDue=32'
    );
    const dbTicket1 = await Ticket.findOne({ ticketNumber: issueData1.ticket.ticketId });
    assert(
      dbTicket1?.busNumber === 'TN-58-AB-9999' &&
        dbTicket1?.source === 'Madurai Central' &&
        dbTicket1?.destination === 'Sivakasi Bus Stand',
      'Test 6b: Ticket in database reflects active trip busNumber and route'
    );
    if (dbTicket1) testTicketIds.push(dbTicket1._id);

    // -------------------------------------------------------------
    // TEST 7: End Trip lifecycle
    // -------------------------------------------------------------
    console.log('\n--- Test 7: End Trip Lifecycle ---');
    const endTripRes = await fetch(`${BASE_URL}/trips/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ tripId: activeTripId }),
    });
    const endTripData: any = await endTripRes.json();
    assert(
      endTripRes.status === 200 && endTripData.trip?.status === 'COMPLETED',
      'Test 7a: Trip ended and transitioned to COMPLETED'
    );
    assert(
      endTripData.trip?.ticketCount >= 1 && endTripData.trip?.totalChangeDispensed >= 32,
      'Test 7b: Trip summary tallies tickets issued and total change dispensed'
    );

    // -------------------------------------------------------------
    // TEST 8 & 9 & 10: Extended HMAC-SHA256 Cryptographic Tamper Protection
    // -------------------------------------------------------------
    console.log('\n--- Test 8-10: Extended HMAC Tamper Verification ---');
    const signed = createSignedQrPayload(
      'TC-TEST-TAMP',
      30,
      'TN-58-AB-9999',
      'Madurai Central',
      'Sivakasi Bus Stand'
    );
    const validPayload = signed.payloadObject;
    const verifyNormal = verifyQrPayload(validPayload);
    assert(verifyNormal.valid === true, 'Test 8: Valid extended 8-field QR payload passes verification');

    // Tampered bus number
    const tamperedBus = { ...validPayload, busNumber: 'TN-99-FAKE' };
    const verifyTamperedBus = verifyQrPayload(tamperedBus);
    assert(
      verifyTamperedBus.valid === false,
      'Test 9: Tampered busNumber fails HMAC signature validation'
    );

    // Tampered route
    const tamperedRoute = { ...validPayload, destination: 'Chennai' };
    const verifyTamperedRoute = verifyQrPayload(tamperedRoute);
    assert(
      verifyTamperedRoute.valid === false,
      'Test 10: Tampered destination fails HMAC signature validation'
    );

    // -------------------------------------------------------------
    // TEST 11: Conductor ticket history retrieval
    // -------------------------------------------------------------
    console.log('\n--- Test 11: Conductor Ticket History ---');
    const condHistoryRes = await fetch(`${BASE_URL}/tickets/conductor/history`, {
      headers: { Authorization: `Bearer ${conductorToken}` },
    });
    const condHistoryData: any = await condHistoryRes.json();
    const condTickets = condHistoryData.tickets || condHistoryData.data || [];
    assert(
      condHistoryRes.status === 200 && Array.isArray(condTickets) && condTickets.length > 0,
      'Test 11: Conductor can query shift ticket history'
    );

    // -------------------------------------------------------------
    // TEST 12: Passenger claims ticket & queries passenger history
    // -------------------------------------------------------------
    console.log('\n--- Test 12: Passenger History ---');
    const claimRes = await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issueData1.qr.payload }),
    });
    assert(claimRes.status === 200, 'Test 12a: Passenger successfully claims ticket');

    const passHistoryRes = await fetch(`${BASE_URL}/tickets/passenger/history`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    const passHistoryData: any = await passHistoryRes.json();
    const passTickets = passHistoryData.tickets || passHistoryData.data || [];
    assert(
      passHistoryRes.status === 200 &&
        Array.isArray(passTickets) &&
        passTickets.some((t: any) => t.ticketNumber === issueData1.ticket.ticketId),
      'Test 12b: Claimed ticket appears in passenger transaction history'
    );

    // -------------------------------------------------------------
    // TEST 13: Passenger problem reporting / complaints
    // -------------------------------------------------------------
    console.log('\n--- Test 13: Passenger Problem Reporting ---');
    const complaintRes = await fetch(`${BASE_URL}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        ticketNumber: issueData1.ticket.ticketId,
        category: 'WRONG_CHANGE_AMOUNT',
        description: 'Expected 35 rupees change but received 32.',
      }),
    });
    const complaintData: any = await complaintRes.json();
    const createdComplaint = complaintData.complaint || complaintData.data;
    assert(
      complaintRes.status === 201 && !!createdComplaint?.complaintId,
      'Test 13a: Passenger submits problem report (HTTP 201)'
    );
    const complaintId = createdComplaint?.complaintId;
    if (createdComplaint?._id) testComplaintIds.push(createdComplaint._id);

    // -------------------------------------------------------------
    // TEST 14: Invalid complaint category rejection
    // -------------------------------------------------------------
    console.log('\n--- Test 14: Invalid Complaint Category Rejection ---');
    const invalidCatRes = await fetch(`${BASE_URL}/complaints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        ticketNumber: issueData1.ticket.ticketId,
        category: 'INVALID_CATEGORY',
      }),
    });
    assert(
      invalidCatRes.status === 400,
      'Test 14: Invalid complaint category rejected with HTTP 400'
    );

    // -------------------------------------------------------------
    // TEST 15: Admin reviews and resolves complaint
    // -------------------------------------------------------------
    console.log('\n--- Test 15: Admin Complaint Resolution ---');
    const adminComplaintsRes = await fetch(`${BASE_URL}/complaints/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminComplaintsData: any = await adminComplaintsRes.json();
    const adminList = adminComplaintsData.complaints || adminComplaintsData.data || [];
    assert(
      adminComplaintsRes.status === 200 &&
        adminList.some((c: any) => c.complaintId === complaintId),
      'Test 15a: Admin lists passenger complaints'
    );

    const resolveRes = await fetch(
      `${BASE_URL}/complaints/admin/${createdComplaint._id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: 'RESOLVED',
          adminNotes: 'Verified with conductor shift logs. Fare discrepancy adjusted.',
        }),
      }
    );
    const resolveData: any = await resolveRes.json();
    const resolvedComp = resolveData.complaint || resolveData.data;
    assert(
      resolveRes.status === 200 && resolvedComp?.status === 'RESOLVED',
      'Test 15b: Admin resolves complaint with admin notes'
    );

    // -------------------------------------------------------------
    // TEST 16: Repeat bus travel generates Reward card
    // -------------------------------------------------------------
    console.log('\n--- Test 16 & 17: Repeat Bus Travel Reward Generation ---');
    // Ensure first ticket on this bus is marked as completed for passenger
    if (dbTicket1) {
      await Ticket.findByIdAndUpdate(dbTicket1._id, {
        status: 'COMPLETED',
        passengerId: passenger._id,
        busNumber: 'TN-58-AB-9999',
      });
    }

    // Issue second ticket on same bus
    const issueRes2 = await fetch(`${BASE_URL}/tickets/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conductorToken}`,
      },
      body: JSON.stringify({ fareAmount: 25, amountPaid: 50 }),
    });
    const issueData2: any = await issueRes2.json();
    const dbTicket2 = await Ticket.findOne({ ticketNumber: issueData2.ticket.ticketId });
    if (dbTicket2) testTicketIds.push(dbTicket2._id);

    await fetch(`${BASE_URL}/qr/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({ qrPayload: issueData2.qr.payload }),
    });

    const refundRes2 = await fetch(`${BASE_URL}/refund/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${passengerToken}`,
      },
      body: JSON.stringify({
        ticketNumber: issueData2.ticket.ticketId,
        upiId: 'pass@okhdfcbank',
      }),
    });
    const refundData2: any = await refundRes2.json();

    // If fail-closed offline AI directed to manual review, approve via admin endpoint to trigger reward
    if (refundData2.status === 'MANUAL_REVIEW') {
      const fLog = await FraudLog.findOne({
        passengerId: passenger._id,
        adminReviewed: false,
      }).sort({ createdAt: -1 });
      if (fLog) {
        await fetch(`${BASE_URL}/admin/review/${fLog._id}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            decision: 'Approved',
            adminNotes: 'Approved in test',
          }),
        });
      }
    }

    const myRewardsRes = await fetch(`${BASE_URL}/rewards/my`, {
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    const myRewardsData: any = await myRewardsRes.json();
    const rewardsList = myRewardsData.rewards || myRewardsData.data?.all || [];
    assert(
      myRewardsRes.status === 200 && rewardsList.length >= 1,
      'Test 16: Repeat bus travel awards passenger a reward scratch card'
    );
    const testReward = rewardsList[0];
    if (testReward?._id) testRewardIds.push(testReward._id);

    // Scratch reward
    const scratchRes = await fetch(`${BASE_URL}/rewards/${testReward?.rewardId}/scratch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${passengerToken}` },
    });
    const scratchData: any = await scratchRes.json();
    const scratchedReward = scratchData.reward || scratchData.data;
    assert(
      scratchRes.status === 200 && scratchedReward?.status === 'SCRATCHED',
      'Test 17: Passenger scratches reward card and transitions to SCRATCHED'
    );

    // -------------------------------------------------------------
    // TEST 18: Duplicate reward prevention on same triggerTicketId
    // -------------------------------------------------------------
    console.log('\n--- Test 18: Duplicate Reward Prevention ---');
    let duplicateRejected = false;
    try {
      await Reward.create({
        rewardId: `REW-DUP-${Date.now()}`,
        passengerId: passenger._id,
        busNumber: 'TN-58-AB-9999',
        triggerTicketId: dbTicket2!._id,
        rewardAmount: 5,
        status: 'LOCKED',
      });
    } catch (dupErr: any) {
      // Duplicate key error code 11000
      duplicateRejected =
        dupErr.code === 11000 ||
        String(dupErr.message).includes('11000') ||
        String(dupErr.message).includes('duplicate key');
    }
    assert(
      duplicateRejected === true,
      'Test 18: Unique compound index strictly blocks duplicate rewards for same triggerTicketId'
    );
  } catch (err: any) {
    console.error('Fatal error during test run:', err);
    failed++;
  } finally {
    // Non-destructive cleanup
    try {
      if (testRewardIds.length) await Reward.deleteMany({ _id: { $in: testRewardIds } });
      if (testComplaintIds.length) await Complaint.deleteMany({ _id: { $in: testComplaintIds } });
      if (testTripIds.length) await Trip.deleteMany({ _id: { $in: testTripIds } });
      if (testTicketIds.length) {
        await Ticket.deleteMany({ _id: { $in: testTicketIds } });
        await QRTransaction.deleteMany({ ticketId: { $in: testTicketIds } });
      }
      if (testUserIds.length) await User.deleteMany({ _id: { $in: testUserIds } });
      if (mongoMemoryServer) await mongoMemoryServer.stop();
      await mongoose.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }

    console.log('\n====================================================');
    console.log(`  NEW FEATURES SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runNewFeatureTests();
