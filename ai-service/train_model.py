"""
TransitChange — Synthetic Data Generator & Random Forest Training Pipeline
Generates domain-grounded transit change refund transaction data and trains
a RandomForestClassifier to detect Layer 2 fraud anomalies.
"""

import sys
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix
import joblib

def generate_synthetic_transit_dataset(n_samples=5000, random_state=42):
    np.random.seed(random_state)
    
    # 95% Legitimate, 5% Fraudulent
    n_fraud = int(n_samples * 0.05)
    n_legit = n_samples - n_fraud

    # --- 1. Legitimate Transactions (n_legit) ---
    legit_fares = np.random.choice([10, 15, 20, 25, 30, 35, 40], size=n_legit)
    # Common passenger notes >= 50
    legit_notes = np.random.choice([50, 100, 200], size=n_legit, p=[0.60, 0.30, 0.10])
    legit_change = (legit_notes - legit_fares).astype(float)
    legit_refund = legit_change.copy()
    
    # Typical passenger claim frequency in 24h: 1 to 3
    legit_freq = np.random.choice([1, 2, 3], size=n_legit, p=[0.70, 0.25, 0.05])
    # Conductor refund rate: typical 0.20 to 0.40
    legit_cond_rate = np.round(np.random.uniform(0.18, 0.38, size=n_legit), 3)
    # Duplicate attempts: 0 for normal users
    legit_dup_attempts = np.zeros(n_legit, dtype=int)
    # Time gap: 20s to 300s
    legit_time_gap = np.random.randint(20, 300, size=n_legit)
    # Historical completed refunds: 1 to 10
    legit_prev_refunds = np.random.randint(1, 10, size=n_legit)

    legit_labels = np.zeros(n_legit, dtype=int)

    # --- 2. Fraudulent / Anomalous Transactions (n_fraud) ---
    fraud_fares = np.random.choice([10, 15, 20], size=n_fraud)
    # Extreme/anomalous refund amounts
    fraud_refund = np.random.choice([600.0, 850.0, 1200.0, 1500.0], size=n_fraud)
    fraud_change = fraud_refund.copy()
    
    # Rapid repeat passenger claim velocity (>8 per day)
    fraud_freq = np.random.randint(8, 25, size=n_fraud)
    # High conductor collusion refund rate (>0.65)
    fraud_cond_rate = np.round(np.random.uniform(0.65, 0.95, size=n_fraud), 3)
    # Repeated duplicate QR scans
    fraud_dup_attempts = np.random.choice([2, 3, 4], size=n_fraud, p=[0.5, 0.3, 0.2])
    # Impossible time gap (< 3 seconds between issuance and remote claim)
    fraud_time_gap = np.random.randint(1, 4, size=n_fraud)
    # Abnormally high previous refund velocity
    fraud_prev_refunds = np.random.randint(25, 70, size=n_fraud)

    fraud_labels = np.ones(n_fraud, dtype=int)

    # Combine into DataFrame
    X = pd.DataFrame({
        'refund_amount': np.concatenate([legit_refund, fraud_refund]),
        'fare': np.concatenate([legit_fares, fraud_fares]),
        'change_amount': np.concatenate([legit_change, fraud_change]),
        'passenger_frequency': np.concatenate([legit_freq, fraud_freq]),
        'conductor_refund_rate': np.concatenate([legit_cond_rate, fraud_cond_rate]),
        'duplicate_qr_attempts': np.concatenate([legit_dup_attempts, fraud_dup_attempts]),
        'time_gap': np.concatenate([legit_time_gap, fraud_time_gap]),
        'previous_refund_count': np.concatenate([legit_prev_refunds, fraud_prev_refunds]),
    })
    y = np.concatenate([legit_labels, fraud_labels])

    return X, y

def train_and_export():
    print("=========================================================", flush=True)
    print(" TransitChange AI — Training Random Forest Fraud Model", flush=True)
    print("=========================================================", flush=True)
    
    print("\n[1/4] Generating 5,000 synthetic transit domain transactions...", flush=True)
    X, y = generate_synthetic_transit_dataset(n_samples=5000, random_state=42)
    print(f"Dataset generated: {len(X)} samples, {sum(y)} fraud ({sum(y)/len(y):.1%})", flush=True)

    print("\n[2/4] Splitting into 80% Train / 20% Test stratified sets...", flush=True)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print("\n[3/4] Fitting RandomForestClassifier (n_estimators=50, max_depth=6)...", flush=True)
    model = RandomForestClassifier(
        n_estimators=50,
        max_depth=6,
        random_state=42,
        class_weight='balanced'
    )
    model.fit(X_train, y_train)

    print("\n[4/4] Evaluating on 20% held-out test split:", flush=True)
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    print("\nClassification Report (Held-out Test Split):", flush=True)
    print(classification_report(y_test, y_pred, target_names=['Legitimate', 'Fraud']), flush=True)
    
    roc_auc = roc_auc_score(y_test, y_proba)
    print(f"ROC-AUC Score: {roc_auc:.4f}", flush=True)
    
    print("\nConfusion Matrix:", flush=True)
    print(confusion_matrix(y_test, y_pred), flush=True)

    model_path = "fraud_model.joblib"
    joblib.dump(model, model_path)
    print(f"\n[OK] Successfully saved trained model to: {model_path}", flush=True)

if __name__ == "__main__":
    train_and_export()
