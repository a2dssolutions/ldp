
import { getDemandDataAction } from '@/lib/actions';
import type { DemandData, CityDemand, ClientName, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { DemandDashboardClient } from '@/components/features/demand-dashboard/demand-dashboard-client';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

// Helper functions to calculate summaries from existing DemandData[]
// These are moved here to operate on the already fetched initialDemandData

function calculateCityDemandSummary(data: DemandData[]): CityDemand[] {
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

function calculateClientDemandSummary(data: DemandData[]): ClientDemand[] {
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

function calculateAreaDemandSummary(data: DemandData[]): AreaDemand[] {
  const areaMap: Record<string, { city: string; totalDemand: number; clients: Set<ClientName> }> = {};
  data.forEach(item => {
    const key = `${item.city}-${item.area}`;
    if (!areaMap[key]) {
      areaMap[key] = { city: item.city, totalDemand: 0, clients: new Set() };
    }
    areaMap[key].totalDemand += item.demandScore;
    areaMap[key].clients.add(item.client);
  });
  return Object.entries(areaMap)
    .map(([key, value]) => ({
      area: key.split('-').slice(1).join('-'),
      city: value.city,
      totalDemand: value.totalDemand,
      clients: Array.from(value.clients),
    }))
    .sort((a, b) => b.totalDemand - a.totalDemand);
}

function calculateMultiClientHotspots(
  data: DemandData[],
  minClients: number = 2,
  minDemandPerClient: number = 5
): MultiClientHotspotCity[] {
  const cityClientDemand: Record<string, Record<ClientName, number>> = {};
  data.forEach(item => {
    if (!cityClientDemand[item.city]) {
      cityClientDemand[item.city] = {} as Record<ClientName, number>;
    }
    cityClientDemand[item.city][item.client] = (cityClientDemand[item.city][item.client] || 0) + item.demandScore;
  });

  const hotspots: MultiClientHotspotCity[] = [];
  for (const city in cityClientDemand) {
    const clientsInCity = cityClientDemand[city];
    const activeClients: ClientName[] = [];
    let totalDemandInCityForHotspot = 0;
    (Object.keys(clientsInCity) as ClientName[]).forEach(clientName => { 
      if (clientsInCity[clientName] >= minDemandPerClient) {
        activeClients.push(clientName);
        totalDemandInCityForHotspot += clientsInCity[clientName];
      }
    });
    if (activeClients.length >= minClients) {
      hotspots.push({
        city,
        activeClients,
        totalDemand: totalDemandInCityForHotspot,
        clientCount: activeClients.length,
      });
    }
  }
  return hotspots.sort((a, b) => b.clientCount - a.clientCount || b.totalDemand - a.totalDemand);
}


async function DashboardDataWrapper() {
  const serverRenderDate = new Date();
  const todayString = format(serverRenderDate, 'yyyy-MM-dd');

  // Fetch initial demand data ONCE
  // The getDemandDataAction will respect the limits set in demand-data-service for broad queries
  const initialDemandData = await getDemandDataAction({ date: todayString });

  // Calculate summaries from the fetched initialDemandData
  const cityDemandSummary = calculateCityDemandSummary(initialDemandData);
  const clientDemandSummary = calculateClientDemandSummary(initialDemandData);
  const areaDemandSummary = calculateAreaDemandSummary(initialDemandData);
  // For initial load, multiClientHotspots will be based on the potentially limited initialDemandData.
  // Filtered views in DemandDashboardClient will still fetch more comprehensive hotspot data if needed.
  const multiClientHotspots = calculateMultiClientHotspots(initialDemandData);


  return (
    <DemandDashboardClient
      initialDemandData={initialDemandData}
      initialCityDemand={cityDemandSummary}
      initialClientDemand={clientDemandSummary}
      initialAreaDemand={areaDemandSummary}
      initialMultiClientHotspots={multiClientHotspots}
      initialSelectedDate={serverRenderDate}
    />
  );
}

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Demand Dashboard</h1>
        <p className="text-sm text-muted-foreground">
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
    