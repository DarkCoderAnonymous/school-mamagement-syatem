'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listSchools } from '@/lib/api/schools';
import type { SchoolStatus } from '@/lib/api/types';

const STATUS_VARIANT: Record<SchoolStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  SUSPENDED: 'destructive',
  EXPIRED: 'secondary',
};

export default function SchoolsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['admin', 'schools', { search, page }],
    queryFn: () => listSchools({ search: search || undefined, page, limit: 20 }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Schools</h1>
          <p className="text-muted-foreground text-sm">Every school provisioned on the platform</p>
        </div>
        <Input
          placeholder="Search schools…"
          className="w-64"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {query.isLoading && <Skeleton className="h-64 w-full" />}

      {query.data && (
        <>
          <div className="bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>School</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="rows-stagger">
                {query.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground text-center">
                      No schools yet.
                    </TableCell>
                  </TableRow>
                )}
                {query.data.items.map((school) => (
                  <TableRow
                    key={school._id}
                    className="focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2"
                    tabIndex={0}
                    // The whole row opens it, from the keyboard too — not just the name.
                    onClick={() => router.push(`/admin/schools/${school._id}`)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/admin/schools/${school._id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <Link href={`/admin/schools/${school._id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {school.name}
                      </Link>
                      <div className="text-muted-foreground text-xs">{school.slug}</div>
                    </TableCell>
                    <TableCell>{school.contactEmail}</TableCell>
                    <TableCell>{school.userCount ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[school.status]}>{school.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Page {query.data.meta.page} of {query.data.meta.totalPages} · {query.data.meta.total} total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= query.data.meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
