import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subtext?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Checking your ticket...',
  subtext,
  size = 'md',
  className = '',
}) => {
  const iconSizes = {
    sm: 24,
    md: 36,
    lg: 48,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center space-y-3 ${className}`}
    >
      <Loader2
        size={iconSizes[size]}
        className="animate-spin text-blue-600 dark:text-blue-400"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
          {message}
        </h3>
        {subtext && (
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            {subtext}
          </p>
        )}
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );
};
