'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api/http';

/**
 * The error state every list and card shares: say what failed and offer the
 * retry, rather than leaving a blank panel. Specific API error codes get a
 * plain-language line; anything else falls back to the server's message.
 */
const CODE_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  FORBIDDEN: "You don't have permission to view this.",
  NOT_FOUND: "This doesn't exist, or it has been removed.",
  UNAUTHORIZED: 'Your session has expired. Sign in again to continue.',
};

export function ErrorState({
  error,
  onRetry,
  title = "Couldn't load this",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const apiError = error instanceof ApiRequestError ? error : null;
  const message =
    (apiError && (CODE_MESSAGES[apiError.code] ?? apiError.message)) ||
    'Something went wrong while loading this data.';

  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="bg-destructive-soft text-destructive flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      )}
    </div>
  );
}
