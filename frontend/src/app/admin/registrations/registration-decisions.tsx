'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { approveRegistration, rejectRegistration } from '@/lib/api/registrations';
import { ApiRequestError } from '@/lib/api/http';
import type { ApproveRegistrationResult, SchoolRegistration } from '@/lib/api/types';

type Target = Pick<SchoolRegistration, '_id' | 'schoolName' | 'email'>;

const errorMessage = (err: unknown) =>
  err instanceof ApiRequestError ? err.message : 'Something went wrong';

/**
 * Approve / reject for the registrations list and the detail page. The state
 * lives with the page, not the row: approving moves a row out of the Pending
 * tab, and the one-time credentials dialog must outlive it.
 */
export function useRegistrationDecisions() {
  const queryClient = useQueryClient();
  const [approveTarget, setApproveTarget] = useState<Target | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Target | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approved, setApproved] = useState<ApproveRegistrationResult | null>(null);

  const invalidate = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'registration', id] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'registrations'] });
  };

  const approveMutation = useMutation({
    mutationFn: (target: Target) => approveRegistration(target._id),
    onSuccess: (result, target) => {
      setApproveTarget(null);
      setApproved(result);
      invalidate(target._id);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ target, reason }: { target: Target; reason: string }) =>
      rejectRegistration(target._id, reason),
    onSuccess: (_, { target }) => {
      toast.success(`${target.schoolName} rejected`);
      setRejectTarget(null);
      setRejectReason('');
      invalidate(target._id);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const dialogs = (
    <>
      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title={`Approve ${approveTarget?.schoolName ?? 'school'}?`}
        description={
          <>
            This creates the school and its admin account, and emails the login details to{' '}
            {approveTarget?.email}. It can&apos;t be undone.
          </>
        }
        confirmLabel="Approve"
        pending={approveMutation.isPending}
        onConfirm={() => {
          if (approveTarget) approveMutation.mutate(approveTarget);
        }}
      />

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (open) return;
          setRejectTarget(null);
          setRejectReason('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejectTarget?.schoolName}</DialogTitle>
            <DialogDescription>
              This emails the applicant with your reason. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              onClick={() => {
                if (rejectTarget) rejectMutation.mutate({ target: rejectTarget, reason: rejectReason });
              }}
            >
              Reject application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApprovedDialog result={approved} onClose={() => setApproved(null)} />
    </>
  );

  return {
    approve: (target: Target) => setApproveTarget(target),
    reject: (target: Target) => setRejectTarget(target),
    /** True while an approve or reject for this registration is in flight. */
    isPending: (id: string) =>
      (approveMutation.isPending && approveMutation.variables?._id === id) ||
      (rejectMutation.isPending && rejectMutation.variables?.target._id === id),
    dialogs,
  };
}

/**
 * The temporary password exists only in this response and the applicant's
 * email — the server stores just its hash — so this is the one chance to see it.
 */
function ApprovedDialog({
  result,
  onClose,
}: {
  result: ApproveRegistrationResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>School approved</DialogTitle>
          <DialogDescription>
            {result?.tempPassword
              ? 'Save these login details now — the password won’t be shown again. They were also emailed to the applicant.'
              : 'This person already had an account, so their password was left unchanged. They sign in with it and pick this school.'}
          </DialogDescription>
        </DialogHeader>
        {result && (
          <dl className="bg-muted space-y-3 rounded-lg p-3 text-sm">
            <CopyableField label="Email" value={result.adminEmail} />
            {result.tempPassword && (
              <CopyableField label="Temporary password" value={result.tempPassword} />
            )}
          </dl>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Couldn’t copy — select the text instead');
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd className="font-mono break-all select-all">{value}</dd>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </Button>
    </div>
  );
}
