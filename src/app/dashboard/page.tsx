
import { getDemandDataAction, getCityDemandSummaryAction, getClientDemandSummaryAction, getAreaDemandSummaryAction, getMultiClientHotspotsAction } from '@/lib/actions';
import type { DemandData, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { DemandDashboardClient } from '@/components/features/demand-dashboard/demand-dashboard-client';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

async function DashboardDataWrapper() {
  // Fetch all initial data concurrently
  const today = format(new Date(), 'yyyy-MM-dd');
  const [
    initialDemandData,
    cityDemandSummary,
    clientDemandSummary,
    areaDemandSummary,
    multiClientHotspots,
  ] = await Promise.all([
    getDemandDataAction({ date: today }), // Default to today for initial load
    getCityDemandSummaryAction({ date: today }),
    getClientDemandSummaryAction({ date: today }),
    getAreaDemandSummaryAction({ date: today }),
    getMultiClientHotspotsAction({ date: today }),
  ]);

  return (
    <DemandDashboardClient
      initialDemandData={initialDemandData}
      initialCityDemand={cityDemandSummary}
      initialClientDemand={clientDemandSummary}
      initialAreaDemand={areaDemandSummary}
      initialMultiClientHotspots={multiClientHotspots}
    />
  );
}

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Demand Dashboard</h1>
        <p className="text-muted-foreground">
          Visualize current demand data, filter by various criteria, and gain insights.
        </p>
      </header>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardDataWrapper />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-80 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg xl:col-span-1" />
      </div>
       <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-60 w-full rounded-lg" />
        <Skeleton className="h-60 w-full rounded-lg" />
      </div>
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  );
}

