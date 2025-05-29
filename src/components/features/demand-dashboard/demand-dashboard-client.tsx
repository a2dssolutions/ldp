
'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Bar, Pie, BarChart, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DatePicker } from '@/components/ui/date-picker';
import { 
  getLocalDemandDataForDate, 
  getSyncStatus, 
  performLocalSyncOperations,
  calculateCityDemandSummary,
  calculateClientDemandSummary,
  calculateAreaDemandSummary,
  calculateMultiClientHotspots,
} from '@/lib/services/demand-data-service';
import type { DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity, LocalSyncMeta } from '@/lib/types';
import type { LocalDemandRecord } from '@/lib/dexie';
import { format, parseISO, isToday, isValid, startOfDay } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Users, MapPin, TrendingUp, Zap, Info, Search, Eye, FileText } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLiveQuery } from 'dexie-react-hooks';


const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const ALL_CLIENTS_SELECT_ITEM_VALUE = "_ALL_CLIENTS_DASHBOARD_";

interface DemandDashboardClientProps {
  initialSelectedDate: string; 
}

export function DemandDashboardClient({ initialSelectedDate }: DemandDashboardClientProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(initialSelectedDate)); 
  const [syncStatusMessage, setSyncStatusMessage] = useState<string | null>(null);
  
  const selectedDateString = useMemo(() => {
    if (!selectedDate || !isValid(selectedDate)) {
      console.warn("DemandDashboardClient: selectedDate became invalid for formatting, defaulting to current date string for query.", selectedDate);
      return format(new Date(), 'yyyy-MM-dd'); 
    }
    return format(selectedDate, 'yyyy-MM-dd');
  }, [selectedDate]);

  const localDemandData = useLiveQuery<LocalDemandRecord[], LocalDemandRecord[]>(
    () => getLocalDemandDataForDate(selectedDateString),
    [selectedDateString], 
    [] 
  );

  const syncMeta = useLiveQuery<LocalSyncMeta | undefined, LocalSyncMeta | undefined>(
    () => getSyncStatus(),
    [],
    undefined
  );
  
  const lastSyncedDate = useMemo(() => {
    return syncMeta?.timestamp ? new Date(syncMeta.timestamp) : null;
  }, [syncMeta]);

  const [filters, setFilters] = useState<{ client?: ClientName; city?: string }>({});
  const { toast } = useToast();
  
  const [isClientRendered, setIsClientRendered] = useState(false);
  const [dynamicPieRadius, setDynamicPieRadius] = useState(90);

  useEffect(() => {
    setIsClientRendered(true);
    const calculateRadius = () => {
      if (typeof window !== 'undefined') {
        const newRadius = Math.max(60, Math.min(120, window.innerWidth / 4 - 40)); 
        setDynamicPieRadius(newRadius);
      }
    };
    calculateRadius(); 
    window.addEventListener('resize', calculateRadius);
    
    return () => window.removeEventListener('resize', calculateRadius);
  }, []);

  useEffect(() => {
    if (isClientRendered && isValid(selectedDate)) {
      const dataPresentForSelectedDate = localDemandData && localDemandData.length > 0;
      let showSyncMessage = false;
      let message = "";

      if (isToday(selectedDate)) {
        if (!dataPresentForSelectedDate) {
          showSyncMessage = true;
          message = `No local data for today (${selectedDateString}). Use Admin Panel to sync if needed.`;
        }
        // No longer automatically syncing if data for today is present, even if lastSyncedDate is not today
        // User explicitly syncs today's data via Admin Panel if they suspect it's stale.
      } else { // For past dates
        if (!dataPresentForSelectedDate) {
          showSyncMessage = true;
          message = `No local data found for ${selectedDateString}. Use Admin Panel to sync specific dates if necessary.`;
        }
      }
      
      if (showSyncMessage) {
        setSyncStatusMessage(message);
      } else {
        setSyncStatusMessage(null);
      }
    }
  }, [selectedDate, isClientRendered, localDemandData, lastSyncedDate, selectedDateString, toast]);


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
  const multiClientHotspots = useMemo(() => calculateMultiClientHotspots(filteredDemandData, 2, 1), [filteredDemandData]);
  
  const handleFilterChange = (name: string, value: string | Date | ClientName | undefined) => {
    if (name === 'date') {
      if (value instanceof Date && isValid(value)) {
        setSelectedDate(value);
      } else if (value === undefined) {
        toast({ title: "Date Invalid", description: "Date was cleared or invalid, resetting to today.", variant: "default" });
        setSelectedDate(startOfDay(new Date(initialSelectedDate))); 
      }
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

  const datePickerDate = useMemo(() => {
    return isValid(selectedDate) ? selectedDate : new Date(initialSelectedDate);
  }, [selectedDate, initialSelectedDate]);

  if (!isClientRendered || localDemandData === undefined) { 
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Filter Demand Data</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Apply filters to view locally cached data. Last local sync for any date: {lastSyncedDate && isValid(lastSyncedDate) ? format(lastSyncedDate, 'PPP p') : 'Never'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
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
              <DatePicker id="date-filter" date={datePickerDate} onDateChange={(date) => handleFilterChange('date', date)} />
            </div>
            <div>
              <Label htmlFor="city-filter">City</Label>
              <Input id="city-filter" placeholder="Enter city name" value={filters.city || ''} onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {syncStatusMessage && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Sync Status</AlertTitle>
          <AlertDescription>
            {syncStatusMessage}
          </AlertDescription>
        </Alert>
      )}

      <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><MapPin className="text-primary h-5 w-5"/> Demand by City</CardTitle><CardDescription className="text-sm text-muted-foreground">Top 10 cities by total demand (from local data).</CardDescription></CardHeader>
              <CardContent className="h-[300px] sm:h-[350px]">
                {isClientRendered && cityDemandForChart.length > 0 ? (
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
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-muted-foreground">No city demand data to display for current filters/date.</p>
                    </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle  className="flex items-center gap-2 text-lg"><Users className="text-primary h-5 w-5"/> Demand by Client</CardTitle><CardDescription className="text-sm text-muted-foreground">Distribution of demand across clients (from local data).</CardDescription></CardHeader>
              <CardContent className="h-[300px] sm:h-[350px]">
                {isClientRendered && clientDemandForChart.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie
                        data={clientDemandForChart}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={{
                          fontSize: '10px',
                          fill: 'hsl(var(--foreground))',
                          position: 'inside',
                          formatter: (value, entry) => { // value is totalDemand for this slice, entry is the full data object
                            if (entry.percent < 0.05 && clientDemandForChart.length > 3) return '';
                            return `${entry.name}: ${value} (${(entry.percent * 100).toFixed(0)}%)`;
                          }
                        }}
                        outerRadius={dynamicPieRadius}
                        dataKey="totalDemand"
                        nameKey="client"
                      >
                        {clientDemandForChart.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                      <Legend wrapperStyle={{fontSize: "12px"}}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                     <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-muted-foreground">No client demand data to display for current filters/date.</p>
                    </div>
                )}
              </CardContent>
            </Card>
            
            <Card className="xl:col-span-1"> 
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="text-primary h-5 w-5"/> Top Performing Areas</CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">Highest demand areas (Top 5 from local data).</CardDescription>
                </div>
                {areaDemand.length > 5 && (
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-sm">
                                <Eye className="h-4 w-4" /> View All
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[625px]">
                            <DialogHeader>
                                <DialogTitle>All Top Performing Areas</DialogTitle>
                                <DialogDescription>
                                    Full list of areas sorted by total demand for the selected date and filters.
                                </DialogDescription>
                            </DialogHeader>
                            <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                                <ul className="space-y-3">
                                    {areaDemand.map((item, index) => (
                                    <li key={`${item.city}-${item.area}-${index}`} className="flex justify-between items-center p-2 rounded-md bg-card border">
                                        <div><p className="font-semibold text-sm">{item.area}</p><p className="text-xs text-muted-foreground">{item.city} - Clients: {item.clients.join(', ')}</p></div>
                                        <Badge variant={getDemandTier(item.totalDemand).variant}>{item.totalDemand}</Badge>
                                    </li>
                                    ))}
                                </ul>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                )}
              </CardHeader>
              <CardContent className="h-[280px] sm:h-[330px] overflow-y-auto">
                {topAreaDemandForChart.length > 0 ? (
                  <ul className="space-y-3">
                    {topAreaDemandForChart.map((item, index) => (
                      <li key={`${item.city}-${item.area}-${index}-top`} className="flex justify-between items-center p-2 rounded-md bg-card border">
                        <div><p className="font-semibold text-sm">{item.area}</p><p className="text-xs text-muted-foreground">{item.city} - Clients: {item.clients.join(', ')}</p></div>
                        <Badge variant={getDemandTier(item.totalDemand).variant}>{item.totalDemand}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-sm text-muted-foreground pt-10">No area data available for current filters/date.</p>
                ) }
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card> 
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-lg"><Zap className="text-primary h-5 w-5"/> Multi-Client Hotspot Cities</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground">Cities with demand from multiple clients (Top 5 from local data).</CardDescription>
                    </div>
                     {multiClientHotspots.length > 5 && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-sm">
                                    <Eye className="h-4 w-4" /> View All
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[625px]">
                                <DialogHeader>
                                    <DialogTitle>All Multi-Client Hotspot Cities</DialogTitle>
                                    <DialogDescription>
                                        Full list of cities where multiple selected clients have demand.
                                    </DialogDescription>
                                </DialogHeader>
                                <ScrollArea className="h-[400px] w-full rounded-md border p-4">
                                    <ul className="space-y-3">
                                        {multiClientHotspots.map((hotspot) => (
                                        <li key={`${hotspot.city}-all`} className="p-3 rounded-md bg-card border">
                                            <div className="flex justify-between items-center"><p className="font-semibold text-base">{hotspot.city}</p><Badge variant="default">{hotspot.clientCount} Clients</Badge></div>
                                            <p className="text-sm text-muted-foreground">Active: {hotspot.activeClients.join(', ')}</p>
                                            <p className="text-xs text-muted-foreground">Total Demand Score: {hotspot.totalDemand}</p>
                                        </li>
                                        ))}
                                    </ul>
                                </ScrollArea>
                            </DialogContent>
                        </Dialog>
                    )}
                </CardHeader>
              <CardContent className="min-h-[180px] overflow-y-auto"> 
                {multiClientHotspots.length > 0 ? (
                  <ul className="space-y-3">
                    {multiClientHotspots.slice(0, 5).map((hotspot) => (
                      <li key={`${hotspot.city}-top`} className="p-3 rounded-md bg-card border">
                        <div className="flex justify-between items-center"><p className="font-semibold text-base">{hotspot.city}</p><Badge variant="default">{hotspot.clientCount} Clients</Badge></div>
                        <p className="text-sm text-muted-foreground">Active: {hotspot.activeClients.join(', ')}</p>
                        <p className="text-xs text-muted-foreground">Total Demand Score: {hotspot.totalDemand}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-sm text-muted-foreground pt-10">No multi-client hotspots found for current filters/date.</p>
                ) }
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Info className="text-primary h-5 w-5" /> Data Source</CardTitle><CardDescription className="text-sm text-muted-foreground">Details about the displayed data.</CardDescription></CardHeader>
              <CardContent className="min-h-[180px] flex flex-col items-center justify-center space-y-2">
                  <p className="text-sm text-muted-foreground">Displaying data for: <span className="font-semibold text-foreground">{isValid(selectedDate) ? format(selectedDate, 'PPP') : 'Loading date...'}</span></p>
                  <p className="text-sm text-muted-foreground">Total records in local cache for this date: <span className="font-semibold text-foreground">{localDemandData?.length || 0}</span></p>
                  <p className="text-sm text-muted-foreground">Last cloud sync for any date: {lastSyncedDate  && isValid(lastSyncedDate) ? <span className="font-semibold text-foreground">{format(lastSyncedDate, 'PPP p')}</span> : <span className="font-semibold text-foreground">Never</span>}</p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FileText className="text-primary h-5 w-5"/>Detailed Demand Data</CardTitle><CardDescription className="text-sm text-muted-foreground">Locally cached records for the selected date. Demand Tiers: High &gt; 20, Medium 10-20, Low &lt; 10.</CardDescription></CardHeader>
            <CardContent>
              {filteredDemandData.length > 0 ? (
                <div className="max-h-[400px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"><TableRow><TableHead>Client</TableHead><TableHead>City</TableHead><TableHead>Area</TableHead><TableHead>Demand Score</TableHead><TableHead>Priority</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {filteredDemandData.map((item: LocalDemandRecord) => { 
                        const tier = getDemandTier(item.demandScore); 
                        const key = item.localId !== undefined ? item.localId : item.id;
                        return (
                        <TableRow key={key}><TableCell className="text-xs sm:text-sm">{item.client}</TableCell><TableCell className="text-xs sm:text-sm">{item.city}</TableCell><TableCell className="text-xs sm:text-sm">{item.area}</TableCell><TableCell className="text-xs sm:text-sm">{item.demandScore}</TableCell><TableCell><Badge variant={tier.variant}>{tier.label}</Badge></TableCell><TableCell className="text-xs sm:text-sm">{item.date}</TableCell></TableRow>
                      );})}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                 <p className="text-center text-sm text-muted-foreground py-4">
                  {(!localDemandData || localDemandData.length === 0) ? `No data found in local cache for ${selectedDateString}. Use Admin Panel to sync data.` : 
                   'No data matches the current filters for the selected date.'}
                </p>
              )}
            </CardContent>
          </Card>
        </>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end mb-6">
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

