import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, CheckCircle2, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import AppLayout from '@/components/layout/AppLayout';
import { AccessibleButton, FormField } from '@/components/ui';

const forgotSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address' }),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotFormValues) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmittedEmail(data.email);
    setIsSuccess(true);
  };

  return (
    <AppLayout showNav={true} showFooter={true}>
      <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl p-6 sm:p-10 border-2 border-slate-200 dark:border-slate-800 space-y-6">
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg p-1"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Back to sign in</span>
            </Link>

            <div className="text-center space-y-1">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto mb-2 shadow-md shadow-amber-500/20">
                <KeyRound size={22} aria-hidden="true" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Reset Password
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Enter your email address to receive password recovery instructions.
              </p>
            </div>

            {isSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-800 text-center space-y-3"
              >
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={28} aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-emerald-950 dark:text-emerald-200">
                  Instructions Sent
                </h2>
                <p className="text-xs sm:text-sm text-emerald-800 dark:text-emerald-300">
                  We have sent instructions to <strong>{submittedEmail}</strong>. Please check your inbox.
                </p>
                <div className="pt-2">
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition"
                  >
                    Return to Sign In
                  </Link>
                </div>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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

                <AccessibleButton
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  isLoading={isSubmitting}
                  loadingText="Sending..."
                >
                  Send Reset Link
                </AccessibleButton>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
}
