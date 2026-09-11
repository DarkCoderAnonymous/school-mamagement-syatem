'use client';

import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TRIGGER_CLASS =
  'hover:bg-muted text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-2';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  // The server can't know the user's stored theme, so rendering the resolved
  // icon before hydration would mismatch. useSyncExternalStore gives us
  // "false on the server, true on the client" without a setState-in-effect
  // round trip: the value never changes after hydration, so subscribe is a
  // no-op.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={TRIGGER_CLASS} aria-label="Change theme">
        {!mounted ? (
          <Sun className="size-4" />
        ) : theme === 'dark' ? (
          <Moon className="size-4" />
        ) : theme === 'system' ? (
          <Monitor className="size-4" />
        ) : (
          <Sun className="size-4" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="size-4" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="size-4" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="size-4" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
