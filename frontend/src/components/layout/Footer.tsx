import { ShieldCheck, Bus } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="w-full border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto transition-colors pb-20 sm:pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          {/* Brand Info */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Bus size={18} aria-hidden="true" />
            </div>
            <div>
              <span className="font-extrabold text-sm text-slate-900 dark:text-white block">
                TransitChange
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Official public bus digital change refund platform
              </span>
            </div>
          </div>

          {/* Guarantee Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <ShieldCheck size={14} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Single-use ticket guarantee</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span>Instant digital balance</span>
            </span>
          </div>
        </div>

        {/* Academic Prototype Disclaimer */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
          <p className="font-medium">
            Demo / Simulated UPI Transaction — No real money is transferred.
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Demonstration Prototype for Smart Public Transit Systems.
          </p>
        </div>
      </div>
    </footer>
  );
}
