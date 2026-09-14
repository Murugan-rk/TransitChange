"""
TransitChange — AI Fraud Detection Microservice (FastAPI)
Evaluates Layer 2 transit refund claim risk using a trained RandomForestClassifier,
with graceful fallback to a transparent baseline heuristic if the model artifact is missing.
"""

import os
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib

app = FastAPI(
    title="TransitChange AI Fraud Detection Service",
    description="Layer 2 Risk Intelligence Microservice for Transit Change Claims",
    version="2.0.0"
)

# Load trained RandomForest model if available
MODEL_PATH = os.path.join(os.path.dirname(__file__), "fraud_model.joblib")
rf_model = None
try:
    if os.path.exists(MODEL_PATH):
        rf_model = joblib.load(MODEL_PATH)
        print(f"[AI Service] Loaded trained Random Forest model from {MODEL_PATH}")
    else:
        print("[AI Service] Model artifact not found. Initializing with Baseline Heuristic.")
except Exception as err:
    print(f"[AI Service] Error loading model ({err}). Falling back to Baseline Heuristic.")
    rf_model = None

class FraudPredictionRequest(BaseModel):
    refund_amount: float
    fare: float
    change_amount: float
    passenger_frequency: int
    conductor_refund_rate: float
    duplicate_qr_attempts: int
    time_gap: int
    previous_refund_count: int

class FraudPredictionResponse(BaseModel):
    fraud_score: float
    risk_tier: str
    is_fraud: bool
    model_type: str
    flag_reasons: List[str]

@app.get("/")
def root():
    return {
        "service": "TransitChange AI Fraud Detection",
        "status": "online",
        "model_type": "RandomForestClassifier" if rf_model is not None else "BaselineHeuristic",
        "model_loaded": rf_model is not None,
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "model_type": "RandomForestClassifier" if rf_model is not None else "BaselineHeuristic",
        "model_loaded": rf_model is not None,
    }

@app.post("/predict", response_model=FraudPredictionResponse)
def predict_fraud(data: FraudPredictionRequest):
    flag_reasons = []

    # Check for domain-specific risk indicators for explainability
    if data.duplicate_qr_attempts > 1:
        flag_reasons.append(f"Multiple duplicate scan collisions ({data.duplicate_qr_attempts} attempts)")
    if data.refund_amount > 500:
        flag_reasons.append(f"Anomalously high refund denomination (Rs. {data.refund_amount:.2f})")
    if data.time_gap < 5:
        flag_reasons.append(f"Sub-second or near-instant claim speed ({data.time_gap}s after issuance)")
    if data.passenger_frequency > 8:
        flag_reasons.append(f"High passenger claim velocity ({data.passenger_frequency} claims in 24h)")
    if data.conductor_refund_rate > 0.60:
        flag_reasons.append(f"Elevated conductor change issuance ratio ({data.conductor_refund_rate:.1%})")

    if rf_model is not None:
        # Prepare feature vector matching training schema
        feature_df = pd.DataFrame([{
            'refund_amount': data.refund_amount,
            'fare': data.fare,
            'change_amount': data.change_amount,
            'passenger_frequency': data.passenger_frequency,
            'conductor_refund_rate': data.conductor_refund_rate,
            'duplicate_qr_attempts': data.duplicate_qr_attempts,
            'time_gap': data.time_gap,
            'previous_refund_count': data.previous_refund_count,
        }])
        
        proba = float(rf_model.predict_proba(feature_df)[0][1])
        model_type = "RandomForestClassifier"
    else:
        # Transparent rule-based baseline heuristic
        is_suspicious = len(flag_reasons) > 0
        proba = 0.85 if is_suspicious else 0.08
        model_type = "BaselineHeuristic"

    risk_tier = "HIGH_RISK" if proba >= 0.50 else "LOW_RISK"
    is_fraud = proba >= 0.50

    if not flag_reasons and is_fraud:
        flag_reasons.append("Multi-feature statistical risk threshold exceeded")

    return FraudPredictionResponse(
        fraud_score=round(proba, 4),
        risk_tier=risk_tier,
        is_fraud=is_fraud,
        model_type=model_type,
        flag_reasons=flag_reasons if is_fraud else [],
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
