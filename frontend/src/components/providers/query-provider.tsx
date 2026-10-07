'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/auth-store';

export function QueryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Every sign-out ends in the auth store's clear() — the menu, a forced sign-out
  // from a failed refresh (outside React), after a password change — so drop the
  // cache there, once, rather than at each call site: the next person on this
  // browser must not see the last one's students, fees or marks.
  useEffect(
    () =>
      useAuthStore.subscribe((state, prev) => {
        if (prev.user && !state.user) queryClient.clear();
      }),
    [queryClient],
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
