
'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState, useEffect, useMemo } from 'react';
import { Bar, Pie, BarChart, PieChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DatePicker } from '@/components/ui/date-picker';
import { getDemandDataAction, getAreaDemandSummaryAction, getMultiClientHotspotsAction, getCityDemandSummaryAction, getClientDemandSummaryAction } from '@/lib/actions';
import type { DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format } from 'date-fns';
import { AiSuggestionsPlaceholder } from '@/components/features/ai-suggestions-placeholder';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Users, MapPin, TrendingUp, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';


const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];
const ALL_CLIENTS_SELECT_ITEM_VALUE = "_ALL_CLIENTS_DASHBOARD_";


interface DemandDashboardClientProps {
  initialDemandData: DemandData[];
  initialCityDemand: CityDemand[];
  initialClientDemand: ClientDemand[];
  // Add initial props for new data, fetched server-side if possible or fetched on client mount
  initialAreaDemand: AreaDemand[];
  initialMultiClientHotspots: MultiClientHotspotCity[];
}

export function DemandDashboardClient({
  initialDemandData,
  initialCityDemand,
  initialClientDemand,
  initialAreaDemand,
  initialMultiClientHotspots,
}: DemandDashboardClientProps) {
  const [demandData, setDemandData] = useState<DemandData[]>(initialDemandData);
  const [cityDemand, setCityDemand] = useState<CityDemand[]>(initialCityDemand);
  const [clientDemand, setClientDemand] = useState<ClientDemand[]>(initialClientDemand);
  const [areaDemand, setAreaDemand] = useState<AreaDemand[]>(initialAreaDemand);
  const [multiClientHotspots, setMultiClientHotspots] = useState<MultiClientHotspotCity[]>(initialMultiClientHotspots);
  
  const [filters, setFilters] = useState<{ client?: ClientName; date?: Date; city?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingExtras, setIsLoadingExtras] = useState(false); // For new cards
  const { toast } = useToast();

  const [isClient, setIsClient] = useState(false);
  const [dynamicPieRadius, setDynamicPieRadius] = useState(90); 

  useEffect(() => {
    setIsClient(true);
    const calculateRadius = () => {
      if (typeof window !== 'undefined') {
        const newRadius = Math.max(50, Math.min(120, window.innerWidth / 4 - 30)); 
        setDynamicPieRadius(newRadius);
      }
    };
    calculateRadius(); 
    window.addEventListener('resize', calculateRadius); 
    
    // Fetch initial extra data if not provided or if a refresh is desired on mount
    const fetchExtraData = async () => {
      setIsLoadingExtras(true);
      try {
        const currentFormattedDate = filters.date ? format(filters.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        const [areaData, hotspotData] = await Promise.all([
          getAreaDemandSummaryAction({...filters, date: currentFormattedDate }),
          getMultiClientHotspotsAction({ date: currentFormattedDate }),
        ]);
        setAreaDemand(areaData);
        setMultiClientHotspots(hotspotData);
      } catch (error) {
        console.error("Failed to fetch extra dashboard data:", error);
        toast({ title: "Error Loading Insights", description: "Could not fetch top areas or hotspots.", variant: "destructive"});
      } finally {
        setIsLoadingExtras(false);
      }
    };

    if (initialAreaDemand.length === 0 && initialMultiClientHotspots.length === 0) {
        fetchExtraData();
    }


    return () => window.removeEventListener('resize', calculateRadius); 
  }, []); 

  const handleFilterChange = (name: string, value: string | Date | ClientName | undefined) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitFilters = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setIsLoadingExtras(true); 
    try {
      const formattedDate = filters.date ? format(filters.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'); // Default to today if no date
      const currentFilters = { ...filters, date: formattedDate };
      
      const [newFilteredData, newCityData, newClientData, newAreaData, newHotspotData] = await Promise.all([
        getDemandDataAction(currentFilters),
        getCityDemandSummaryAction(currentFilters),
        getClientDemandSummaryAction(currentFilters),
        getAreaDemandSummaryAction(currentFilters),
        getMultiClientHotspotsAction({ date: currentFilters.date })
      ]);

      setDemandData(newFilteredData);
      setCityDemand(newCityData);
      setClientDemand(newClientData);
      setAreaDemand(newAreaData);
      setMultiClientHotspots(newHotspotData);

      toast({ title: "Filters Applied", description: "Dashboard data updated."});
    } catch (error) {
      console.error("Failed to fetch demand data:", error);
      toast({ title: "Error", description: "Could not update demand data.", variant: "destructive"});
    } finally {
      setIsLoading(false);
      setIsLoadingExtras(false);
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
          <CardTitle>Filter Demand Data</CardTitle>
          <CardDescription>Refine the data displayed in charts and tables below. Defaults to today's data.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitFilters} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div>
              <Label htmlFor="client-filter">Client</Label>
              <Select
                onValueChange={(selectedValue) => {
                  if (selectedValue === ALL_CLIENTS_SELECT_ITEM_VALUE) {
                    handleFilterChange('client', undefined);
                  } else {
                    handleFilterChange('client', selectedValue as ClientName);
                  }
                }}
                value={filters.client || ALL_CLIENTS_SELECT_ITEM_VALUE} 
              >
                <SelectTrigger id="client-filter">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS_SELECT_ITEM_VALUE}>All Clients</SelectItem>
                  {CLIENT_OPTIONS.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-filter">Date</Label>
              <DatePicker 
                id="date-filter" 
                date={filters.date || new Date()} // Default to today in picker
                onDateChange={(date) => handleFilterChange('date', date)} 
              />
            </div>
            <div>
              <Label htmlFor="city-filter">City</Label>
              <Input
                id="city-filter"
                placeholder="Enter city name"
                value={filters.city || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading || isLoadingExtras} className="w-full lg:w-auto">
              {(isLoading || isLoadingExtras) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="text-primary"/> Demand by City</CardTitle>
            <CardDescription>Top 10 cities by total demand score based on filters.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[350px]">
            {isClient && !isLoading ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cityDemandForChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="city" stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  <Bar dataKey="totalDemand" name="Total Demand" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle  className="flex items-center gap-2"><Users className="text-primary"/> Demand by Client</CardTitle>
            <CardDescription>Distribution of demand across clients based on filters.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[350px]">
            {isClient && !isLoading ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientDemandForChart}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={dynamicPieRadius}
                    dataKey="totalDemand"
                    nameKey="client"
                  >
                    {clientDemandForChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </CardContent>
        </Card>
        
        <Card className="xl:col-span-1"> 
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="text-primary"/> Top Performing Areas</CardTitle>
            <CardDescription>Highest demand areas based on current filters.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[350px] overflow-y-auto">
            {isLoadingExtras ? <Skeleton className="w-full h-full"/> : topAreaDemandForChart.length > 0 ? (
              <ul className="space-y-3">
                {topAreaDemandForChart.map((item, index) => (
                  <li key={index} className="flex justify-between items-center p-2 rounded-md bg-card border">
                    <div>
                      <p className="font-semibold">{item.area}</p>
                      <p className="text-xs text-muted-foreground">{item.city} - Clients: {item.clients.join(', ')}</p>
                    </div>
                    <Badge variant={getDemandTier(item.totalDemand).variant}>{item.totalDemand}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-muted-foreground pt-10">No area data available for current filters.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card> 
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Zap className="text-primary"/> Multi-Client Hotspot Cities</CardTitle>
                <CardDescription>Cities with significant demand from multiple clients.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[200px] overflow-y-auto">
                 {isLoadingExtras ? <Skeleton className="w-full h-[180px]"/> : multiClientHotspots.length > 0 ? (
                <ul className="space-y-3">
                    {multiClientHotspots.slice(0, 5).map((hotspot) => (
                    <li key={hotspot.city} className="p-3 rounded-md bg-card border">
                        <div className="flex justify-between items-center">
                        <p className="font-semibold text-lg">{hotspot.city}</p>
                        <Badge variant="default">{hotspot.clientCount} Clients</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Active: {hotspot.activeClients.join(', ')}</p>
                        <p className="text-xs text-muted-foreground">Total Demand Score: {hotspot.totalDemand}</p>
                    </li>
                    ))}
                </ul>
                ) : (
                <p className="text-center text-muted-foreground pt-10">No multi-client hotspots found for current filters.</p>
                )}
            </CardContent>
        </Card>
        <AiSuggestionsPlaceholder />
      </div>
      

      <Card>
        <CardHeader>
          <CardTitle>Detailed Demand Data</CardTitle>
          <CardDescription>Paginated view of filtered demand records. Demand Tiers: High &gt; 20, Medium 10-20, Low &lt; 10.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : demandData.length > 0 ? (
            <div className="max-h-[400px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Demand Score</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demandData.map(item => { // Removed .slice(0,20) to show all fetched data
                  const tier = getDemandTier(item.demandScore);
                  return (
                  <TableRow key={item.id}>
                    <TableCell>{item.client}</TableCell>
                    <TableCell>{item.city}</TableCell>
                    <TableCell>{item.area}</TableCell>
                    <TableCell>{item.demandScore}</TableCell>
                    <TableCell><Badge variant={tier.variant}>{tier.label}</Badge></TableCell>
                    <TableCell>{item.date}</TableCell>
                  </TableRow>
                );
                })}
              </TableBody>
            </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">No data available for the selected filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


    