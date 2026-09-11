'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getSchool, updateSchoolStatus } from '@/lib/api/schools';
import { ApiRequestError } from '@/lib/api/http';
import type { SchoolStatus } from '@/lib/api/types';

export function SchoolDetailClient({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'school', id], queryFn: () => getSchool(id) });

  const statusMutation = useMutation({
    mutationFn: (status: SchoolStatus) => updateSchoolStatus(id, status),
    onSuccess: () => {
      toast.success('School status updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'school', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'schools'] });
    },
    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong'),
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !query.data) return <p className="text-destructive text-sm">Could not load this school.</p>;

  const school = query.data;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/schools" className="text-muted-foreground flex items-center gap-1 text-sm hover:underline">
        <ArrowLeftIcon className="size-3.5" /> Back to schools
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{school.name}</h1>
          <p className="text-muted-foreground text-sm">{school.slug}</p>
        </div>
        <Badge variant={school.status === 'ACTIVE' ? 'default' : 'destructive'}>{school.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Contact email</p>
            <p>{school.contactEmail}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Contact phone</p>
            <p>{school.contactPhone || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Users</p>
            <p>{school.userCount ?? 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Subscription</p>
            <p>{school.subscription?.status ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Created</p>
            <p>{new Date(school.createdAt).toLocaleDateString()}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {school.status !== 'SUSPENDED' ? (
          <Button variant="destructive" onClick={() => statusMutation.mutate('SUSPENDED')} disabled={statusMutation.isPending}>
            Suspend school
          </Button>
        ) : (
          <Button onClick={() => statusMutation.mutate('ACTIVE')} disabled={statusMutation.isPending}>
            Reactivate school
          </Button>
        )}
      </div>
    </div>
  );
}
