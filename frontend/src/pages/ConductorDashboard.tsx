import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/services/api';
import { QRCodeSVG } from 'qrcode.react';
import {
  QrCode,
  Copy,
  Check,
  Plus,
  Bus,
  MapPin,
  Printer,
  Download,
  History,
  AlertCircle,
  Play,
  Square,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import {
  AccessibleButton,
  AmountDisplay,
  FormField,
  ErrorMessage,
  StatusBadge,
} from '@/components/ui';

interface TicketData {
  ticketId: string;
  fareAmount: number;
  amountPaid: number;
  changeDue: number;
  busNumber?: string;
  source?: string;
  destination?: string;
  issuedAt: string;
}

interface QrData {
  payload: string;
  status: string;
}

interface TripData {
  tripId: string;
  busNumber: string;
  source: string;
  destination: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  ticketCount?: number;
  totalChangeDispensed?: number;
}

const COMMON_NOTE_AMOUNTS = [10, 20, 50, 100, 200, 500];

export default function ConductorDashboard() {
  const { user, updateUser } = useAuth();

  // Active view tab: Issue Ticket or Ticket History
  const [activeView, setActiveView] = useState<'issue' | 'history'>('issue');

  // Bus setup state
  const [busNumberInput, setBusNumberInput] = useState('');
  const [busSaving, setBusSaving] = useState(false);
  const [busError, setBusError] = useState('');

  // Trip setup state
  const [activeTrip, setActiveTrip] = useState<TripData | null>(null);
  const [sourceInput, setSourceInput] = useState('Central Bus Station');
  const [destInput, setDestInput] = useState('Railway Station');
  const [tripLoading, setTripLoading] = useState(false);
  const [tripError, setTripError] = useState('');
  const [endTripSummary, setEndTripSummary] = useState<any>(null);

  // Ticket issuance state
  const [fareAmount, setFareAmount] = useState<string>('15');
  const [amountPaid, setAmountPaid] = useState<string>('50');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{
    ticket: TicketData;
    qr: QrData;
  } | null>(null);

  // Shift session statistics
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [sessionTotalChange, setSessionTotalChange] = useState<number>(0);

  // History state
  const [ticketHistory, setTicketHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fareNum = parseFloat(fareAmount) || 0;
  const paidNum = parseFloat(amountPaid) || 0;
  const changeDue = paidNum >= fareNum && fareNum > 0 ? Number((paidNum - fareNum).toFixed(2)) : 0;
  const isCashInsufficient = paidNum > 0 && fareNum > 0 && paidNum < fareNum;
  const isExactFare = paidNum > 0 && fareNum > 0 && paidNum === fareNum;

  // Check for active trip on mount
  const checkActiveTrip = useCallback(async () => {
    try {
      const res = await api.get('/trips/active');
      if (res.data?.success && res.data.trip) {
        setActiveTrip(res.data.trip);
      } else {
        setActiveTrip(null);
      }
    } catch (err) {
      console.warn('No active trip found');
      setActiveTrip(null);
    }
  }, []);

  // Fetch ticket history
  const fetchTicketHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/tickets/conductor/history');
      if (res.data?.success) {
        setTicketHistory(res.data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch conductor ticket history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.busNumber) {
      checkActiveTrip();
    }
  }, [user?.busNumber, checkActiveTrip]);

  useEffect(() => {
    if (activeView === 'history') {
      fetchTicketHistory();
    }
  }, [activeView, fetchTicketHistory]);

  // Handle bus number save
  const handleSaveBusNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusError('');

    if (!busNumberInput.trim()) {
      setBusError('Please enter a valid bus number (e.g. TN-58-N-1234)');
      return;
    }

    try {
      setBusSaving(true);
      const res = await api.put('/auth/bus-number', {
        busNumber: busNumberInput.trim().toUpperCase(),
      });

      if (res.data?.success) {
        updateUser({ busNumber: res.data.user.busNumber });
        setBusNumberInput('');
      } else {
        setBusError(res.data?.error || 'Failed to save bus number');
      }
    } catch (err: any) {
      setBusError(err.response?.data?.error || 'Failed to save bus number');
    } finally {
      setBusSaving(false);
    }
  };

  // Handle start trip
  const handleStartTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    setTripError('');

    if (!sourceInput.trim() || !destInput.trim()) {
      setTripError('Please enter both source and destination.');
      return;
    }

    try {
      setTripLoading(true);
      const res = await api.post('/trips/start', {
        source: sourceInput.trim(),
        destination: destInput.trim(),
      });

      if (res.data?.success) {
        setActiveTrip(res.data.trip);
      } else {
        setTripError(res.data?.error || 'Failed to start trip.');
      }
    } catch (err: any) {
      setTripError(err.response?.data?.error || 'Failed to start trip.');
    } finally {
      setTripLoading(false);
    }
  };

  // Handle end trip
  const handleEndTrip = async () => {
    if (!activeTrip) return;
    setTripError('');

    try {
      setTripLoading(true);
      const res = await api.post('/trips/end', {
        tripId: activeTrip.tripId,
      });

      if (res.data?.success) {
        setEndTripSummary(res.data.trip);
        setActiveTrip(null);
      } else {
        setTripError(res.data?.error || 'Failed to end trip.');
      }
    } catch (err: any) {
      setTripError(err.response?.data?.error || 'Failed to end trip.');
    } finally {
      setTripLoading(false);
    }
  };

  // Handle ticket issuance
  const handleGenerateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fareNum || fareNum <= 0) {
      setError('Please enter the ticket fare amount.');
      return;
    }
    if (!paidNum || paidNum <= 0) {
      setError('Please enter the cash received from passenger.');
      return;
    }
    if (paidNum < fareNum) {
      setError(`Cash received (₹${paidNum}) is not enough for the ₹${fareNum} fare.`);
      return;
    }
    if (paidNum === fareNum) {
      setError('Exact fare received — no change ticket required.');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/tickets/issue', {
        fareAmount: fareNum,
        amountPaid: paidNum,
      });

      if (response.data?.success) {
        setCreatedTicket({
          ticket: {
            ...response.data.ticket,
            busNumber: user?.busNumber || activeTrip?.busNumber || 'TN-58-N-1234',
            source: activeTrip?.source || 'Origin',
            destination: activeTrip?.destination || 'Destination',
          },
          qr: response.data.qr,
        });
        setSessionCount((prev) => prev + 1);
        setSessionTotalChange((prev) => prev + response.data.ticket.changeDue);
      } else {
        setError(response.data?.error || 'Could not create change ticket. Please try again.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to connect to ticket service.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayload = () => {
    if (createdTicket?.qr?.payload) {
      navigator.clipboard.writeText(createdTicket.qr.payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleDownloadReceipt = () => {
    if (!createdTicket) return;
    const { ticket } = createdTicket;
    const content = `
========================================
       TRANSITCHANGE DIGITAL RECEIPT
========================================
Bus Number:    ${ticket.busNumber || user?.busNumber || 'N/A'}
Conductor ID:  ${user?.staffId || 'STF-MAIN'}
Route:         ${ticket.source || 'N/A'} -> ${ticket.destination || 'N/A'}
Date & Time:   ${new Date(ticket.issuedAt || Date.now()).toLocaleString()}
Ticket Ref:    ${ticket.ticketId}

Fare Amount:   INR ${ticket.fareAmount.toFixed(2)}
Amount Paid:   INR ${ticket.amountPaid.toFixed(2)}
----------------------------------------
CHANGE DUE:    INR ${ticket.changeDue.toFixed(2)}
========================================
Scan QR code on your mobile device to claim your change directly into your bank account.

Notice: Demo / Simulated Transaction — No real money is transferred.
========================================
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Receipt_${ticket.ticketId}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setCreatedTicket(null);
    setAmountPaid('');
    setError('');
    setCopied(false);
  };

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* ============================================================== */}
        {/* MODAL 1: SET UP YOUR BUS (Required if conductor has no bus)     */}
        {/* ============================================================== */}
        {!user?.busNumber && (
          <div className="mb-8 p-6 sm:p-8 rounded-3xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-300 dark:border-blue-800 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-blue-600 text-white">
                <Bus size={24} />
              </div>
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  Set Up Your Bus
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Please enter your assigned bus number before starting your shift.
                </p>
              </div>
            </div>

            {busError && <ErrorMessage message={busError} />}

            <form onSubmit={handleSaveBusNumber} className="mt-4 flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  required
                  value={busNumberInput}
                  onChange={(e) => setBusNumberInput(e.target.value.toUpperCase())}
                  placeholder="e.g. TN-58-N-1234"
                  className="w-full px-4 py-3.5 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-lg font-bold font-mono text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none uppercase"
                />
              </div>
              <AccessibleButton
                type="submit"
                variant="primary"
                size="lg"
                isLoading={busSaving}
                loadingText="Saving Bus..."
              >
                Continue
              </AccessibleButton>
            </form>
          </div>
        )}

        {/* ============================================================== */}
        {/* TRIP SUMMARY NOTIFICATION (After trip ends)                    */}
        {/* ============================================================== */}
        {endTripSummary && (
          <div className="mb-6 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                Trip Completed
              </span>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Route: {endTripSummary.source} ➔ {endTripSummary.destination}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Total Tickets: <span className="font-bold">{endTripSummary.ticketCount || 0}</span> | Total Change: <span className="font-bold text-emerald-600">₹{(endTripSummary.totalChangeDispensed || 0).toFixed(2)}</span>
              </p>
              <span className="text-xs text-slate-500">
                Ended at: {new Date(endTripSummary.endedAt || Date.now()).toLocaleTimeString()}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEndTripSummary(null)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Shift Counter Bar (Clean & Professional) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 sm:mb-8">
          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Bus Number
            </span>
            <span className="text-base sm:text-lg font-black text-blue-600 dark:text-blue-400 font-mono">
              {user?.busNumber || 'Not Set'}
            </span>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Conductor Staff ID
            </span>
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
              {user?.staffId || 'STF-MAIN'}
            </span>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Tickets Issued
            </span>
            <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
              {sessionCount}
            </span>
          </div>

          <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">
              Change Dispensed
            </span>
            <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
              ₹{sessionTotalChange.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Active Trip Banner or Setup Card */}
        {user?.busNumber && (
          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
            {activeTrip ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                        Active Trip
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        Started: {new Date(activeTrip.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                      {activeTrip.source} <span className="text-blue-500">➔</span> {activeTrip.destination}
                    </div>
                  </div>
                </div>
                <AccessibleButton
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={handleEndTrip}
                  isLoading={tripLoading}
                  leftIcon={<Square size={16} />}
                >
                  End Trip
                </AccessibleButton>
              </div>
            ) : (
              <form onSubmit={handleStartTrip} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Play size={18} className="text-blue-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Start a New Trip
                  </h3>
                </div>
                {tripError && <ErrorMessage message={tripError} />}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Source Stop"
                    value={sourceInput}
                    onChange={(e) => setSourceInput(e.target.value)}
                    className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Destination Stop"
                    value={destInput}
                    onChange={(e) => setDestInput(e.target.value)}
                    className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end">
                  <AccessibleButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={tripLoading}
                    leftIcon={<Play size={16} />}
                  >
                    Start Trip
                  </AccessibleButton>
                </div>
              </form>
            )}
          </div>
        )}

        {/* View Selection Tabs: Issue Ticket vs Ticket History */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-2">
          <button
            type="button"
            onClick={() => setActiveView('issue')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 transition ${
              activeView === 'issue'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <QrCode size={18} />
            Issue Ticket
          </button>
          <button
            type="button"
            onClick={() => setActiveView('history')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 transition ${
              activeView === 'history'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <History size={18} />
            Shift History
          </button>
        </div>

        {activeView === 'issue' ? (
          <AnimatePresence mode="wait">
            {!createdTicket ? (
              /* ============================================================== */
              /* STEP 1: FAST ISSUE FORM                                        */
              /* ============================================================== */
              <motion.div
                key="issue-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
              >
                <div className="space-y-1">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                    Issue Change Ticket
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400">
                    Enter fare and cash received. A single-use change QR will be generated instantly.
                  </p>
                </div>

                {error && <ErrorMessage message={error} />}

                <form onSubmit={handleGenerateTicket} className="space-y-6">
                  {/* 1. Fare Amount Field */}
                  <FormField
                    id="fare-input"
                    label="1. Bus Fare (₹)"
                    helperText="Enter the trip ticket fare"
                    required
                  >
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400 select-none">
                        ₹
                      </span>
                      <input
                        id="fare-input"
                        type="number"
                        step="any"
                        min="1"
                        required
                        value={fareAmount}
                        onChange={(e) => setFareAmount(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-full pl-9 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-xl font-black font-mono text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </FormField>

                  {/* 2. Cash Received Field & Quick Buttons */}
                  <div className="space-y-2.5">
                    <FormField
                      id="paid-input"
                      label="2. Cash Tendered by Passenger (₹)"
                      helperText="Select or type the currency note given by the passenger"
                      required
                      error={
                        isCashInsufficient
                          ? `Cash received (₹${paidNum}) is less than the fare (₹${fareNum}). Short by ₹${(fareNum - paidNum).toFixed(2)}`
                          : undefined
                      }
                    >
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-400 select-none">
                          ₹
                        </span>
                        <input
                          id="paid-input"
                          type="number"
                          step="any"
                          min="1"
                          required
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                          placeholder="e.g. 50"
                          className="w-full pl-9 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-xl font-black font-mono text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </FormField>

                    {/* Quick Note Tap Buttons */}
                    <div className="flex flex-wrap gap-2 pt-1" role="group" aria-label="Quick cash note amounts">
                      {COMMON_NOTE_AMOUNTS.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAmountPaid(amt.toString())}
                          className={`min-h-[44px] min-w-[56px] px-3.5 py-2 rounded-xl text-sm font-bold border-2 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            paidNum === amt
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Real-Time Change Calculation & Zero-Change Callout */}
                  {isExactFare ? (
                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 flex items-center gap-3">
                      <AlertCircle className="text-amber-600 shrink-0" size={22} />
                      <div>
                        <span className="text-sm font-bold text-amber-900 dark:text-amber-200 block">
                          Exact fare received — no change ticket required.
                        </span>
                        <span className="text-xs text-amber-700 dark:text-amber-400">
                          Cash paid matches ticket fare exactly. No balance refund ticket needed.
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-5 rounded-2xl border-2 flex items-center justify-between gap-4 transition ${
                        isCashInsufficient
                          ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900'
                          : fareNum > 0 && paidNum >= fareNum
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                          Change to Give Passenger
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-300">
                          {isCashInsufficient
                            ? 'Waiting for sufficient cash'
                            : changeDue === 0
                            ? 'Exact fare received — no change'
                            : 'Single-use QR change pass'}
                        </span>
                      </div>

                      <AmountDisplay
                        amount={changeDue}
                        size="lg"
                        color={changeDue > 0 ? 'success' : 'muted'}
                      />
                    </div>
                  )}

                  {/* Primary Action Button (Disabled if exact fare or insufficient) */}
                  <AccessibleButton
                    type="submit"
                    variant="primary"
                    size="xl"
                    fullWidth
                    isLoading={loading}
                    loadingText="Generating secure change pass..."
                    disabled={isCashInsufficient || isExactFare || fareNum <= 0 || paidNum <= 0 || !user?.busNumber}
                    leftIcon={<QrCode size={22} />}
                  >
                    {isExactFare
                      ? 'Exact Fare Received (No Ticket)'
                      : `Generate Change QR (₹${changeDue.toFixed(2)})`}
                  </AccessibleButton>
                </form>
              </motion.div>
            ) : (
              /* ============================================================== */
              /* STEP 2: DIGITAL RECEIPT & ACTIVE QR DISPLAY                    */
              /* ============================================================== */
              <motion.div
                key="qr-display"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl text-center space-y-6"
              >
                {/* Heading */}
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 text-xs font-bold">
                    <Check size={14} aria-hidden="true" />
                    Digital Ticket Receipt Active
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    Ask passenger to scan this QR
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Passenger scans with their smartphone camera to claim change via UPI.
                  </p>
                </div>

                {/* Large, High-Contrast QR Code */}
                <div className="p-6 sm:p-8 bg-white rounded-3xl border-4 border-slate-900 shadow-xl inline-block mx-auto">
                  <QRCodeSVG
                    value={createdTicket.qr.payload}
                    size={240}
                    level="H"
                    includeMargin={true}
                    className="mx-auto"
                  />
                </div>

                {/* Digital Ticket Receipt Card (Physical Perforated Bus Ticket Style) */}
                <div className="printable-ticket max-w-md mx-auto p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 shadow-md text-sm space-y-3 text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <Bus size={18} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Public Bus Change Slip
                      </span>
                    </div>
                    <span className="font-mono font-black text-sm px-2.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                      {createdTicket.ticket.busNumber || user?.busNumber || 'TN-58-N-1234'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Route:</span>
                    <span className="font-semibold">
                      {createdTicket.ticket.source} ➔ {createdTicket.ticket.destination}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Conductor Staff ID:</span>
                    <span className="font-mono font-semibold">{user?.staffId || 'STF-MAIN'}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Date & Time:</span>
                    <span className="font-mono">{new Date(createdTicket.ticket.issuedAt || Date.now()).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Fare Amount:</span>
                    <span>₹{createdTicket.ticket.fareAmount.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                    <span>Amount Paid:</span>
                    <span>₹{createdTicket.ticket.amountPaid.toFixed(2)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-slate-700 dark:text-slate-300">Change Due:</span>
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      ₹{createdTicket.ticket.changeDue.toFixed(2)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 text-center pt-2">
                    Ticket Ref: <span className="font-mono font-bold">{createdTicket.ticket.ticketId}</span>
                  </div>
                </div>

                {/* Academic Simulation Disclaimer */}
                <div className="max-w-md mx-auto p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
                  Demo / Simulated Transaction — No real money is transferred.
                </div>

                {/* Action Buttons: Next Ticket, Print, Download, Copy */}
                <div className="flex flex-wrap gap-2 pt-2 max-w-md mx-auto justify-center">
                  <AccessibleButton
                    variant="primary"
                    size="lg"
                    onClick={handleReset}
                    leftIcon={<Plus size={18} />}
                    className="flex-1 min-w-[140px]"
                  >
                    Next Ticket
                  </AccessibleButton>

                  <AccessibleButton
                    variant="outline"
                    size="md"
                    onClick={handlePrintReceipt}
                    leftIcon={<Printer size={16} />}
                  >
                    Print
                  </AccessibleButton>

                  <AccessibleButton
                    variant="outline"
                    size="md"
                    onClick={handleDownloadReceipt}
                    leftIcon={<Download size={16} />}
                  >
                    Download
                  </AccessibleButton>

                  <AccessibleButton
                    variant="outline"
                    size="md"
                    onClick={handleCopyPayload}
                    leftIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </AccessibleButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* ============================================================== */
          /* VIEW 2: SHIFT TICKET HISTORY                                   */
          /* ============================================================== */
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Conductor Ticket History
                </h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  Recent change tickets issued during your shifts.
                </p>
              </div>
              <AccessibleButton
                variant="outline"
                size="sm"
                onClick={fetchTicketHistory}
                isLoading={historyLoading}
              >
                Refresh
              </AccessibleButton>
            </div>

            {ticketHistory.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <History size={36} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium">No tickets issued yet in this session.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase text-slate-400">
                      <th className="py-3 px-2">Ticket Ref</th>
                      <th className="py-3 px-2">Route</th>
                      <th className="py-3 px-2">Fare</th>
                      <th className="py-3 px-2">Paid</th>
                      <th className="py-3 px-2">Change</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {ticketHistory.map((item) => (
                      <tr key={item._id || item.ticketNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                        <td className="py-3 px-2 font-mono font-bold text-xs text-blue-600 dark:text-blue-400">
                          {item.ticketNumber}
                        </td>
                        <td className="py-3 px-2 text-xs">
                          {item.source} ➔ {item.destination}
                        </td>
                        <td className="py-3 px-2 font-mono">₹{item.fareAmount}</td>
                        <td className="py-3 px-2 font-mono">₹{item.amountPaid}</td>
                        <td className="py-3 px-2 font-mono font-bold text-emerald-600">
                          ₹{item.changeDue}
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="py-3 px-2 text-xs text-slate-400 font-mono">
                          {new Date(item.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
