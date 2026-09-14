import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Bus,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import AppLayout from '@/components/layout/AppLayout';
import { AccessibleButton, FormField, ErrorMessage } from '@/components/ui';

const loginSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters' }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    setError('');
    try {
      const response = await api.post('/auth/login', data);
      const { token, data: userData } = response.data;
      login(userData, token);

      if (userData.role === 'Admin') navigate('/admin');
      else if (userData.role === 'Conductor') navigate('/conductor');
      else navigate('/passenger');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password. Please try again.');
    }
  };

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Public Transit Value Proposition (Desktop) */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden lg:flex lg:col-span-6 flex-col justify-center space-y-6 pr-4"
          >
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-bold uppercase tracking-wider mb-3">
                <Sparkles size={14} aria-hidden="true" />
                Public Bus Change Refund System
              </span>
              <h1 className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Never lose bus change again.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                When conductors do not have small coins, you get a single-use digital change pass to claim your balance directly.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-3.5">
              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 shrink-0">
                  <Zap size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Fast & Simple</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Conductors issue change slips in seconds; passengers scan to receive change directly to UPI.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 shrink-0">
                  <ShieldCheck size={20} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Single-Use Guarantee</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Every ticket is verified securely and can only be refunded once.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Sign In Card */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="lg:col-span-6 w-full max-w-md mx-auto"
          >
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 sm:p-10 border-2 border-slate-200 dark:border-slate-800 space-y-6">
              <div className="text-center space-y-1">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-2 shadow-md shadow-blue-600/20">
                  <Bus size={24} aria-hidden="true" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  Sign In
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                  Access your transit change passes and receipts
                </p>
              </div>

              {error && <ErrorMessage message={error} />}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  id="password"
                  label="Password"
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
                      autoComplete="current-password"
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

                <div className="flex items-center justify-end">
                  <Link
                    to="/forgot-password"
                    className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot Password?
                  </Link>
                </div>

                <AccessibleButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isSubmitting}
                  loadingText="Signing in..."
                  rightIcon={<ArrowRight size={18} />}
                >
                  Sign In
                </AccessibleButton>
              </form>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <span>New to TransitChange? </span>
                <Link
                  to="/register"
                  className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Create an account
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
