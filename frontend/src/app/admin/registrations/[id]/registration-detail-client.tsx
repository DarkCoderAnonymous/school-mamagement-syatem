'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getRegistration, reviewRegistration } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import { DEFAULT_SCHOOL_CURRENCY, SCHOOL_CURRENCIES } from '@sms/shared';
import { useRegistrationDecisions } from '../registration-decisions';

/** "PKR — Pakistani rupee"; the code alone for anything off the list. */
const currencyLabel = (code: string) => {
  const c = SCHOOL_CURRENCIES.find((x) => x.code === code);
  return c ? `${c.code} — ${c.name}` : code;
};

export function RegistrationDetailClient({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const decisions = useRegistrationDecisions();

  const query = useQuery({ queryKey: ['admin', 'registration', id], queryFn: () => getRegistration(id) });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'registration', id] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'registrations'] });
  };

  const reviewMutation = useMutation({
    mutationFn: () => reviewRegistration(id),
    onSuccess: () => {
      toast.success('Marked as under review');
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong'),
  });


  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  if (query.isError || !query.data) return <p className="text-destructive text-sm">Could not load this application.</p>;

  const reg = query.data;
  const canReview = reg.status === 'PENDING';
  const canApprove = reg.status === 'PENDING' || reg.status === 'UNDER_REVIEW';

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/registrations" className="text-muted-foreground flex items-center gap-1 text-sm hover:underline">
        <ArrowLeftIcon className="size-3.5" /> Back to registrations
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{reg.schoolName}</h1>
          <p className="text-muted-foreground text-sm">Submitted {new Date(reg.createdAt).toLocaleString()}</p>
        </div>
        <Badge>{reg.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Contact person</p>
            <p>{reg.contactPerson}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{reg.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{reg.phone}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Location</p>
            <p>{[reg.city, reg.country].filter(Boolean).join(', ') || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Currency</p>
            <p>{currencyLabel(reg.currency ?? DEFAULT_SCHOOL_CURRENCY)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Curriculum</p>
            <p>{reg.curriculum || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Expected students</p>
            <p>{reg.expectedStudents ?? '—'}</p>
          </div>
          {reg.address && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Address</p>
              <p>{reg.address}</p>
            </div>
          )}
          {reg.status === 'REJECTED' && reg.reviewNotes && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Rejection reason</p>
              <p>{reg.reviewNotes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {(canReview || canApprove) && (
        <div className="flex gap-3">
          {canReview && (
            <Button variant="outline" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
              Mark under review
            </Button>
          )}
          {canApprove && (
            <Button onClick={() => decisions.approve(reg)} disabled={decisions.isPending(reg._id)}>
              Approve
            </Button>
          )}
          {canApprove && (
            <Button
              variant="destructive"
              onClick={() => decisions.reject(reg)}
              disabled={decisions.isPending(reg._id)}
            >
              Reject
            </Button>
          )}
        </div>
      )}

      {reg.status === 'APPROVED' && (
        <Card>
          <CardHeader>
            <CardTitle>School admin login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="text-muted-foreground">Email</p>
              <p>{reg.email}</p>
            </div>
            <p className="text-muted-foreground">
              The temporary password was shown once, at approval, and emailed to the admin — it
              isn&apos;t stored, so it can&apos;t be shown again. If it&apos;s been lost, issue a new one.
              Once the admin has set their own password, they use &ldquo;Forgot password&rdquo;
              instead.
            </p>
            <Button
              variant="outline"
              onClick={() => decisions.reissuePassword(reg)}
              disabled={decisions.isPending(reg._id)}
            >
              New temporary password
            </Button>
          </CardContent>
        </Card>
      )}

      {decisions.dialogs}
    </div>
  );
}
