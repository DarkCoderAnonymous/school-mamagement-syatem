'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { logout as apiLogout } from '@/lib/api/auth';
import { usePermission } from '@/lib/permissions';
import { isNavItemActive, type NavGroup } from '@/lib/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SchoolSwitcher } from './school-switcher';
import { ThemeToggle } from './theme-toggle';
import { CommandPalette } from './command-palette';

/**
 * The console shell: fixed sidebar on desktop, drawer below lg, top bar with
 * the command palette and user menu.
 *
 * Nav groups are filtered by permission here rather than inside each item, so
 * a group whose every item is hidden doesn't leave an orphan heading behind.
 * `print:hidden` keeps the whole shell off the paper — see PrintLayout.
 */
export function AppShell({
  brand,
  nav,
  children,
}: {
  brand: string;
  nav: NavGroup[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const can = usePermission();
  const user = useAuthStore((s) => s.user);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleGroups = nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((group) => group.items.length > 0);

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  const handleLogout = async () => {
    try {
      await apiLogout();
    } finally {
      useAuthStore.getState().clear();
      router.replace('/login');
    }
  };

  const sidebarContent = (
    <>
      <div className={cn('flex h-14 items-center border-b px-2', collapsed && 'lg:justify-center')}>
        {/* Renders the switcher for anyone with several memberships, and a
            plain identity otherwise — no dead control for the common case. */}
        {(user?.memberships?.length ?? 0) > 1 ? (
          <SchoolSwitcher collapsed={collapsed} />
        ) : (
          <div className="flex items-center gap-2 px-2">
            <Avatar
              className="size-7 shrink-0"
              style={{ backgroundColor: user?.schoolPrimaryColor ?? undefined }}
            >
              {user?.schoolLogoUrl && <AvatarImage src={user.schoolLogoUrl} alt="" />}
              <AvatarFallback className="text-xs">{user?.schoolName?.[0] ?? brand[0]}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="truncate text-sm font-semibold">{user?.schoolName ?? brand}</span>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label="Main">
        {visibleGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {!collapsed && (
              <p className="text-muted-foreground px-2 pb-1 text-[0.6875rem] font-semibold tracking-wide uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'focus-visible:ring-ring flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
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
        ))}
      </nav>

      <div className="hidden border-t p-2 lg:block">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors outline-none focus-visible:ring-2"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      <CommandPalette nav={nav} />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'bg-sidebar hidden shrink-0 flex-col border-r transition-[width] duration-200 lg:flex print:hidden',
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
          <aside className="bg-sidebar absolute inset-y-0 left-0 flex w-64 flex-col border-r shadow-lg">
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
        <header className="bg-background/95 sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4 backdrop-blur print:hidden">
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
            <span className="text-muted-foreground hidden text-sm sm:inline">{brand}</span>
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
                className="focus-visible:ring-ring flex items-center gap-2 rounded-full outline-none focus-visible:ring-2"
                aria-label="Account menu"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  {user?.firstName} {user?.lastName}
                  <div className="text-muted-foreground truncate text-xs font-normal">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push('/change-password')}>
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
