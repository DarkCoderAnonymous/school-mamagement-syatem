'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { flattenNav, type NavGroup } from '@/lib/navigation';
import { usePermission } from '@/lib/permissions';

/**
 * Ctrl/Cmd+K jump-to-page. It searches the same permission-filtered nav the
 * sidebar renders, so it can never offer a page the user can't open.
 *
 * Student/staff record search will hook in here once those endpoints exist —
 * the palette is the intended home for it, but an input that silently returns
 * nothing would be worse than not offering it yet.
 */
export function CommandPalette({ nav }: { nav: NavGroup[] }) {
  const router = useRouter();
  const can = usePermission();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const items = useMemo(
    () => flattenNav(nav).filter((item) => !item.permission || can(item.permission)),
    [nav, can],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
        setActiveIndex(0);
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">Search pages</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter pages, then press Enter to open one.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = results[activeIndex];
                if (target) go(target.href);
              }
            }}
            placeholder="Search pages…"
            className="h-12 border-0 shadow-none focus-visible:ring-0"
            aria-label="Search pages"
          />
        </div>

        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="text-muted-foreground px-3 py-6 text-center text-sm">
              No pages match “{query}”.
            </li>
          )}
          {results.map((item, index) => (
            <li key={item.href}>
              <button
                type="button"
                onClick={() => go(item.href)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
