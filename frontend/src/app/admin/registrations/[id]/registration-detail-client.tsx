'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  approveRegistration,
  getRegistration,
  rejectRegistration,
  reviewRegistration,
} from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import type { ApproveRegistrationResult } from '@/lib/api/types';

export function RegistrationDetailClient({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveResult, setApproveResult] = useState<ApproveRegistrationResult | null>(null);

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

  const approveMutation = useMutation({
    mutationFn: () => approveRegistration(id),
    onSuccess: (result) => {
      setApproveResult(result);
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectRegistration(id, rejectReason),
    onSuccess: () => {
      toast.success('Application rejected');
      setRejectOpen(false);
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
            <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? 'Approving…' : 'Approve'}
            </Button>
          )}
          {canApprove && (
            <Button variant="destructive" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          )}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
            <DialogDescription>This emails the applicant with your reason. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => rejectMutation.mutate()}
            >
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!approveResult} onOpenChange={(open) => !open && setApproveResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>School approved</DialogTitle>
            <DialogDescription>
              Save these credentials now — they won&apos;t be shown again (they were also emailed to the applicant).
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted space-y-1 rounded-lg p-3 font-mono text-sm">
            <p>Email: {approveResult?.adminEmail}</p>
            <p>Temporary password: {approveResult?.tempPassword}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setApproveResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
