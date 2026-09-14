import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { motion } from 'framer-motion';
import {
  User,
  Mail,
  Phone,
  Shield,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  LayoutDashboard,
  Calendar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { AccessibleButton } from '@/components/ui/AccessibleButton';
import { LoadingState } from '@/components/ui/LoadingState';
import { SecurityDetails } from '@/components/ui/SecurityDetails';

export default function Profile() {
  const { user, logout, token } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/auth/profile');
        setProfileData(response.data.data);
      } catch (err: any) {
        setError('Unable to load your profile details right now. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchProfile();
    }
  }, [token]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCopyUserId = () => {
    if (profileData?._id) {
      navigator.clipboard.writeText(profileData._id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const getDashboardPath = () => {
    if (user?.role === 'Admin') return '/admin';
    if (user?.role === 'Conductor') return '/conductor';
    return '/passenger';
  };

  if (loading) {
    return (
      <AppLayout showNav={true} showFooter={true}>
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center p-4">
          <LoadingState message="Loading your transit account..." />
        </div>
      </AppLayout>
    );
  }

  const roleLabel = profileData?.role || user?.role || 'Passenger';

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Profile Header Identity Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg p-6 sm:p-8 border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="relative shrink-0">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-2xl sm:text-3xl font-bold shadow-md">
                    {profileData?.fullName ? profileData.fullName.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-white"
                    title="Account Verified"
                    aria-label="Verified Account"
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                  </div>
                </div>

                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {profileData?.fullName || user?.fullName || 'Transit User'}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      <Shield size={12} aria-hidden="true" />
                      {roleLabel}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyUserId}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition min-h-[32px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title="Copy User ID"
                      aria-label="Copy User ID to clipboard"
                    >
                      <span>ID: {profileData?._id?.slice(-8).toUpperCase() || '...'}</span>
                      {copiedId ? (
                        <Check size={13} className="text-emerald-500" aria-hidden="true" />
                      ) : (
                        <Copy size={13} aria-hidden="true" />
                      )}
                    </button>
                    {copiedId && (
                      <span role="status" aria-live="polite" className="text-xs text-emerald-600 font-medium">
                        Copied!
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
                <AccessibleButton
                  variant="outline"
                  size="md"
                  onClick={() => navigate(getDashboardPath())}
                  leftIcon={<LayoutDashboard size={16} />}
                >
                  Dashboard
                </AccessibleButton>
                <AccessibleButton
                  variant="danger"
                  size="md"
                  onClick={handleLogout}
                  leftIcon={<LogOut size={16} />}
                >
                  Sign Out
                </AccessibleButton>
              </div>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm"
            >
              {error}
            </div>
          )}

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal Information */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
                <User size={16} aria-hidden="true" />
                <span>Account Information</span>
              </h2>

              <dl className="space-y-5">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    <User size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Full Name
                    </dt>
                    <dd className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {profileData?.fullName || '—'}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    <Mail size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Email Address
                    </dt>
                    <dd className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                      {profileData?.email || '—'}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                    <Phone size={18} aria-hidden="true" />
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Mobile Number
                    </dt>
                    <dd className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                      {profileData?.mobileNumber || '—'}
                    </dd>
                  </div>
                </div>

                {profileData?.staffId && (
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                      <CreditCard size={18} aria-hidden="true" />
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        Staff Badge ID
                      </dt>
                      <dd className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                        {profileData.staffId}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </div>

            {/* Account & Security Status */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>Security & Protection</span>
                </h2>

                <div className="space-y-3.5">
                  <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />
                        Digital Seal Active
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                        Protected
                      </span>
                    </div>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1.5 leading-relaxed">
                      All your transit tickets are cryptographically signed. Nobody can tamper with change amounts.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                        <Shield size={14} className="text-blue-600" aria-hidden="true" />
                        Single-Use Settlement
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                        Guaranteed
                      </span>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mt-1.5 leading-relaxed">
                      Double-claim prevention ensures change can only be received once per ticket.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} aria-hidden="true" />
                  Account Registered:
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {profileData?.createdAt ? new Date(profileData.createdAt).toLocaleDateString() : 'Active'}
                </span>
              </div>
            </div>
          </div>

          {/* Technical Details Accordion */}
          <SecurityDetails
            title="View technical security architecture (HMAC & Database details)"
            modelType="HMAC-SHA256 & MongoDB Replica Set"
          />
        </motion.div>
      </div>
    </AppLayout>
  );
}
