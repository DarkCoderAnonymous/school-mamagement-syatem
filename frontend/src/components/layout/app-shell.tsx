'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronsUpDown,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { logout as apiLogout } from '@/lib/api/auth';
import { usePermission } from '@/lib/permissions';
import { NAV_BY_KEY, isNavItemActive, type NavKey } from '@/lib/navigation';
import { roleLabel } from '@/lib/labels';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SchoolSwitcher } from './school-switcher';
import { ThemeToggle } from './theme-toggle';
import { CommandPalette } from './command-palette';

/**
 * Which nav groups the person has opened or closed, kept in localStorage so it
 * survives reloads. Only explicit choices are stored; a group nobody touched
 * falls back to "open if it holds the current page". Read through
 * useSyncExternalStore so the server render (no storage) and the first client
 * render agree, and every shell on the page stays in step.
 */
const NAV_GROUPS_KEY = 'sms.nav.groups';
const navGroupListeners = new Set<() => void>();

function readNavGroups(): string {
  try {
    return window.localStorage.getItem(NAV_GROUPS_KEY) ?? '{}';
  } catch {
    return '{}';
  }
}

function writeNavGroup(label: string, open: boolean) {
  let current: Record<string, boolean> = {};
  try {
    current = JSON.parse(readNavGroups()) as Record<string, boolean>;
  } catch {
    // A corrupt value is replaced below.
  }
  try {
    window.localStorage.setItem(NAV_GROUPS_KEY, JSON.stringify({ ...current, [label]: open }));
  } catch {
    // Storage blocked (private mode, policy): the toggle still works for this page view via the listeners.
  }
  navGroupListeners.forEach((l) => l());
}

function useNavGroupChoices(): Record<string, boolean> {
  const raw = useSyncExternalStore(
    (onChange) => {
      navGroupListeners.add(onChange);
      window.addEventListener('storage', onChange);
      return () => {
        navGroupListeners.delete(onChange);
        window.removeEventListener('storage', onChange);
      };
    },
    readNavGroups,
    () => '{}',
  );
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * The console shell: fixed sidebar on desktop, drawer below lg, top bar with
 * the command palette and user menu.
 *
 * Nav groups are filtered by permission here rather than inside each item, so
 * a group whose every item is hidden doesn't leave an orphan heading behind.
 * Each group heading folds its links away; a folded group still shows the
 * link to the current page, so you never lose your place.
 * `print:hidden` keeps the whole shell off the paper — see PrintLayout.
 */
export function AppShell({
  brand,
  navKey,
  children,
}: {
  brand: string;
  /** Name of the nav to render, not the nav itself — see NAV_BY_KEY. */
  navKey: NavKey;
  children: ReactNode;
}) {
  const nav = NAV_BY_KEY[navKey];
  const pathname = usePathname();
  const router = useRouter();
  const can = usePermission();
  const user = useAuthStore((s) => s.user);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const groupChoices = useNavGroupChoices();

  const visibleGroups = nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';
  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  // A platform account has no school roles; its console name says what it is.
  const roleLine = user?.roles.length ? user.roles.map(roleLabel).join(', ') : brand;

  // "Fees / Invoices" in the top bar: where you are, without repeating the page title's size.
  const location = (() => {
    for (const group of visibleGroups) {
      const item = group.items.find((i) => isNavItemActive(i, pathname));
      if (item) return { group: group.label, item: item.label };
    }
    return null;
  })();

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      useAuthStore.getState().clear();
      router.replace('/login');
    }
  };

  const accountMenu = (props: { side?: 'top' | 'bottom'; align: 'start' | 'end' }) => {
    // A plain render helper, not a component: it closes over the user and actions.
    return (
      <DropdownMenuContent {...props} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="text-foreground block truncate text-sm font-medium">{fullName}</span>
            <span className="text-muted-foreground block truncate text-xs">{user?.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/change-password')}>
          <KeyRound className="size-4" />
          Change password
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    );
  };

  const sidebarContent = (
    <>
      <div className={cn('flex h-16 shrink-0 items-center border-b px-2', collapsed && 'lg:justify-center')}>
        {/* Renders the switcher for anyone with several memberships, and a
            plain identity otherwise — no dead control for the common case. */}
        {(user?.memberships?.length ?? 0) > 1 ? (
          <SchoolSwitcher collapsed={collapsed} caption={brand} />
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 px-2">
            <SchoolMark
              name={user?.schoolName ?? brand}
              logoUrl={user?.schoolLogoUrl}
              color={user?.schoolPrimaryColor}
            />
            {!collapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-semibold" title={user?.schoolName ?? brand}>
                  {user?.schoolName ?? brand}
                </span>
                {user?.schoolName && (
                  <span className="text-muted-foreground block truncate text-xs">{brand}</span>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Main">
        {visibleGroups.map((group) => {
          const holdsCurrent = group.items.some((item) => isNavItemActive(item, pathname));
          const open = groupChoices[group.label] ?? holdsCurrent;
          // Icon-only sidebar has no headings to fold with, so it always lists everything.
          const items = collapsed || open ? group.items : group.items.filter((item) => isNavItemActive(item, pathname));
          const listId = `nav-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
          return (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => writeNavGroup(group.label, !open)}
                  aria-expanded={open}
                  aria-controls={listId}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-between rounded-md px-2 pb-1 text-[0.6875rem] font-semibold tracking-wide uppercase transition-colors outline-none focus-visible:ring-2"
                >
                  {group.label}
                  <ChevronDown className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')} aria-hidden="true" />
                </button>
              )}
              <div id={listId} className="space-y-1">
                {items.map((item) => {
                  const active = isNavItemActive(item, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDrawerOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'focus-visible:ring-ring relative flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2',
                        // The active item carries an accent bar and a primary icon, so "where am I" reads at a glance.
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground before:bg-primary font-medium before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full [&>svg]:text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        collapsed && 'lg:justify-center',
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Who is signed in, and the account actions — at the foot of the nav, where consoles keep them. */}
      <div className="shrink-0 border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'hover:bg-muted focus-visible:ring-ring flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors outline-none focus-visible:ring-2',
              collapsed && 'lg:justify-center',
            )}
            aria-label="Account menu"
          >
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-sm font-medium">{fullName}</span>
                  <span className="text-muted-foreground block truncate text-xs">{roleLine}</span>
                </span>
                <ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              </>
            )}
          </DropdownMenuTrigger>
          {accountMenu({ side: 'top', align: 'start' })}
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <CommandPalette nav={nav} />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'bg-sidebar sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 lg:flex print:hidden',
          collapsed ? 'w-16' : 'w-64',
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden print:hidden">
          <button
            type="button"
            className="bg-foreground/40 absolute inset-0"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="bg-sidebar absolute inset-y-0 left-0 flex w-64 flex-col border-r shadow-overlay">
            <div className="absolute top-2 right-2">
              <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(false)} aria-label="Close navigation">
                <X className="size-4" />
              </Button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/80 supports-backdrop-filter:backdrop-blur-md sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-saturate-150 print:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
            >
              <Menu className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hidden lg:inline-flex"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
            <span className="bg-border hidden h-4 w-px lg:block" aria-hidden="true" />
            {location ? (
              <p className="flex min-w-0 items-center gap-1.5 text-sm">
                <span className="text-muted-foreground hidden truncate sm:inline">{location.group}</span>
                <span className="text-muted-foreground/60 hidden sm:inline" aria-hidden="true">/</span>
                <span className="truncate font-medium">{location.item}</span>
              </p>
            ) : (
              <span className="text-muted-foreground text-sm">{brand}</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
                )
              }
              className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring hidden items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2 sm:flex"
            >
              <Search className="size-3.5" />
              Search
              <kbd className="bg-muted rounded px-1 py-0.5 font-mono text-[0.625rem]">Ctrl K</kbd>
            </button>

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger
                className="focus-visible:ring-ring flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 lg:hidden"
                aria-label="Account menu"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              {accountMenu({ align: 'end' })}
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * The school's mark: its logo, or its initial on its own brand colour
 * (docs/design-system.md — school branding is for the school's avatar only,
 * never the accent). Falls back to the accent tint when no colour is set.
 */
function SchoolMark({
  name,
  logoUrl,
  color,
}: {
  name: string;
  logoUrl?: string | null;
  color?: string | null;
}) {
  return (
    <Avatar
      className="size-8 shrink-0 rounded-lg after:rounded-lg"
      style={color ? { backgroundColor: color } : undefined}
    >
      {logoUrl && <AvatarImage src={logoUrl} alt="" className="rounded-lg" />}
      <AvatarFallback
        className={cn('rounded-lg text-sm font-semibold', color ? 'bg-transparent text-white' : 'bg-primary text-primary-foreground')}
      >
        {name[0] ?? 'S'}
      </AvatarFallback>
    </Avatar>
  );
}
