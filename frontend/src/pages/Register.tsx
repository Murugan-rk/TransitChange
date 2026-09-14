import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  User,
  Mail,
  Phone,
  Lock,
  Bus,
  QrCode,
  Ticket,
  ArrowRight,
  BadgeCheck,
} from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import AppLayout from '@/components/layout/AppLayout';
import { AccessibleButton, FormField, ErrorMessage } from '@/components/ui';

const registerSchema = z
  .object({
    fullName: z.string().min(2, { message: 'Full name must be at least 2 characters' }),
    email: z.string().email({ message: 'Please enter a valid email address' }),
    mobileNumber: z.string().min(10, { message: 'Mobile number must be at least 10 digits' }),
    password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
    role: z.enum(['Passenger', 'Conductor']),
    staffId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'Conductor' && (!data.staffId || data.staffId.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Staff ID is required for Conductor accounts (min 3 chars)',
        path: ['staffId'],
      });
    }
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: 'Passenger',
    },
  });

  const selectedRole = watch('role');

  const onSubmit = async (data: RegisterFormValues) => {
    setError('');
    try {
      const response = await api.post('/auth/register', data);
      const { token, data: userData } = response.data;
      login(userData, token);

      if (userData.role === 'Conductor') navigate('/conductor');
      else navigate('/passenger');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account. Please check your details.');
    }
  };

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Public Transit Info (Desktop) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden lg:flex lg:col-span-5 flex-col justify-center space-y-6 pr-4"
          >
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold uppercase tracking-wider mb-3">
                <BadgeCheck size={14} aria-hidden="true" />
                Quick Free Registration
              </span>
              <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Get started with TransitChange
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                Create an account to save your bus change tickets, view past receipts, and receive balance refunds instantly.
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                  <QrCode size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Passenger Accounts</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Scan conductor QR slips with your phone camera and get simulated UPI refunds.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-start gap-3">
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                  <Ticket size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Conductor Accounts</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Issue change slips on transit routes in under two seconds.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Registration Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-7 w-full max-w-lg mx-auto"
          >
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 sm:p-10 border-2 border-slate-200 dark:border-slate-800 space-y-6">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 shadow-md shadow-blue-600/20">
                  <Bus size={24} aria-hidden="true" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Create Account
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Select your role and enter your details
                </p>
              </div>

              {error && <ErrorMessage message={error} />}

              {/* Role Toggle Selector */}
              <div className="space-y-1.5">
                <label className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200 block">
                  I am registering as:
                </label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Account role">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedRole === 'Passenger'}
                    onClick={() => setValue('role', 'Passenger')}
                    className={`min-h-[48px] p-3 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selectedRole === 'Passenger'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <QrCode size={18} aria-hidden="true" />
                    <span>Passenger</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={selectedRole === 'Conductor'}
                    onClick={() => setValue('role', 'Conductor')}
                    className={`min-h-[48px] p-3 rounded-2xl border-2 flex items-center justify-center gap-2 font-bold text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      selectedRole === 'Conductor'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    <Ticket size={18} aria-hidden="true" />
                    <span>Conductor</span>
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  id="fullName"
                  label="Full Name"
                  error={errors.fullName?.message}
                  required
                >
                  <div className="relative">
                    <User
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="fullName"
                      type="text"
                      autoComplete="name"
                      {...register('fullName')}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    id="email"
                    label="Email Address"
                    error={errors.email?.message}
                    required
                  >
                    <div className="relative">
                      <Mail
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        {...register('email')}
                        placeholder="name@example.com"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </FormField>

                  <FormField
                    id="mobileNumber"
                    label="Mobile Number"
                    error={errors.mobileNumber?.message}
                    required
                  >
                    <div className="relative">
                      <Phone
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="mobileNumber"
                        type="tel"
                        autoComplete="tel"
                        {...register('mobileNumber')}
                        placeholder="9876543210"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </FormField>
                </div>

                {selectedRole === 'Conductor' && (
                  <FormField
                    id="staffId"
                    label="Staff Conductor ID"
                    helperText="Your official transport corporation staff code (e.g. STF-102)"
                    error={errors.staffId?.message}
                    required
                  >
                    <div className="relative">
                      <Ticket
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="staffId"
                        type="text"
                        {...register('staffId')}
                        placeholder="e.g. STF-8821"
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </FormField>
                )}

                <FormField
                  id="password"
                  label="Password"
                  helperText="Minimum 6 characters"
                  error={errors.password?.message}
                  required
                >
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      {...register('password')}
                      placeholder="••••••••"
                      className="w-full pl-11 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white focus:ring-3 focus:ring-blue-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </FormField>

                <AccessibleButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isSubmitting}
                  loadingText="Creating account..."
                  rightIcon={<ArrowRight size={18} />}
                >
                  Create {selectedRole} Account
                </AccessibleButton>
              </form>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <span>Already have an account? </span>
                <Link
                  to="/login"
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
