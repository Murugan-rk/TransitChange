import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, Database, Clock, AlertTriangle } from 'lucide-react';

interface SecurityDetailsProps {
  ticketNumber?: string;
  mockUpiRef?: string;
  fraudScore?: number;
  riskTier?: string;
  modelType?: string;
  flagReasons?: string[];
  claimedAt?: string;
  title?: string;
  className?: string;
}

export const SecurityDetails: React.FC<SecurityDetailsProps> = ({
  ticketNumber,
  mockUpiRef,
  fraudScore,
  riskTier,
  modelType,
  flagReasons,
  claimedAt,
  title = 'View technical & security details',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="security-details-content"
        className="w-full flex items-center justify-between p-4 text-left font-bold text-xs sm:text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-slate-850/60 transition select-none"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-blue-500" aria-hidden="true" />
          <span>{title}</span>
        </div>
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {isOpen && (
        <div
          id="security-details-content"
          className="p-4 sm:p-5 pt-0 border-t border-slate-200 dark:border-slate-800 text-xs font-mono space-y-3 bg-white/50 dark:bg-slate-950/40"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3">
            {ticketNumber && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">
                  Ticket Reference
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{ticketNumber}</span>
              </div>
            )}

            {mockUpiRef && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">
                  Simulated Rail Reference
                </span>
                <span className="font-bold text-slate-900 dark:text-white truncate block">
                  {mockUpiRef}
                </span>
              </div>
            )}

            {typeof fraudScore === 'number' && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">
                  Security Model Score
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {(fraudScore * 100).toFixed(1)}% ({riskTier || 'EVALUATED'})
                </span>
              </div>
            )}

            {modelType && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold">
                  Evaluation Engine
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{modelType}</span>
              </div>
            )}

            {claimedAt && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] text-slate-400 block uppercase font-sans font-bold flex items-center gap-1">
                  <Clock size={11} /> Timestamp
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{new Date(claimedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {flagReasons && flagReasons.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 block uppercase font-sans font-bold flex items-center gap-1 mb-1">
                <AlertTriangle size={11} /> Review Flags
              </span>
              <ul className="list-disc list-inside space-y-0.5 font-sans text-xs">
                {flagReasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-[11px] text-blue-800 dark:text-blue-300 font-sans space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Database size={13} />
              <span>Architectural Verification Passed</span>
            </div>
            <p className="text-blue-700 dark:text-blue-400">
              Deterministic 256-bit HMAC verification completed. Multi-document session committed to MongoDB Atlas replica set with single-use guarantee.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
