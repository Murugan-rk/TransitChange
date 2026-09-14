# TransitChange

> **An academic prototype demonstrating secure QR-based digital change management, deterministic transaction validation, AI-assisted fraud detection, and simulated settlement.**

> [!IMPORTANT]
> **Demo / Simulated UPI Transaction — No real money is transferred.**
> This application is an educational and engineering prototype built to demonstrate stateful digital change dispensing in cash-first public transit environments. It does **not** process real banking transactions, real UPI fund transfers, or production payment gateway operations, and makes no claim of guaranteed fraud detection.

---

## Overview

In traditional public transport systems, passengers paying cash frequently encounter shortage of coins and small currency notes. **TransitChange** resolves this friction by issuing cryptographically tamper-evident, single-use digital change passes. Passengers scan the generated QR ticket with their smartphone, triggering multi-layered validation and receiving simulated instant refunds to their UPI ID.

### Core Architectural Layers

`mermaid
graph TD
    A[Conductor Bus POS] -->|Generate Signed Change QR| B[Digital Ticket]
    B -->|Scan with Smartphone| C[Passenger Client]
    C -->|Submit QR Claim| D[Layer 1: Deterministic Engine]
    D -->|HMAC-SHA256 & Nonce Check| E{Cryptographically Valid?}
    E -->|No| F[Reject Claim HTTP 400]
    E -->|Yes| G[Layer 2: AI Fraud Intelligence]
    G -->|Feature Vector Assessment| H{RandomForest Risk Tier}
    H -->|LOW_RISK| I[Layer 3: Simulated UPI Settlement]
    H -->|HIGH_RISK| J[Escalate to Admin Manual Review Queue]
`

1. **Layer 1 — Deterministic Security & Cryptographic Validation**:
   - Single-use random 16-byte nonce generation preventing replay attacks.
   - HMAC-SHA256 cryptographic signatures binding ticket reference, route, bus number, and exact change amount.
   - Fail-closed validation rejecting expired, duplicate, or tampered tokens.

2. **Layer 2 — AI-Assisted Fraud Intelligence**:
   - FastAPI microservice running an empirical Scikit-Learn RandomForestClassifier.
   - Analyzes multi-dimensional behavioral vectors (claim velocity, duplicate scan collisions, sub-second claim timing, conductor issuance anomaly).
   - High-risk anomalies are intercepted with explainable reason codes and diverted to the Admin Manual Review queue without financial disbursement.

3. **Layer 3 — Simulated UPI Settlement**:
   - Automated simulated UPI disbursement with realistic mock reference strings (NPCI-SIM-...).
   - MongoDB ACID multi-document transactions ensuring strict consistency across tickets, fraud logs, and redemption records.

---

## Technology Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Framer Motion
- **Backend API**: Node.js, Express 5, TypeScript, MongoDB, Mongoose, Socket.io
- **Security & Crypto**: HMAC-SHA256, JSON Web Tokens (JWT), Bcrypt, Helmet, Rate-Limiting
- **AI Microservice**: Python 3, FastAPI, Scikit-Learn (Random Forest Classifier), Pandas, NumPy, Joblib, Pydantic

---

## Repository Structure

`
TransitChange/
+-- backend/          # Node.js + Express 5 + TypeScript + Mongoose API
+-- frontend/         # React + Vite + Tailwind CSS User Interface
+-- ai-service/       # Python + FastAPI + Scikit-Learn ML microservice
+-- README.md         # Academic Project Documentation
`

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **Python**: 3.10 or higher
- **MongoDB**: Local MongoDB instance or MongoDB Atlas cluster

### 1. Backend Setup

`ash
cd backend
npm install
cp .env.example .env
# Configure MONGODB_URI, JWT_SECRET, QR_SIGNING_SECRET in .env
npm run dev
`

### 2. AI Service Setup

`ash
cd ai-service
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
# source venv/bin/activate

pip install -r requirements.txt
python main.py
`

### 3. Frontend Setup

`ash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL in .env if backend is not on http://localhost:5000/api
npm run dev
`

---

## Automated Verification & Testing

TransitChange includes a comprehensive 108-point regression test suite covering all transaction lifecycles, race condition guarantees, fail-closed AI behaviors, and extended trip routes:

`ash
cd backend
npx tsx test_phase1.ts --memory          # 11/11 tests
npx tsx test_phase2.ts --memory          # 19/19 tests
npx tsx test_phase3.ts --memory          # 40/40 tests
npx tsx test_new_features.ts --memory    # 22/22 tests
`

---

## Disclaimer & Academic Context

This software is developed strictly as an academic research and demonstration project. It is provided "as is" without warranty of any kind. No actual currency, banking channels, or payment rails are connected or utilized.
