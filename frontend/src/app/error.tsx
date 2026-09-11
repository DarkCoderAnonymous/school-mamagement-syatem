'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary. Catches render/data errors anywhere below the
 * root layout and offers a retry that re-runs the failed segment, so a
 * transient API failure doesn't cost the user their whole session.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[route error]', error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            This page couldn&apos;t be loaded. It&apos;s usually temporary — try again, and if it keeps happening
            let your administrator know.
          </p>
          {error.digest && (
            <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
          )}
        </div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
