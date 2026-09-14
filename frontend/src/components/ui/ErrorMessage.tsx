import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { AccessibleButton } from './AccessibleButton';

interface ErrorMessageProps {
  code?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export const getHumanFriendlyErrorMessage = (code?: string, defaultMsg?: string): string => {
  const normalized = (code || '').toUpperCase().trim();

  switch (normalized) {
    case 'INVALID_SIGNATURE':
      return 'QR code could not be verified. Please ask the conductor for a new QR code.';
    case 'ALREADY_CLAIMED':
      return 'This change ticket has already been used.';
    case 'ALREADY_REDEEMED':
      return 'This change has already been refunded.';
    case 'EXPIRED':
      return 'This QR code has expired. Please request a new ticket.';
    case 'NO_CHANGE_DUE':
      return 'This ticket does not have any change to refund.';
    case 'CAMERA_ERROR':
      return 'Camera access is blocked. Please allow camera permissions in your browser, or upload a photo instead.';
    case 'FILE_SCAN_FAILED':
      return 'Could not find a QR code in that photo. Please try a clearer picture or enter the code manually.';
    case 'AI_SERVICE_UNAVAILABLE':
      return 'Security check is temporarily taking longer than usual. Please try again.';
    case 'INVALID_PAYLOAD':
      return 'The scanned code is not a valid TransitChange ticket. Please check your ticket and try again.';
    case 'TICKET_NOT_FOUND':
      return 'Ticket not found in the transit registry. Please check with your conductor.';
    case 'ACCESS_DENIED':
    case 'FORBIDDEN_OWNERSHIP':
      return 'You do not have permission to view or claim this ticket.';
    case 'NETWORK_ERROR':
      return "We couldn't connect to the transit network. Please check your connection and try again.";
    default:
      return defaultMsg || 'Something unexpected happened. Please try again.';
  }
};

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  code,
  message,
  onRetry,
  className = '',
}) => {
  const friendlyText = getHumanFriendlyErrorMessage(code, message);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`p-4 sm:p-5 rounded-2xl bg-red-50 dark:bg-red-950/40 border-2 border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 space-y-3 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-400 shrink-0 mt-0.5">
          <AlertCircle size={20} aria-hidden="true" />
        </div>
        <div className="flex-1 text-sm sm:text-base font-semibold leading-relaxed">
          {friendlyText}
        </div>
      </div>

      {onRetry && (
        <div className="pt-1">
          <AccessibleButton
            variant="outline"
            size="sm"
            onClick={onRetry}
            leftIcon={<RefreshCw size={15} />}
            className="border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-100/50"
          >
            Try Again
          </AccessibleButton>
        </div>
      )}
    </div>
  );
};
