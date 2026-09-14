import React from 'react';
import { Inbox } from 'lucide-react';
import { AccessibleButton } from './AccessibleButton';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Inbox size={36} aria-hidden="true" />,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl bg-slate-50/70 dark:bg-slate-800/40 border-2 border-dashed border-slate-200 dark:border-slate-700/80 space-y-4 max-w-lg mx-auto ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shadow-xs">
        {icon}
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>
      {actionText && onAction && (
        <div className="pt-2">
          <AccessibleButton variant="primary" size="md" onClick={onAction}>
            {actionText}
          </AccessibleButton>
        </div>
      )}
    </div>
  );
};
