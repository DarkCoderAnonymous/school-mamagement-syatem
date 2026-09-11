'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listPublicPlans } from '@/lib/api/plans';
import { formatPlanPrice } from '@/lib/format-price';

export default function Home() {
  const plansQuery = useQuery({ queryKey: ['plans', 'public'], queryFn: listPublicPlans });

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col items-center gap-12 p-8 text-center">
      <div className="space-y-4 pt-16">
        <h1 className="text-4xl font-bold">School Management System</h1>
        <p className="text-muted-foreground mx-auto max-w-md text-sm">
          One platform for Super Admins, School Admins, Accountants, Exam Controllers and Teachers to run every
          school independently.
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/register">
            <Button size="lg">Register your school</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </div>

      <div className="w-full space-y-4">
        <h2 className="text-lg font-semibold">Plans</h2>
        {plansQuery.isLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        {plansQuery.isError && <p className="text-destructive text-sm">Could not load plans right now.</p>}
        <div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {plansQuery.data?.map((plan) => (
            <Card key={plan._id}>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">{formatPlanPrice(plan)}</p>
                <p className="text-muted-foreground text-xs">
                  Up to {plan.limits.students} students · {plan.limits.staff} staff
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
