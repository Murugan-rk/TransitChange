import React from 'react';

interface AmountDisplayProps {
  amount: number;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  color?: 'default' | 'success' | 'primary' | 'muted';
  label?: string;
  className?: string;
}

export const AmountDisplay: React.FC<AmountDisplayProps> = ({
  amount,
  size = 'md',
  color = 'default',
  label,
  className = '',
}) => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const formatted = safeAmount.toFixed(2);
  const [rupees, paise] = formatted.split('.');

  // Human-friendly screen reader speech string
  const speechLabel = `${rupees} rupees${paise !== '00' ? ` and ${paise} paise` : ''}`;

  const sizeStyles = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
    hero: 'text-6xl sm:text-7xl font-black',
  };

  const colorStyles = {
    default: 'text-slate-900 dark:text-white',
    success: 'text-emerald-700 dark:text-emerald-300',
    primary: 'text-blue-700 dark:text-blue-300',
    muted: 'text-slate-600 dark:text-slate-400',
  };

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {label && (
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
          {label}
        </span>
      )}
      <div
        className={`font-black tracking-tight ${sizeStyles[size]} ${colorStyles[color]} flex items-baseline`}
        aria-label={speechLabel}
      >
        <span className="mr-1 text-[0.8em] font-extrabold select-none" aria-hidden="true">
          ₹
        </span>
        <span className="tabular-nums" aria-hidden="true">
          {rupees}
        </span>
        <span className="text-[0.6em] font-bold opacity-75 tabular-nums select-none" aria-hidden="true">
          .{paise}
        </span>
      </div>
    </div>
  );
};
