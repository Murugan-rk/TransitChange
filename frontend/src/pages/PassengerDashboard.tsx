import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/services/api';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  Upload,
  CheckCircle2,
  QrCode,
  ShieldCheck,
  CreditCard,
  Clock,
  History,
  Award,
  Sparkles,
  Send,
  HelpCircle,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import {
  AccessibleButton,
  StatusBadge,
  FormField,
  ErrorMessage,
  SecurityDetails,
} from '@/components/ui';

interface VerifiedClaimResponse {
  success: boolean;
  message: string;
  claim: {
    ticketId: string;
    changeDue: number;
    status: string;
    claimedAt: string;
  };
  ticket: {
    ticketNumber: string;
    fareAmount: number;
    amountPaid: number;
    changeDue: number;
    busNumber?: string;
    source?: string;
    destination?: string;
    status: string;
    issuedAt: string;
  };
}

interface RefundResultData {
  status: 'COMPLETED' | 'MANUAL_REVIEW';
  riskTier: string;
  fraudScore: number;
  modelType?: string;
  flagReasons?: string[];
  settlement?: {
    amount: number;
    upiId: string;
    mockUpiRef: string;
    redeemedAt: string;
    disclaimer: string;
  };
  message?: string;
}

/**
 * Decodes a QR code from an image File using Html5Qrcode.
 * Employs an initial direct scan followed by multi-scale fallback
 * to robustly handle photos of QR tickets taken from mobile devices.
 */
async function decodeQrFromFile(file: File, scanner: Html5Qrcode): Promise<string> {
  // First attempt: direct scan using html5-qrcode's built-in decoder
  try {
    const directResult = await scanner.scanFile(file, false);
    if (directResult && directResult.trim()) {
      return directResult.trim();
    }
  } catch {
    // Direct scan failed; proceed to multi-scale fallback
  }

  // Multi-scale fallback for large/high-res camera captures
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const targetSizes = [1200, 800, 500];

      for (const maxDim of targetSizes) {
        if (img.width <= maxDim && img.height <= maxDim) continue;

        try {
          const canvas = document.createElement('canvas');
          const scale = maxDim / Math.max(img.width, img.height);
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob(res, 'image/jpeg', 0.92)
          );
          if (!blob) continue;

          const resizedFile = new File([blob], 'fallback_qr.jpg', { type: 'image/jpeg' });
          const result = await scanner.scanFile(resizedFile, false);
          if (result && result.trim()) {
            return resolve(result.trim());
          }
        } catch {
          // continue to next scale
        }
      }

      reject(new Error('NO_QR_DETECTED'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('IMAGE_LOAD_FAILED'));
    };

    img.src = objectUrl;
  });
}

export default function PassengerDashboard() {
  const { user } = useAuth();

  // Top-level Navigation: Scan QR / My Transactions / Rewards / Report Problem
  const [mainTab, setMainTab] = useState<'scan' | 'transactions' | 'rewards' | 'complaints'>('scan');

  // Scanner Sub-Tabs
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const [claimResult, setClaimResult] = useState<VerifiedClaimResponse | null>(null);

  // Phase 3: Simulated UPI & AI Settlement states
  const [upiId, setUpiId] = useState(user?.upiId || 'passenger@okhdfcbank');
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundResult, setRefundResult] = useState<RefundResultData | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);

  // Scanner container DOM element ref
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const scannerInstanceRef = useRef<Html5Qrcode | null>(null);
  const activeTabRef = useRef<'camera' | 'upload'>('camera');
  const isInitializingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Feature: Passenger Transactions
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transLoading, setTransLoading] = useState(false);

  // Feature: Complaints
  const [complaints, setComplaints] = useState<any[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintTicket, setComplaintTicket] = useState('');
  const [complaintCategory, setComplaintCategory] = useState('WRONG_CHANGE_AMOUNT');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [complaintMsg, setComplaintMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Feature: Rewards
  const [rewards, setRewards] = useState<any[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [scratchingId, setScratchingId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [rewardMsg, setRewardMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Stop camera helper with safe cleanup
  const stopCamera = async () => {
    const scanner = scannerInstanceRef.current;
    if (!scanner) {
      setIsScanning(false);
      return;
    }

    isStoppingRef.current = true;
    scannerInstanceRef.current = null;
    setIsScanning(false);

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch (err) {
      console.warn('Error stopping scanner:', err);
    } finally {
      isStoppingRef.current = false;
    }
  };

  // Start camera helper
  const startCamera = async () => {
    if (
      mainTab !== 'scan' ||
      activeTabRef.current !== 'camera' ||
      claimResult ||
      isInitializingRef.current ||
      isStoppingRef.current
    ) {
      return;
    }

    const container = scannerContainerRef.current;
    const domElement = document.getElementById('qr-reader-viewport');

    if (!container || !domElement || container.clientWidth <= 0) {
      requestAnimationFrame(() => {
        if (mainTab === 'scan' && activeTabRef.current === 'camera' && !claimResult && !scannerInstanceRef.current) {
          startCamera();
        }
      });
      return;
    }

    if (scannerInstanceRef.current) {
      return;
    }

    isInitializingRef.current = true;
    setError(null);

    try {
      const html5QrCode = new Html5Qrcode('qr-reader-viewport');
      scannerInstanceRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          await stopCamera();
          handleProcessClaim(decodedText);
        },
        () => {}
      );
      setIsScanning(true);
    } catch (err: any) {
      console.error('Failed to start camera scanner:', err);
      scannerInstanceRef.current = null;
      setIsScanning(false);
      setError({
        code: 'CAMERA_ERROR',
        message: 'Camera access is blocked. Please choose "Upload Change Ticket Photo".',
      });
    } finally {
      isInitializingRef.current = false;
    }
  };

  // Keep activeTabRef in sync
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Manage scanner lifecycle on tab switch
  useEffect(() => {
    if (mainTab === 'scan' && activeTab === 'camera' && !claimResult) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [mainTab, activeTab, claimResult]);

  // Load Jotform AI Agent Chatbot on Passenger Page
  useEffect(() => {
    const scriptSrc = 'https://cdn.jotfor.ms/agent/embedjs/01a09bc9ba20700086ec2da668537632e857/embed.js';
    const scriptId = 'jotform-agent-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;

    // Reveal existing Jotform chatbot widget if previously mounted
    const existingWidgets = document.querySelectorAll<HTMLElement>(
      '[class*="jfAgent"], [id*="jfAgent"], [id*="jotform"], iframe[src*="jotform"]'
    );
    existingWidgets.forEach((node) => {
      node.style.display = '';
    });

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = scriptSrc;
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      // Hide Jotform chatbot widget when navigating away from passenger dashboard
      const widgets = document.querySelectorAll<HTMLElement>(
        '[class*="jfAgent"], [id*="jfAgent"], [id*="jotform"], iframe[src*="jotform"]'
      );
      widgets.forEach((node) => {
        node.style.display = 'none';
      });
    };
  }, []);

  // Fetch Transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setTransLoading(true);
      const res = await api.get('/tickets/passenger/history');
      if (res.data?.success) {
        setTransactions(res.data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    } finally {
      setTransLoading(false);
    }
  }, []);

  // Fetch Complaints
  const fetchComplaints = useCallback(async () => {
    try {
      setComplaintsLoading(true);
      const res = await api.get('/complaints/passenger');
      if (res.data?.success) {
        setComplaints(res.data.complaints || []);
      }
    } catch (err) {
      console.error('Failed to fetch complaints:', err);
    } finally {
      setComplaintsLoading(false);
    }
  }, []);

  // Fetch Rewards
  const fetchRewards = useCallback(async () => {
    try {
      setRewardsLoading(true);
      const res = await api.get('/rewards/my');
      if (res.data?.success) {
        setRewards(res.data.rewards || []);
      }
    } catch (err) {
      console.error('Failed to fetch rewards:', err);
    } finally {
      setRewardsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'transactions') fetchTransactions();
    if (mainTab === 'complaints') fetchComplaints();
    if (mainTab === 'rewards') fetchRewards();
  }, [mainTab, fetchTransactions, fetchComplaints, fetchRewards]);

  // Process Claim QR
  const handleProcessClaim = async (payloadToProcess: string) => {
    if (!payloadToProcess || !payloadToProcess.trim()) {
      setError({
        code: 'EMPTY_INPUT',
        message: 'Please provide a valid QR ticket code.',
      });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await api.post('/qr/claim', {
        qrPayload: payloadToProcess.trim(),
      });

      if (response.data?.success) {
        setClaimResult(response.data);
      } else {
        setError({
          code: response.data?.errorCode || 'CLAIM_FAILED',
          message: response.data?.error || 'Claim could not be processed.',
        });
      }
    } catch (err: any) {
      const serverError = err.response?.data;
      setError({
        code: serverError?.errorCode || 'NETWORK_ERROR',
        message: serverError?.error || 'Failed to connect to verification server.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Phase 3: Settle Refund
  const handleSettleRefund = async () => {
    if (!claimResult) return;

    if (!upiId || !upiId.trim() || !upiId.includes('@')) {
      setRefundError('Please enter a valid UPI ID (e.g. yourname@okhdfcbank)');
      return;
    }

    try {
      setRefundLoading(true);
      setRefundError(null);

      const response = await api.post('/refund/process', {
        ticketNumber: claimResult.ticket.ticketNumber,
        upiId: upiId.trim(),
      });

      if (response.data?.success) {
        setRefundResult(response.data);
      } else {
        setRefundError(response.data?.error || 'Refund settlement could not be processed.');
      }
    } catch (err: any) {
      const serverErr = err.response?.data;
      setRefundError(serverErr?.error || 'Failed to connect to settlement service.');
    } finally {
      setRefundLoading(false);
    }
  };

  // Submit Complaint
  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setComplaintMsg(null);

    if (!complaintTicket.trim()) {
      setComplaintMsg({ type: 'error', text: 'Please enter a ticket number.' });
      return;
    }

    try {
      setComplaintSubmitting(true);
      const res = await api.post('/complaints', {
        ticketNumber: complaintTicket.trim().toUpperCase(),
        category: complaintCategory,
        description: complaintDesc.trim(),
      });

      if (res.data?.success) {
        setComplaintMsg({ type: 'success', text: `Problem report registered (Complaint ID: ${res.data.complaint.complaintId}).` });
        setComplaintTicket('');
        setComplaintDesc('');
        fetchComplaints();
      } else {
        setComplaintMsg({ type: 'error', text: res.data?.error || 'Failed to submit report.' });
      }
    } catch (err: any) {
      setComplaintMsg({ type: 'error', text: err.response?.data?.error || 'Failed to submit problem report.' });
    } finally {
      setComplaintSubmitting(false);
    }
  };

  // Scratch Reward
  const handleScratchReward = async (rewardId: string) => {
    try {
      setScratchingId(rewardId);
      setRewardMsg(null);
      const res = await api.post(`/rewards/${rewardId}/scratch`);
      if (res.data?.success) {
        setRewardMsg({
          type: 'success',
          text: `🎉 You scratched and unlocked ₹${res.data.reward.rewardAmount}!`,
        });
        fetchRewards();
      }
    } catch (err: any) {
      setRewardMsg({ type: 'error', text: err.response?.data?.error || 'Failed to scratch card.' });
    } finally {
      setScratchingId(null);
    }
  };

  // Claim Reward to UPI
  const handleClaimReward = async (rewardId: string) => {
    try {
      setClaimingId(rewardId);
      setRewardMsg(null);
      const res = await api.post(`/rewards/${rewardId}/claim`, {
        upiId: upiId.trim(),
      });
      if (res.data?.success) {
        setRewardMsg({
          type: 'success',
          text: `Reward ₹${res.data.settlement.amount} simulated disbursement sent to ${res.data.settlement.upiId}! Ref: ${res.data.settlement.mockUpiRef}`,
        });
        fetchRewards();
      }
    } catch (err: any) {
      setRewardMsg({ type: 'error', text: err.response?.data?.error || 'Failed to claim reward.' });
    } finally {
      setClaimingId(null);
    }
  };

  const handleReset = () => {
    stopCamera();
    setClaimResult(null);
    setRefundResult(null);
    setRefundError(null);
    setError(null);
    if (activeTab === 'camera') {
      setTimeout(() => startCamera(), 100);
    }
  };

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Top Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setMainTab('scan')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 whitespace-nowrap transition ${
              mainTab === 'scan'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <QrCode size={18} />
            Claim Change
          </button>
          <button
            type="button"
            onClick={() => setMainTab('transactions')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 whitespace-nowrap transition ${
              mainTab === 'transactions'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <History size={18} />
            My Transactions
          </button>
          <button
            type="button"
            onClick={() => setMainTab('rewards')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 whitespace-nowrap transition ${
              mainTab === 'rewards'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Award size={18} />
            Rewards
          </button>
          <button
            type="button"
            onClick={() => setMainTab('complaints')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 whitespace-nowrap transition ${
              mainTab === 'complaints'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <HelpCircle size={18} />
            Report a Problem
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: SCAN QR & CLAIM / SETTLE REFUND                         */}
        {/* ============================================================== */}
        {mainTab === 'scan' && (
          <AnimatePresence mode="wait">
            {!claimResult ? (
              <motion.div
                key="scan-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="text-center space-y-1">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    Claim Your Bus Change
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                    Scan the QR code printed on your conductor change slip to get an instant UPI refund.
                  </p>
                </div>

                {/* Sub-tab Selection */}
                <div className="flex p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl max-w-xs sm:max-w-sm mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('camera');
                      setError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                      activeTab === 'camera'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Camera size={16} />
                    Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('upload');
                      stopCamera();
                      setError(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition ${
                      activeTab === 'upload'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Upload size={16} />
                    Upload Image
                  </button>
                </div>

                {/* Persistent hidden container for file-based QR decoding */}
                <div
                  id="qr-file-upload-reader"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: '-9999px',
                    width: '300px',
                    height: '300px',
                    overflow: 'hidden',
                  }}
                />

                {error && <ErrorMessage message={error.message} />}

                {/* Mode A: Camera Scanner */}
                {activeTab === 'camera' && (
                  <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-4">
                    <div
                      ref={scannerContainerRef}
                      className="relative max-w-sm mx-auto aspect-square bg-slate-950 rounded-2xl overflow-hidden border-2 border-slate-700 flex items-center justify-center"
                    >
                      <div id="qr-reader-viewport" className="w-full h-full" />
                      {!isScanning && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4">
                          <Camera size={36} className="mb-2 text-slate-500 animate-pulse" />
                          <span className="text-xs">Preparing camera preview...</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Point camera directly at the QR code on the conductor receipt.
                    </p>
                  </div>
                )}

                {/* Mode B: File Upload */}
                {activeTab === 'upload' && (
                  <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-8 sm:p-12 shadow-xl text-center space-y-4">
                    <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 inline-block">
                      <Upload size={32} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        Upload Change Ticket Photo
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Select a clear photo or screenshot containing the QR code.
                      </p>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          setLoading(true);
                          setError(null);
                          const html5QrCode = new Html5Qrcode('qr-file-upload-reader');
                          try {
                            const decoded = await decodeQrFromFile(file, html5QrCode);
                            if (decoded) {
                              await handleProcessClaim(decoded);
                            }
                          } catch (scanErr: any) {
                            console.warn('QR image scan failed:', scanErr);
                            setError({
                              code: 'DECODE_FAILED',
                              message:
                                'Could not read a valid QR code from this image. Please ensure the QR code is clearly visible and well-lit, or try scanning with camera.',
                            });
                          } finally {
                            try {
                              html5QrCode.clear();
                            } catch {
                              // ignore cleanup error
                            }
                          }
                        } catch (err: any) {
                          console.error('QR scanner initialization error:', err);
                          setError({
                            code: 'SCANNER_INIT_ERROR',
                            message: 'Could not initialize QR decoder. Please try scanning with camera.',
                          });
                        } finally {
                          setLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <AccessibleButton
                      variant="primary"
                      size="lg"
                      onClick={() => fileInputRef.current?.click()}
                      isLoading={loading}
                      loadingText="Scanning image..."
                      leftIcon={<Upload size={18} />}
                    >
                      Choose Photo
                    </AccessibleButton>
                  </div>
                )}
              </motion.div>
            ) : (
              /* ============================================================== */
              /* VERIFIED TICKET & SIMULATED UPI REFUND SETTLEMENT              */
              /* ============================================================== */
              <motion.div
                key="verified-claim"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6"
              >
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
                    <ShieldCheck size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      Change Ticket Verified
                    </h2>
                    <p className="text-xs text-slate-500">
                      Your single-use change ticket is valid and ready for credit.
                    </p>
                  </div>
                </div>

                {/* Ticket Details Box */}
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-sm">
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-500">Ticket Reference:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {claimResult.ticket.ticketNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fare Amount:</span>
                    <span>₹{claimResult.ticket.fareAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Amount Paid:</span>
                    <span>₹{claimResult.ticket.amountPaid.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Change Due:</span>
                    <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                      ₹{claimResult.ticket.changeDue.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Collapsible Technical Details (Preserving Security Verification Visibility) */}
                <SecurityDetails
                  ticketNumber={claimResult.ticket.ticketNumber}
                  claimedAt={claimResult.claim.claimedAt}
                  title="View verification details"
                />

                {/* UPI ID Input & Settlement */}
                {!refundResult && (
                  <div className="space-y-4">
                    {refundError && <ErrorMessage message={refundError} />}
                    <FormField
                      id="upi-id-input"
                      label="Your UPI ID for Simulated Credit"
                      helperText="Enter your UPI handle (e.g. mobile@upi or username@okhdfcbank)"
                      required
                    >
                      <div className="relative">
                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          id="upi-id-input"
                          type="text"
                          value={upiId}
                          onChange={(e) => setUpiId(e.target.value)}
                          placeholder="yourname@okhdfcbank"
                          className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-base font-mono font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </FormField>

                    <AccessibleButton
                      variant="primary"
                      size="xl"
                      fullWidth
                      onClick={handleSettleRefund}
                      isLoading={refundLoading}
                      loadingText="Verifying and sending simulated credit..."
                      leftIcon={<CreditCard size={20} />}
                    >
                      Receive ₹{claimResult.ticket.changeDue.toFixed(2)} via Simulated UPI
                    </AccessibleButton>
                  </div>
                )}

                {/* Settlement Outcome A: COMPLETED */}
                {refundResult?.status === 'COMPLETED' && (
                  <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-3">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-bold">
                      <CheckCircle2 size={20} className="text-emerald-600" />
                      <span>Simulated UPI Payment Dispatched Successfully</span>
                    </div>
                    <div className="text-xs font-mono space-y-1 text-slate-700 dark:text-slate-300">
                      <div>UPI VPA: {refundResult.settlement?.upiId}</div>
                      <div>Ref: {refundResult.settlement?.mockUpiRef}</div>
                      <div>Disbursed: ₹{refundResult.settlement?.amount.toFixed(2)}</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/70 dark:bg-slate-900/60 text-center text-xs text-emerald-800 dark:text-emerald-300">
                      Demo / Simulated Transaction — No real money transferred.
                    </div>
                  </div>
                )}

                {/* Settlement Outcome B: MANUAL REVIEW */}
                {refundResult?.status === 'MANUAL_REVIEW' && (
                  <div className="p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2">
                    <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold">
                      <Clock size={20} className="text-amber-600" />
                      <span>Security Review in Progress</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      This transaction has been routed to the admin review queue. Your refund will be processed upon verification.
                    </p>
                  </div>
                )}

                <AccessibleButton
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={handleReset}
                  leftIcon={<QrCode size={18} />}
                >
                  Scan Another Ticket
                </AccessibleButton>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ============================================================== */}
        {/* TAB 2: MY TRANSACTIONS                                         */}
        {/* ============================================================== */}
        {mainTab === 'transactions' && (
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  My Claimed Tickets
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  History of change tickets you have scanned and redeemed.
                </p>
              </div>
              <AccessibleButton
                variant="outline"
                size="sm"
                onClick={fetchTransactions}
                isLoading={transLoading}
              >
                Refresh
              </AccessibleButton>
            </div>

            {transactions.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <History size={36} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium">No claimed tickets in your history yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx._id || tx.ticketNumber}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                          {tx.ticketNumber}
                        </span>
                        <StatusBadge status={tx.status} />
                      </div>
                      <div className="text-xs text-slate-500">
                        Route: <span className="font-semibold text-slate-700 dark:text-slate-300">{tx.source || 'N/A'} ➔ {tx.destination || 'N/A'}</span> (Bus: {tx.busNumber || 'N/A'})
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {new Date(tx.issuedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block">Change Amount</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          ₹{tx.changeDue.toFixed(2)}
                        </span>
                      </div>
                      <AccessibleButton
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setComplaintTicket(tx.ticketNumber);
                          setMainTab('complaints');
                        }}
                      >
                        Report Issue
                      </AccessibleButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: REWARDS (Repeat Bus Travel Loyalty)                      */}
        {/* ============================================================== */}
        {mainTab === 'rewards' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 border-2 border-amber-300 dark:border-amber-800">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-amber-500 text-white">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    Repeat Bus Rider Rewards
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                    Earn scratch cards for taking repeat trips on the same bus route!
                  </p>
                </div>
              </div>
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 mt-2">
                Simulated ₹0/₹5/₹10 reward — No real money is transferred.
              </p>
            </div>

            {rewardMsg && (
              <div
                className={`p-4 rounded-2xl border text-sm font-semibold ${
                  rewardMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-red-50 border-red-300 text-red-800'
                }`}
              >
                {rewardMsg.text}
              </div>
            )}

            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  My Scratch Cards
                </h3>
                <AccessibleButton
                  variant="outline"
                  size="sm"
                  onClick={fetchRewards}
                  isLoading={rewardsLoading}
                >
                  Refresh
                </AccessibleButton>
              </div>

              {rewards.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Award size={36} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium">No rewards unlocked yet.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Take more than one trip on the same bus to qualify for a simulated scratch card!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {rewards.map((rew) => (
                    <div
                      key={rew._id || rew.rewardId}
                      className="p-5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-3"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Bus {rew.busNumber}
                          </span>
                          <h4 className="text-sm font-black text-slate-900 dark:text-white">
                            Loyalty Reward
                          </h4>
                        </div>
                        <StatusBadge status={rew.status} />
                      </div>

                      {(rew.status === 'LOCKED' || rew.status === 'AVAILABLE') && (
                        <div className="py-6 text-center space-y-2">
                          <Sparkles className="mx-auto text-amber-500 animate-spin" size={28} />
                          <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                            Simulated Rider Scratch Card Unlocked!
                          </p>
                          <AccessibleButton
                            variant="primary"
                            size="sm"
                            onClick={() => handleScratchReward(rew.rewardId)}
                            isLoading={scratchingId === rew.rewardId}
                          >
                            Scratch to Reveal
                          </AccessibleButton>
                        </div>
                      )}

                      {rew.status === 'SCRATCHED' && (
                        <div className="py-4 text-center space-y-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                          <span className="text-xs text-slate-500">Unlocked Simulated Reward</span>
                          <div className="text-2xl font-black text-emerald-600 font-mono">
                            ₹{rew.rewardAmount}
                          </div>
                          <p className="text-[11px] text-slate-400">
                            Simulated ₹0/₹5/₹10 reward — No real money is transferred.
                          </p>
                          {rew.rewardAmount > 0 ? (
                            <AccessibleButton
                              variant="primary"
                              size="sm"
                              onClick={() => handleClaimReward(rew.rewardId)}
                              isLoading={claimingId === rew.rewardId}
                            >
                              Simulated Claim to UPI ({upiId})
                            </AccessibleButton>
                          ) : (
                            <span className="text-xs text-slate-400 block">Thank you for riding transit!</span>
                          )}
                        </div>
                      )}

                      {rew.status === 'CLAIMED' && (
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-center text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                          <div className="font-bold">Simulated Reward ₹{rew.rewardAmount} Credited</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Simulated Ref: {rew.mockUpiRef || 'NPCI-SIM'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Simulated ₹0/₹5/₹10 reward — No real money is transferred.
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: REPORT A PROBLEM (Complaints)                           */}
        {/* ============================================================== */}
        {mainTab === 'complaints' && (
          <div className="space-y-6">
            {/* Report Form */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Report a Problem
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Have an issue with a ticket, change amount, or QR scanning? Let administration know.
                </p>
              </div>

              {complaintMsg && (
                <div
                  className={`p-4 rounded-2xl border text-sm font-semibold ${
                    complaintMsg.type === 'success'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-red-50 border-red-300 text-red-800'
                  }`}
                >
                  {complaintMsg.text}
                </div>
              )}

              <form onSubmit={handleSubmitComplaint} className="space-y-4">
                <FormField
                  id="ticket-number-input"
                  label="Ticket Number / Reference"
                  helperText="Enter the ticket ID (e.g. TC-20260913-XXXXXX)"
                  required
                >
                  <input
                    id="ticket-number-input"
                    type="text"
                    required
                    value={complaintTicket}
                    onChange={(e) => setComplaintTicket(e.target.value.toUpperCase())}
                    placeholder="e.g. TC-20260913-A1B2C3"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-sm font-mono font-bold text-slate-900 dark:text-white outline-none uppercase focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>

                <FormField
                  id="category-select"
                  label="Problem Category"
                  required
                >
                  <select
                    id="category-select"
                    value={complaintCategory}
                    onChange={(e) => setComplaintCategory(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WRONG_CHANGE_AMOUNT">Wrong Change Amount</option>
                    <option value="QR_SCAN_FAILED">QR Code Scan Failed / Unreadable</option>
                    <option value="REFUND_NOT_RECEIVED">Refund Not Received in UPI</option>
                    <option value="CONDUCTOR_DISPUTE">Conductor Dispute</option>
                    <option value="OTHER">Other Problem</option>
                  </select>
                </FormField>

                <FormField
                  id="description-input"
                  label="Description (Optional)"
                  helperText="Explain what happened"
                >
                  <textarea
                    id="description-input"
                    rows={3}
                    value={complaintDesc}
                    onChange={(e) => setComplaintDesc(e.target.value)}
                    placeholder="Provide details about the issue..."
                    className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </FormField>

                <AccessibleButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={complaintSubmitting}
                  leftIcon={<Send size={18} />}
                >
                  Submit Problem Report
                </AccessibleButton>
              </form>
            </div>

            {/* Submitted Complaints List */}
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  My Submitted Problem Reports
                </h3>
                <AccessibleButton
                  variant="outline"
                  size="sm"
                  onClick={fetchComplaints}
                  isLoading={complaintsLoading}
                >
                  Refresh
                </AccessibleButton>
              </div>

              {complaints.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">
                  No problem reports filed.
                </p>
              ) : (
                <div className="space-y-3">
                  {complaints.map((c) => (
                    <div
                      key={c._id || c.complaintId}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-xs text-blue-600">
                          {c.complaintId} (Ticket: {c.ticketNumber})
                        </span>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Category: {c.category.replace(/_/g, ' ')}
                      </div>
                      {c.description && (
                        <p className="text-xs text-slate-500">{c.description}</p>
                      )}
                      {c.adminNotes && (
                        <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-xs text-blue-900 dark:text-blue-200">
                          <strong>Admin Response:</strong> {c.adminNotes}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 font-mono">
                        Filed: {new Date(c.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
