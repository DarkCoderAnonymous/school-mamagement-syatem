'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fullName } from '@/lib/labels';
import { listStudents } from '@/lib/api/school';
import type { Student } from '@/lib/api/types';

/**
 * Find a student by name, admission or roll number. A combobox: arrow keys
 * move through results, Enter picks, Escape closes. Searches the server
 * (debounced) since a school's roster is far too big to ship to the browser.
 */
export function StudentPicker({
  value,
  onChange,
  autoFocus,
  placeholder = 'Search by name or admission number…',
}: {
  value: Pick<Student, '_id' | 'firstName' | 'lastName' | 'admissionNumber'> | null;
  onChange: (student: Student | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 220);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery({
    queryKey: ['students', 'picker', debounced],
    queryFn: () => listStudents({ search: debounced, limit: 8, status: 'ACTIVE' }),
    enabled: debounced.length >= 2,
  });
  const items = results.data?.items ?? [];

  if (value) {
    return (
      <div className="bg-muted/50 flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">{fullName(value)}</span>{' '}
          <span className="text-muted-foreground font-mono text-xs">{value.admissionNumber}</span>
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Choose a different student" onClick={() => onChange(null)}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  const pick = (s: Student) => {
    onChange(s);
    setText('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
      <Input
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        className="h-10 pl-9"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && debounced.length >= 2 && (
        <div className="bg-popover absolute z-30 mt-1 w-full overflow-hidden rounded-lg border shadow-lg">
          {results.isFetching && items.length === 0 && <p className="text-muted-foreground px-3 py-2 text-sm">Searching…</p>}
          {results.isSuccess && items.length === 0 && <p className="text-muted-foreground px-3 py-2 text-sm">No active student matches.</p>}
          <ul id={listId} role="listbox">
            {items.map((s, i) => (
              <li
                key={s._id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${i === active ? 'bg-muted' : ''}`}
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium">{fullName(s)}</span>
                  <span className="text-muted-foreground"> · {s.classId?.name}{s.sectionId ? ` ${s.sectionId.name}` : ''}</span>
                </span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">{s.admissionNumber}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
