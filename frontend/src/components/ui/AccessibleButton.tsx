import React from 'react';
import { Loader2 } from 'lucide-react';

export interface AccessibleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const AccessibleButton = React.forwardRef<
  HTMLButtonElement,
  AccessibleButtonProps
>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    // Base styles ensuring minimum 44px touch target, clear focus ring, and smooth transition
    const baseStyles =
      'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98] select-none';

    const variantStyles = {
      primary:
        'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 focus-visible:ring-blue-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
      success:
        'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 focus-visible:ring-emerald-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
      secondary:
        'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 focus-visible:ring-slate-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
      outline:
        'border-2 border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600 bg-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:ring-slate-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
      danger:
        'bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 focus-visible:ring-red-600 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
      ghost:
        'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 focus-visible:ring-slate-400 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900',
    };

    // Height always >= 44px to satisfy WCAG touch targets
    const sizeStyles = {
      sm: 'min-h-[44px] px-3.5 py-2 text-sm gap-1.5',
      md: 'min-h-[48px] px-5 py-2.5 text-base gap-2',
      lg: 'min-h-[54px] px-6 py-3 text-lg gap-2.5',
      xl: 'min-h-[60px] px-8 py-3.5 text-xl gap-3 rounded-2xl',
    };

    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyles} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="animate-spin shrink-0" size={size === 'xl' ? 24 : size === 'lg' ? 20 : 18} />
            <span>{loadingText || children}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            <span>{children}</span>
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

AccessibleButton.displayName = 'AccessibleButton';
