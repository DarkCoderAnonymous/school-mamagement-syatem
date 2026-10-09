'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listRegistrations } from '@/lib/api/registrations';
import type { RegistrationStatus } from '@/lib/api/types';
import { useRegistrationDecisions } from './registration-decisions';

const STATUS_TABS: { value: RegistrationStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'UNDER_REVIEW', label: 'Under review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const STATUS_VARIANT: Record<RegistrationStatus, 'default' | 'secondary' | 'destructive'> = {
  PENDING: 'secondary',
  UNDER_REVIEW: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

export default function RegistrationsListPage() {
  const router = useRouter();
  const [status, setStatus] = useState<RegistrationStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const decisions = useRegistrationDecisions();

  const query = useQuery({
    queryKey: ['admin', 'registrations', { status, search, page }],
    queryFn: () =>
      listRegistrations({ status: status === 'ALL' ? undefined : status, search: search || undefined, page, limit: 20 }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Registrations</h1>
        <p className="text-muted-foreground text-sm">Review and approve school applications</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          value={status}
          onValueChange={(v) => {
            setStatus(v as RegistrationStatus | 'ALL');
            setPage(1);
          }}
        >
          <TabsList>
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          placeholder="Search by school or email…"
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
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="rows-stagger">
                {query.data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground text-center">
                      No applications found.
                    </TableCell>
                  </TableRow>
                )}
                {query.data.items.map((reg) => (
                  <TableRow
                    key={reg._id}
                    className="focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2"
                    tabIndex={0}
                    // The whole row opens it, from the keyboard too — not just the name.
                    onClick={() => router.push(`/admin/registrations/${reg._id}`)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        router.push(`/admin/registrations/${reg._id}`);
                      }
                    }}
                  >
                    <TableCell>
                      <Link href={`/admin/registrations/${reg._id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                        {reg.schoolName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>{reg.contactPerson}</div>
                      <div className="text-muted-foreground text-xs">{reg.email}</div>
                    </TableCell>
                    <TableCell>{new Date(reg.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[reg.status]}>{reg.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {(reg.status === 'PENDING' || reg.status === 'UNDER_REVIEW') && (
                        // Buttons act on the row without opening it.
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            disabled={decisions.isPending(reg._id)}
                            onClick={() => decisions.approve(reg)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            disabled={decisions.isPending(reg._id)}
                            onClick={() => decisions.reject(reg)}
                          >
                            Reject
                          </Button>
                        </div>
                      )}
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

      {decisions.dialogs}
    </div>
  );
}
