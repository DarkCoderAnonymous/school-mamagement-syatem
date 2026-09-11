'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { listRegistrations } from '@/lib/api/registrations';
import { listSchools } from '@/lib/api/schools';

function StatCard({ label, value, loading }: { label: string; value: number | undefined; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent>{loading ? <Skeleton className="h-8 w-16" /> : <span className="text-3xl font-semibold">{value ?? 0}</span>}</CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const pendingQuery = useQuery({
    queryKey: ['admin', 'registrations', { status: 'PENDING', limit: 5 }],
    queryFn: () => listRegistrations({ status: 'PENDING', limit: 5 }),
  });
  const schoolsQuery = useQuery({
    queryKey: ['admin', 'schools', { limit: 1 }],
    queryFn: () => listSchools({ limit: 1 }),
  });
  const activeSchoolsQuery = useQuery({
    queryKey: ['admin', 'schools', { status: 'ACTIVE', limit: 1 }],
    queryFn: () => listSchools({ status: 'ACTIVE', limit: 1 }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Platform overview</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total schools" value={schoolsQuery.data?.meta.total} loading={schoolsQuery.isLoading} />
        <StatCard label="Active schools" value={activeSchoolsQuery.data?.meta.total} loading={activeSchoolsQuery.isLoading} />
        <StatCard label="Pending applications" value={pendingQuery.data?.meta.total} loading={pendingQuery.isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingQuery.isLoading && <Skeleton className="h-24 w-full" />}
          {pendingQuery.data?.items.length === 0 && (
            <p className="text-muted-foreground text-sm">No pending applications right now.</p>
          )}
          {pendingQuery.data?.items.map((reg) => (
            <Link
              key={reg._id}
              href={`/admin/registrations/${reg._id}`}
              className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted/50"
            >
              <div>
                <p className="font-medium">{reg.schoolName}</p>
                <p className="text-muted-foreground text-xs">{reg.email}</p>
              </div>
              <Badge variant="secondary">{reg.status}</Badge>
            </Link>
          ))}
          {pendingQuery.data && pendingQuery.data.items.length > 0 && (
            <Link href="/admin/registrations" className="text-sm underline underline-offset-4">
              View all registrations
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
