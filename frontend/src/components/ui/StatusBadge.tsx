import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Ban,
  Check,
} from 'lucide-react';

export type StatusType =
  | 'verified'
  | 'active'
  | 'claimed'
  | 'refund_pending'
  | 'completed'
  | 'redeemed'
  | 'manual_review'
  | 'pending'
  | 'rejected'
  | 'failed'
  | 'expired'
  | 'cancelled';

interface StatusBadgeProps {
  status: StatusType | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const normalized = (status || '').toLowerCase().trim();

  // Map internal status codes to friendly, non-technical labels and semantic icons
  const getStatusConfig = () => {
    switch (normalized) {
      case 'verified':
      case 'active':
        return {
          label: 'Active & Ready',
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          styles:
            'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
        };
      case 'claimed':
        return {
          label: 'QR Scanned',
          icon: <Check size={16} aria-hidden="true" />,
          styles:
            'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800',
        };
      case 'refund_pending':
      case 'pending':
        return {
          label: 'Processing',
          icon: <Clock size={16} aria-hidden="true" className="animate-spin" />,
          styles:
            'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800',
        };
      case 'completed':
      case 'redeemed':
      case 'approved':
        return {
          label: 'Refund Completed',
          icon: <ShieldCheck size={16} aria-hidden="true" />,
          styles:
            'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
        };
      case 'resolved':
        return {
          label: 'Resolved',
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          styles:
            'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800',
        };
      case 'available':
        return {
          label: 'Available',
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          styles:
            'bg-blue-100 dark:bg-blue-950/70 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-800',
        };
      case 'scratched':
        return {
          label: 'Unlocked',
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          styles:
            'bg-purple-100 dark:bg-purple-950/70 text-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-800',
        };
      case 'manual_review':
        return {
          label: 'Under Security Review',
          icon: <AlertTriangle size={16} aria-hidden="true" />,
          styles:
            'bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800',
        };
      case 'rejected':
      case 'failed':
      case 'cancelled':
        return {
          label: 'Not Refunded',
          icon: <XCircle size={16} aria-hidden="true" />,
          styles:
            'bg-rose-100 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 border-rose-300 dark:border-rose-800',
        };
      case 'expired':
        return {
          label: 'Expired',
          icon: <Ban size={16} aria-hidden="true" />,
          styles:
            'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        };
      default:
        return {
          label: status,
          icon: <CheckCircle2 size={16} aria-hidden="true" />,
          styles:
            'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
        };
    }
  };

  const config = getStatusConfig();

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1 gap-1',
    md: 'text-sm px-3.5 py-1.5 gap-1.5',
    lg: 'text-base px-4 py-2 gap-2',
  };

  return (
    <span
      role="status"
      aria-label={`Status: ${config.label}`}
      className={`inline-flex items-center font-bold border rounded-full ${config.styles} ${sizeClasses[size]} ${className}`}
    >
      {showIcon && config.icon}
      <span>{config.label}</span>
    </span>
  );
};
