
import { DemandDashboardClient } from '@/components/features/demand-dashboard/demand-dashboard-client';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns'; // Added for consistency if needed, though not strictly for this fix
import type { DemandData, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { 
  getDemandDataAction, 
} from '@/lib/actions';
import { 
  calculateCityDemandSummary,
  calculateClientDemandSummary,
  calculateAreaDemandSummary,
  calculateMultiClientHotspots
} from '@/lib/services/demand-data-service';


export default async function DashboardPage() {
  // Create the date string on the server once
  const todayISOString = new Date().toISOString();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Demand Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visualize current demand data from local cache, with ability to sync from cloud.
        </p>
      </header>
      <Suspense fallback={<DashboardSkeleton />}>
        {/* Pass the ISO string as initialSelectedDate */}
        <DemandDashboardClient initialSelectedDate={todayISOString} />
      </Suspense>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end mb-6">
        {/* Filters + Sync Button Area */}
        <Skeleton className="h-10 w-full" />
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
