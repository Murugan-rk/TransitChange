import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import {
  ShieldAlert,
  Database,
  RefreshCw,
  Check,
  X,
  ShieldCheck,
  Cpu,
  TrendingUp,
  HelpCircle,
  MessageSquare,
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import {
  AccessibleButton,
  AmountDisplay,
  EmptyState,
  LoadingState,
  ConfirmationDialog,
  StatusBadge,
} from '@/components/ui';

interface AnalyticsData {
  totalChangeDispensed: number;
  totalTicketsIssued: number;
  totalClaimsSettled: number;
  settlementRate: number;
  pendingReviewCount: number;
  fraudInterceptionsCount: number;
  averageChangeAmount?: number;
  failedTransactions?: number;
  activeTrips?: number;
  activeBuses?: number;
  activeConductors?: number;
  fraudBreakdown?: {
    lowRisk: number;
    mediumRisk: number;
    highRisk: number;
  };
}

interface FraudQueueItem {
  _id: string;
  transactionId: {
    _id: string;
    status: string;
    expiresAt?: string;
    claimedAt?: string;
    fraudScore?: number;
    flagReason?: string;
    upiId?: string;
    ticketId?: {
      _id: string;
      ticketNumber: string;
      fareAmount: number;
      amountPaid: number;
      changeDue: number;
      conductorId?: {
        _id: string;
        fullName: string;
        email: string;
        staffId: string;
      };
      issuedAt?: string;
    };
  };
  passengerId: {
    _id: string;
    fullName: string;
    email: string;
    mobileNumber: string;
  };
  upiId?: string;
  aiConfidenceScore?: number;
  fraudScore?: number;
  flagReason?: string;
  reasons?: string[];
  adminDecision: 'Pending' | 'Approved' | 'Rejected';
  adminReviewed: boolean;
  createdAt: string;
}

interface ComplaintItem {
  _id: string;
  complaintId: string;
  ticketNumber: string;
  category: string;
  description?: string;
  status: 'PENDING' | 'RESOLVED' | 'REJECTED';
  adminNotes?: string;
  passengerId?: {
    fullName: string;
    email: string;
    mobileNumber: string;
  };
  createdAt: string;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'queue' | 'complaints'>('analytics');

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const [queue, setQueue] = useState<FraudQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [complaintsLoading, setComplaintsLoading] = useState(false);
  const [complaintFilter, setComplaintFilter] = useState<string>('ALL');

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Confirmation dialog state for reject action
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    fraudLogId: string;
    ticketNumber?: string;
  }>({
    isOpen: false,
    fraudLogId: '',
    ticketNumber: '',
  });

  // Complaint resolution modal state
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintItem | null>(null);
  const [complaintAction, setComplaintAction] = useState<'RESOLVED' | 'REJECTED'>('RESOLVED');
  const [adminNotesInput, setAdminNotesInput] = useState('');
  const [complaintSaving, setComplaintSaving] = useState(false);

  // Fetch real-time analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      const res = await api.get('/admin/analytics');
      if (res.data?.success) {
        setAnalytics(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load admin analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  // Fetch fraud queue
  const fetchQueue = useCallback(async () => {
    try {
      setQueueLoading(true);
      const res = await api.get('/admin/fraud-queue');
      if (res.data?.success) {
        setQueue(res.data.queue || []);
      }
    } catch (err) {
      console.error('Failed to load fraud queue:', err);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  // Fetch complaints
  const fetchComplaints = useCallback(async () => {
    try {
      setComplaintsLoading(true);
      const res = await api.get('/complaints/admin');
      if (res.data?.success) {
        setComplaints(res.data.complaints || []);
      }
    } catch (err) {
      console.error('Failed to load complaints:', err);
    } finally {
      setComplaintsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
    fetchQueue();
    fetchComplaints();
  }, [fetchAnalytics, fetchQueue, fetchComplaints]);

  const handleReviewAction = async (
    fraudLogId: string,
    decision: 'Approved' | 'Rejected',
    ticketNumber?: string
  ) => {
    try {
      setActionLoadingId(fraudLogId);
      setActionMessage(null);

      const res = await api.post(`/admin/review/${fraudLogId}`, { decision });

      if (res.data?.success) {
        const actionLabel = decision === 'Approved' ? 'approved & disbursed' : 'rejected & cancelled';
        setActionMessage({
          type: 'success',
          text: `Ticket ${ticketNumber ? `#${ticketNumber}` : ''} successfully ${actionLabel}.`,
        });

        await Promise.all([fetchAnalytics(), fetchQueue()]);
      } else {
        setActionMessage({
          type: 'error',
          text: res.data?.error || 'Action could not be completed.',
        });
      }
    } catch (err: any) {
      console.error('Review action failed:', err);
      setActionMessage({
        type: 'error',
        text: err.response?.data?.error || 'Server error executing decision.',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResolveComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;

    try {
      setComplaintSaving(true);
      const res = await api.patch(`/complaints/admin/${selectedComplaint._id}`, {
        status: complaintAction,
        adminNotes: adminNotesInput.trim(),
      });

      if (res.data?.success) {
        setSelectedComplaint(null);
        setAdminNotesInput('');
        fetchComplaints();
      }
    } catch (err: any) {
      console.error('Failed to update complaint:', err);
    } finally {
      setComplaintSaving(false);
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    if (complaintFilter === 'ALL') return true;
    return c.status === complaintFilter;
  });

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-blue-600 text-white">
                <Database size={20} />
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Admin Operations Console
              </h1>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Live transit analytics, active routes telemetry, and AI security reviews.
            </p>
          </div>

          <AccessibleButton
            variant="outline"
            size="sm"
            onClick={() => {
              fetchAnalytics();
              fetchQueue();
              fetchComplaints();
            }}
            isLoading={analyticsLoading || queueLoading}
            leftIcon={<RefreshCw size={16} />}
          >
            Refresh All
          </AccessibleButton>
        </div>

        {/* Global Action Message Notification */}
        {actionMessage && (
          <div
            className={`p-4 rounded-2xl border text-sm font-semibold flex items-center justify-between ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-red-50 border-red-300 text-red-800'
            }`}
          >
            <span>{actionMessage.text}</span>
            <button
              type="button"
              onClick={() => setActionMessage(null)}
              className="text-xs font-bold underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Top Dashboard Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'analytics'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <TrendingUp size={18} />
            Telemetry & AI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('queue')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'queue'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <ShieldAlert size={18} />
            Security Queue ({queue.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('complaints')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-bold border-b-2 transition ${
              activeTab === 'complaints'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <MessageSquare size={18} />
            Complaints ({complaints.filter((c) => c.status === 'PENDING').length})
          </button>
        </div>

        {/* ============================================================== */}
        {/* TAB 1: TELEMETRY & AI FRAUD ANALYTICS                          */}
        {/* ============================================================== */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* 8 Metric Telemetry Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Total Change Dispensed
                </span>
                <div className="mt-1">
                  <AmountDisplay
                    amount={analytics?.totalChangeDispensed || 0}
                    size="md"
                    color="success"
                  />
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Accumulated balance</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Tickets Issued
                </span>
                <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {analytics?.totalTicketsIssued ?? (analyticsLoading ? '...' : 0)}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Conductor slips generated</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Settlement Rate
                </span>
                <div className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1">
                  {analytics ? `${analytics.settlementRate.toFixed(1)}%` : '...'}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">
                  {analytics?.totalClaimsSettled || 0} claims settled
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Avg Change Amount
                </span>
                <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                  ₹{(analytics?.averageChangeAmount || 0).toFixed(2)}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Per passenger change slip</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Active Trips
                </span>
                <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {analytics?.activeTrips ?? 0}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Live in-transit buses</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Active Buses
                </span>
                <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {analytics?.activeBuses ?? 0}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Vehicles deployed</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Active Conductors
                </span>
                <div className="text-3xl font-black font-mono text-slate-900 dark:text-white mt-1">
                  {analytics?.activeConductors ?? 0}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Operating shifts</span>
              </div>

              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Failed / Voided
                </span>
                <div className="text-3xl font-black font-mono text-red-600 dark:text-red-400 mt-1">
                  {analytics?.failedTransactions ?? 0}
                </div>
                <span className="text-xs text-slate-400 mt-1 block">Blocked fraudulent claims</span>
              </div>
            </div>

            {/* AI Fraud Risk Breakdown Card */}
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="text-blue-600" size={22} />
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  AI Fraud Classification Telemetry
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Continuous Layer 2 Random Forest classification distributions.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                  <span className="text-xs font-bold uppercase text-emerald-800 dark:text-emerald-300">
                    Low Risk (&lt; 0.35)
                  </span>
                  <div className="text-2xl font-black font-mono text-emerald-600 mt-1">
                    {analytics?.fraudBreakdown?.lowRisk ?? 0}
                  </div>
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Auto-settled via simulated UPI
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800">
                  <span className="text-xs font-bold uppercase text-blue-800 dark:text-blue-300">
                    Medium Risk (0.35 – 0.50)
                  </span>
                  <div className="text-2xl font-black font-mono text-blue-600 mt-1">
                    {analytics?.fraudBreakdown?.mediumRisk ?? 0}
                  </div>
                  <span className="text-[11px] text-blue-700 dark:text-blue-400">
                    Standard risk threshold clearance
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800">
                  <span className="text-xs font-bold uppercase text-amber-800 dark:text-amber-300">
                    High Risk (≥ 0.50)
                  </span>
                  <div className="text-2xl font-black font-mono text-amber-600 mt-1">
                    {analytics?.fraudBreakdown?.highRisk ?? 0}
                  </div>
                  <span className="text-[11px] text-amber-700 dark:text-amber-400">
                    Interception routed to manual review
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center text-xs text-slate-500">
                Simulated AI Fraud Detection for academic demonstration purposes only.
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: FRAUD REVIEW QUEUE                                      */}
        {/* ============================================================== */}
        {activeTab === 'queue' && (
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert size={20} className="text-amber-500" />
                  <span>Tickets Awaiting Security Review</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Claims flagged for high denomination, velocity, or ML anomaly score.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500 font-mono">
                {queue.length} pending
              </span>
            </div>

            {queueLoading ? (
              <LoadingState message="Loading review queue..." subtext="Connecting to database" />
            ) : queue.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck size={48} className="text-emerald-500" />}
                title="Review Queue is Clear"
                description="Zero pending fraud reviews. All low-risk passenger claims have settled automatically."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase text-slate-400">
                      <th className="py-3 px-2">Ticket Ref</th>
                      <th className="py-3 px-2">Passenger</th>
                      <th className="py-3 px-2">Change</th>
                      <th className="py-3 px-2">AI Score</th>
                      <th className="py-3 px-2">Flag Reason</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {queue.map((item) => {
                      const ticket = item.transactionId?.ticketId;
                      const score = item.fraudScore ?? item.aiConfidenceScore ?? 0.85;
                      const isHighRisk = score >= 0.5;

                      return (
                        <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 px-2 font-mono font-bold text-xs text-blue-600">
                            {ticket?.ticketNumber || 'TC-REF'}
                          </td>
                          <td className="py-3 px-2 text-xs">
                            <div className="font-semibold text-slate-900 dark:text-white">
                              {item.passengerId?.fullName || 'Passenger'}
                            </div>
                            <div className="text-slate-400 font-mono text-[11px]">
                              {item.upiId || item.transactionId?.upiId || 'N/A'}
                            </div>
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-slate-900 dark:text-white">
                            ₹{ticket?.changeDue?.toFixed(2) || '0.00'}
                          </td>
                          <td className="py-3 px-2">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                                isHighRisk
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                              }`}
                            >
                              {(score * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                            {item.flagReason || item.transactionId?.flagReason || 'High Risk Anomaly'}
                          </td>
                          <td className="py-3 px-2 text-right space-x-2 whitespace-nowrap">
                            <AccessibleButton
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                handleReviewAction(item._id, 'Approved', ticket?.ticketNumber)
                              }
                              isLoading={actionLoadingId === item._id}
                              leftIcon={<Check size={14} />}
                            >
                              Approve
                            </AccessibleButton>
                            <AccessibleButton
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setConfirmDialog({
                                  isOpen: true,
                                  fraudLogId: item._id,
                                  ticketNumber: ticket?.ticketNumber,
                                })
                              }
                              disabled={actionLoadingId === item._id}
                              leftIcon={<X size={14} />}
                            >
                              Reject
                            </AccessibleButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: PASSENGER COMPLAINTS MANAGEMENT                         */}
        {/* ============================================================== */}
        {activeTab === 'complaints' && (
          <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <MessageSquare size={20} className="text-blue-600" />
                  <span>Passenger Problem Reports</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Review and resolve passenger complaints regarding tickets, wrong change, or disputes.
                </p>
              </div>

              {/* Status Filter */}
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                {['ALL', 'PENDING', 'RESOLVED', 'REJECTED'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setComplaintFilter(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      complaintFilter === f
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {complaintsLoading ? (
              <LoadingState message="Loading complaints..." subtext="Connecting to database" />
            ) : filteredComplaints.length === 0 ? (
              <EmptyState
                icon={<HelpCircle size={48} className="text-slate-400" />}
                title="No Complaints Found"
                description="No passenger problem reports found for this filter."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-bold uppercase text-slate-400">
                      <th className="py-3 px-2">ID</th>
                      <th className="py-3 px-2">Ticket #</th>
                      <th className="py-3 px-2">Passenger</th>
                      <th className="py-3 px-2">Category</th>
                      <th className="py-3 px-2">Description</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredComplaints.map((c) => (
                      <tr key={c._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 px-2 font-mono font-bold text-xs text-slate-500">
                          {c.complaintId}
                        </td>
                        <td className="py-3 px-2 font-mono font-bold text-xs text-blue-600">
                          {c.ticketNumber}
                        </td>
                        <td className="py-3 px-2 text-xs">
                          {c.passengerId?.fullName || 'Passenger'}
                        </td>
                        <td className="py-3 px-2 text-xs font-semibold">
                          {c.category.replace(/_/g, ' ')}
                        </td>
                        <td className="py-3 px-2 text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                          {c.description || 'No description provided'}
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="py-3 px-2 text-right">
                          {c.status === 'PENDING' ? (
                            <AccessibleButton
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedComplaint(c);
                                setAdminNotesInput('');
                              }}
                            >
                              Review
                            </AccessibleButton>
                          ) : (
                            <span className="text-xs text-slate-400">Resolved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Modal: Resolve Complaint */}
        {selectedComplaint && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
            <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Review Complaint {selectedComplaint.complaintId}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ticket #{selectedComplaint.ticketNumber} | {selectedComplaint.category.replace(/_/g, ' ')}
                </p>
              </div>

              {selectedComplaint.description && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
                  {selectedComplaint.description}
                </div>
              )}

              <form onSubmit={handleResolveComplaint} className="space-y-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setComplaintAction('RESOLVED')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition ${
                      complaintAction === 'RESOLVED'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600'
                    }`}
                  >
                    Resolve Complaint
                  </button>
                  <button
                    type="button"
                    onClick={() => setComplaintAction('REJECTED')}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition ${
                      complaintAction === 'REJECTED'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600'
                    }`}
                  >
                    Reject Complaint
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Admin Response Notes
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={adminNotesInput}
                    onChange={(e) => setAdminNotesInput(e.target.value)}
                    placeholder="Enter resolution notes for passenger..."
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <AccessibleButton
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedComplaint(null)}
                  >
                    Cancel
                  </AccessibleButton>
                  <AccessibleButton
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={complaintSaving}
                  >
                    Submit Decision
                  </AccessibleButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmation Dialog for Fraud Rejection */}
        <ConfirmationDialog
          isOpen={confirmDialog.isOpen}
          title="Confirm Claim Rejection"
          description={`Are you sure you want to reject ticket #${confirmDialog.ticketNumber}? This will void the claim and mark it as fraudulent.`}
          confirmLabel="Yes, Reject Claim"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={() => {
            handleReviewAction(confirmDialog.fraudLogId, 'Rejected', confirmDialog.ticketNumber);
            setConfirmDialog({ isOpen: false, fraudLogId: '', ticketNumber: '' });
          }}
          onCancel={() =>
            setConfirmDialog({ isOpen: false, fraudLogId: '', ticketNumber: '' })
          }
        />
      </div>
    </AppLayout>
  );
}
