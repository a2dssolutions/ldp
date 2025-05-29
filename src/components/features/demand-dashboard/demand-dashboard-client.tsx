
'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bar, Pie, BarChart, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DatePicker } from '@/components/ui/date-picker';
import { syncLocalDemandDataForDateAction } from '@/lib/actions';
import { 
  getLocalDemandDataForDate, 
  saveDemandDataToLocalDB, 
  getSyncStatus, 
  updateSyncStatus,
  clearDemandDataForDateFromLocalDB,
  calculateCityDemandSummary,
  calculateClientDemandSummary,
  calculateAreaDemandSummary,
  calculateMultiClientHotspots
} from '@/lib/services/demand-data-service';
import type { DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity, LocalSyncMeta } from '@/lib/types';
import type { LocalDemandRecord } from '@/lib/dexie';
import { format, parseISO, isToday, isValid, startOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, MapPin, TrendingUp, Zap, RefreshCcw, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useLiveQuery } from 'dexie-react-hooks';


const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const ALL_CLIENTS_SELECT_ITEM_VALUE = "_ALL_CLIENTS_DASHBOARD_";

interface DemandDashboardClientProps {
  initialSelectedDate: Date;
}

export function DemandDashboardClient({ initialSelectedDate }: DemandDashboardClientProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(initialSelectedDate); 
  const selectedDateString = useMemo(() => format(selectedDate, 'yyyy-MM-dd'), [selectedDate]);

  // Live query for demand data for the selected date
  const localDemandData = useLiveQuery(
    () => getLocalDemandDataForDate(selectedDateString),
    [selectedDateString], 
    [] as LocalDemandRecord[] // Default value
  );

  // Live query for sync status
  const syncMeta = useLiveQuery(
    () => getSyncStatus(),
    [],
    { id: 'lastSyncStatus', timestamp: null } as LocalSyncMeta 
  );
  
  const lastSyncedDate = useMemo(() => {
    return syncMeta?.timestamp ? new Date(syncMeta.timestamp) : null;
  }, [syncMeta]);

  const [filters, setFilters] = useState<{ client?: ClientName; city?: string }>({});
  const [isLoading, setIsLoading] = useState(false); 
  const { toast } = useToast();
  
  const [isClientRendered, setIsClientRendered] = useState(false);
  const [dynamicPieRadius, setDynamicPieRadius] = useState(90);

  const handleSyncData = useCallback(async (isForceSync = false) => {
    setIsLoading(true);
    toast({ title: "Syncing Data...", description: `Fetching latest data for ${selectedDateString} from cloud.` });
    try {
      const result = await syncLocalDemandDataForDateAction(selectedDateString);
      if (result.success) {
        await clearDemandDataForDateFromLocalDB(selectedDateString); // Clear local data for the date before saving new
        await saveDemandDataToLocalDB(result.data);
        await updateSyncStatus(new Date()); 
        toast({ title: "Sync Successful", description: `${result.data.length} records updated for ${selectedDateString}.` });
      } else {
        toast({ title: "Sync Failed", description: result.message || "Could not sync data from cloud.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to sync demand data:", error);
      toast({ title: "Sync Error", description: "An unexpected error occurred during sync.", variant: "destructive"});
    } finally {
      setIsLoading(false);
    }
  }, [selectedDateString, toast]);

  useEffect(() => {
    setIsClientRendered(true);
    const calculateRadius = () => {
      if (typeof window !== 'undefined') {
        const newRadius = Math.max(50, Math.min(120, window.innerWidth / 4 - 30)); 
        setDynamicPieRadius(newRadius);
      }
    };
    calculateRadius(); 
    window.addEventListener('resize', calculateRadius);
    
    const needsSync = !lastSyncedDate || format(lastSyncedDate, 'yyyy-MM-dd') !== selectedDateString || (localDemandData && localDemandData.length === 0);
    
    if (needsSync || (isToday(selectedDate) && (!lastSyncedDate || !isToday(lastSyncedDate)))) {
       if(isClientRendered){ // Ensure this runs only client side
        console.log(`Dashboard: Sync needed for ${selectedDateString}. Last synced: ${lastSyncedDate}, Local data count: ${localDemandData?.length}`);
        handleSyncData();
       }
    }

    return () => window.removeEventListener('resize', calculateRadius);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDateString, isClientRendered]); // Removed handleSyncData, localDemandData, lastSyncedDate to prevent potential loops. Sync is triggered by selectedDateString change primarily.


  const filteredDemandData = useMemo(() => {
    if (!localDemandData) return [];
    return localDemandData.filter(item => {
      const clientMatch = filters.client ? item.client === filters.client : true;
      const cityMatch = filters.city ? item.city.toLowerCase().includes(filters.city.toLowerCase()) : true;
      return clientMatch && cityMatch;
    });
  }, [localDemandData, filters]);

  const cityDemand = useMemo(() => calculateCityDemandSummary(filteredDemandData), [filteredDemandData]);
  const clientDemand = useMemo(() => calculateClientDemandSummary(filteredDemandData), [filteredDemandData]);
  const areaDemand = useMemo(() => calculateAreaDemandSummary(filteredDemandData), [filteredDemandData]);
  const multiClientHotspots = useMemo(() => calculateMultiClientHotspots(filteredDemandData), [filteredDemandData]);
  
  const handleFilterChange = (name: string, value: string | Date | ClientName | undefined) => {
    if (name === 'date' && value instanceof Date && isValid(value)) {
      setSelectedDate(value);
    } else if (name === 'client' || name === 'city') {
      setFilters(prev => ({ ...prev, [name]: value as string | ClientName | undefined }));
    }
  };
  
  const getDemandTier = (score: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (score > 20) return { label: 'High', variant: 'default' }; 
    if (score >= 10) return { label: 'Medium', variant: 'secondary' }; 
    return { label: 'Low', variant: 'outline' }; 
  };

  const cityDemandForChart = useMemo(() => cityDemand.slice(0, 10), [cityDemand]);
  const clientDemandForChart = useMemo(() => clientDemand, [clientDemand]);
  const topAreaDemandForChart = useMemo(() => areaDemand.slice(0, 5), [areaDemand]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filter & Sync Demand Data</CardTitle>
          <CardDescription>
            Refine local data or sync with cloud. Last synced: {lastSyncedDate ? format(lastSyncedDate, 'PPP p') : 'Never'} for {lastSyncedDate ? format(lastSyncedDate, 'yyyy-MM-dd') : 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
            <div>
              <Label htmlFor="client-filter">Client</Label>
              <Select
                onValueChange={(selectedValue) => {
                  handleFilterChange('client', selectedValue === ALL_CLIENTS_SELECT_ITEM_VALUE ? undefined : selectedValue as ClientName);
                }}
                value={filters.client || ALL_CLIENTS_SELECT_ITEM_VALUE} 
              >
                <SelectTrigger id="client-filter"><SelectValue placeholder="All Clients" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS_SELECT_ITEM_VALUE}>All Clients</SelectItem>
                  {CLIENT_OPTIONS.map(client => (<SelectItem key={client} value={client}>{client}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-filter">Date</Label>
              <DatePicker id="date-filter" date={selectedDate} onDateChange={(date) => handleFilterChange('date', date)} />
            </div>
            <div>
              <Label htmlFor="city-filter">City</Label>
              <Input id="city-filter" placeholder="Enter city name" value={filters.city || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value)} />
            </div>
            <div className="lg:col-span-2">
              <Button onClick={() => handleSyncData(true)} disabled={isLoading} className="w-full">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                Force Sync Now
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {(isLoading && (!localDemandData || localDemandData.length === 0)) ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="text-primary"/> Demand by City</CardTitle><CardDescription>Top 10 cities by total demand.</CardDescription></CardHeader>
              <CardContent className="h-[300px] sm:h-[350px]">
                {isClientRendered ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cityDemandForChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="city" stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Legend wrapperStyle={{fontSize: "12px"}}/>
                      <Bar dataKey="totalDemand" name="Total Demand" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <Skeleton className="h-full w-full" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle  className="flex items-center gap-2"><Users className="text-primary"/> Demand by Client</CardTitle><CardDescription>Distribution of demand across clients.</CardDescription></CardHeader>
              <CardContent className="h-[300px] sm:h-[350px]">
                {isClientRendered ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={clientDemandForChart} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`} outerRadius={dynamicPieRadius} dataKey="totalDemand" nameKey="client">
                        {clientDemandForChart.map((entry, index) => (<Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Legend wrapperStyle={{fontSize: "12px"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : <Skeleton className="h-full w-full" />}
              </CardContent>
            </Card>
            
            <Card className="xl:col-span-1"> 
              <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="text-primary"/> Top Performing Areas</CardTitle><CardDescription>Highest demand areas.</CardDescription></CardHeader>
              <CardContent className="h-[300px] sm:h-[350px] overflow-y-auto">
                {isClientRendered && topAreaDemandForChart.length > 0 ? (
                  <ul className="space-y-3">
                    {topAreaDemandForChart.map((item, index) => (
                      <li key={index} className="flex justify-between items-center p-2 rounded-md bg-card border">
                        <div><p className="font-semibold text-sm">{item.area}</p><p className="text-xs text-muted-foreground">{item.city} - Clients: {item.clients.join(', ')}</p></div>
                        <Badge variant={getDemandTier(item.totalDemand).variant}>{item.totalDemand}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : isClientRendered ? (
                  <p className="text-center text-sm text-muted-foreground pt-10">No area data available.</p>
                ) : <Skeleton className="w-full h-full"/> }
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card> 
              <CardHeader><CardTitle className="flex items-center gap-2"><Zap className="text-primary"/> Multi-Client Hotspot Cities</CardTitle><CardDescription>Cities with demand from multiple clients.</CardDescription></CardHeader>
              <CardContent className="min-h-[200px] overflow-y-auto">
                {isClientRendered && multiClientHotspots.length > 0 ? (
                  <ul className="space-y-3">
                    {multiClientHotspots.slice(0, 5).map((hotspot) => (
                      <li key={hotspot.city} className="p-3 rounded-md bg-card border">
                        <div className="flex justify-between items-center"><p className="font-semibold text-base">{hotspot.city}</p><Badge variant="default">{hotspot.clientCount} Clients</Badge></div>
                        <p className="text-sm text-muted-foreground">Active: {hotspot.activeClients.join(', ')}</p>
                        <p className="text-xs text-muted-foreground">Total Demand Score: {hotspot.totalDemand}</p>
                      </li>
                    ))}
                  </ul>
                ) : isClientRendered ? (
                  <p className="text-center text-sm text-muted-foreground pt-10">No multi-client hotspots found.</p>
                ) : <Skeleton className="w-full h-[180px]"/> }
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Info className="text-primary" /> Data Source</CardTitle><CardDescription>Details about the displayed data.</CardDescription></CardHeader>
              <CardContent className="min-h-[200px] flex flex-col items-center justify-center space-y-2">
                  <p className="text-sm text-muted-foreground">Displaying data for: <span className="font-semibold text-foreground">{format(selectedDate, 'PPP')}</span></p>
                  <p className="text-sm text-muted-foreground">Last synced with cloud: {lastSyncedDate ? <span className="font-semibold text-foreground">{format(lastSyncedDate, 'PPP p')}</span> : <span className="font-semibold text-foreground">Never</span>}</p>
                  {isToday(selectedDate) && lastSyncedDate && !isToday(lastSyncedDate) && (
                    <Badge variant="destructive">Data for today might be stale. Consider syncing.</Badge>
                  )}
                  {isLoading && <p className="text-sm text-primary">Syncing in progress...</p>}
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader><CardTitle>Detailed Demand Data</CardTitle><CardDescription>Locally cached records for the selected date. Demand Tiers: High &gt; 20, Medium 10-20, Low &lt; 10.</CardDescription></CardHeader>
            <CardContent>
              {isClientRendered && filteredDemandData.length > 0 ? (
                <div className="max-h-[400px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"><TableRow><TableHead>Client</TableHead><TableHead>City</TableHead><TableHead>Area</TableHead><TableHead>Demand Score</TableHead><TableHead>Priority</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredDemandData.map((item: LocalDemandRecord) => { 
                        const tier = getDemandTier(item.demandScore); 
                        // Use localId if available and unique, otherwise fallback to item.id (original id)
                        // For lists, React needs a unique key. localId is guaranteed unique by Dexie.
                        const key = item.localId !== undefined ? item.localId : item.id;
                        return (
                        <TableRow key={key}><TableCell className="text-xs sm:text-sm">{item.client}</TableCell><TableCell className="text-xs sm:text-sm">{item.city}</TableCell><TableCell className="text-xs sm:text-sm">{item.area}</TableCell><TableCell className="text-xs sm:text-sm">{item.demandScore}</TableCell><TableCell><Badge variant={tier.variant}>{tier.label}</Badge></TableCell><TableCell className="text-xs sm:text-sm">{item.date}</TableCell></TableRow>
                      );})}
                    </TableBody>
                  </Table>
                </div>
              ) : isClientRendered ? (
                <p className="text-center text-sm text-muted-foreground py-4">No data available for the selected filters or date in local cache.</p>
              ) : <Skeleton className="h-40 w-full" />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end mb-6">
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
