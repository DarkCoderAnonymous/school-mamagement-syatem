'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createPlan, listPlans } from '@/lib/api/plans';
import { ApiRequestError } from '@/lib/api/http';
import { formatPlanPrice } from '@/lib/format-price';

const planSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  priceMinor: z.coerce.number().int().min(0),
  currency: z.string().length(3),
  billingCycle: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL']),
  students: z.coerce.number().int().min(1),
  staff: z.coerce.number().int().min(1),
});
type PlanForm = z.infer<typeof planSchema>;

export default function PlansListPage() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => listPlans({ limit: 50 }) });

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PlanForm>({ resolver: zodResolver(planSchema), defaultValues: { currency: 'USD', billingCycle: 'MONTHLY' } });

  const createMutation = useMutation({
    mutationFn: (values: PlanForm) =>
      createPlan({
        name: values.name,
        code: values.code,
        description: values.description,
        priceMinor: values.priceMinor,
        currency: values.currency,
        billingCycle: values.billingCycle,
        limits: { students: values.students, staff: values.staff, storageMb: 1024, smsCredits: 0 },
        enabledModules: [],
        isActive: true,
      }),
    onSuccess: () => {
      toast.success('Plan created');
      setOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
    },
    onError: (err) => toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-muted-foreground text-sm">Subscription plan catalogue</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button>New plan</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="space-y-4" noValidate>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" {...register('name')} />
                  {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="code">Code</Label>
                  <Input id="code" {...register('code')} />
                  {errors.code && <p className="text-destructive text-xs">{errors.code.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Input id="description" {...register('description')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="priceMinor">Price (cents)</Label>
                  <Input id="priceMinor" type="number" min={0} {...register('priceMinor')} />
                  <p className="text-muted-foreground text-xs">Use 0 for a free trial plan</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billingCycle">Billing cycle</Label>
                  <Controller
                    control={control}
                    name="billingCycle"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="billingCycle" className="w-full">
                          <SelectValue placeholder="Select a cycle" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="WEEKLY">Weekly (trial)</SelectItem>
                          <SelectItem value="MONTHLY">Monthly</SelectItem>
                          <SelectItem value="QUARTERLY">Quarterly</SelectItem>
                          <SelectItem value="ANNUAL">Annual</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="students">Max students</Label>
                  <Input id="students" type="number" min={1} {...register('students')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff">Max staff</Label>
                  <Input id="staff" type="number" min={1} {...register('staff')} />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
                  {createMutation.isPending ? 'Creating…' : 'Create plan'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {query.isLoading && <Skeleton className="h-64 w-full" />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data?.items.map((plan) => (
          <Card key={plan._id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                <Badge variant={plan.isActive ? 'default' : 'secondary'}>{plan.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-lg font-semibold">{formatPlanPrice(plan)}</p>
              <p className="text-muted-foreground">{plan.description}</p>
              <p className="text-muted-foreground text-xs">
                Up to {plan.limits.students} students · {plan.limits.staff} staff
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
