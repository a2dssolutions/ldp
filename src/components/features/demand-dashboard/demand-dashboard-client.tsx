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
import { DatePicker } from '@/components/ui/date-picker'; // Assuming you have a DatePicker component
import { getDemandDataAction } from '@/lib/actions';
import type { DemandData, ClientName, CityDemand, ClientDemand } from '@/lib/types';
import { format } from 'date-fns';
import { AiSuggestionsPlaceholder } from '@/components/features/ai-suggestions-placeholder';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';


const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const CHART_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];


interface DemandDashboardClientProps {
  initialDemandData: DemandData[];
  initialCityDemand: CityDemand[];
  initialClientDemand: ClientDemand[];
}

export function DemandDashboardClient({
  initialDemandData,
  initialCityDemand,
  initialClientDemand,
}: DemandDashboardClientProps) {
  const [demandData, setDemandData] = useState<DemandData[]>(initialDemandData);
  const [cityDemand, setCityDemand] = useState<CityDemand[]>(initialCityDemand);
  const [clientDemand, setClientDemand] = useState<ClientDemand[]>(initialClientDemand);
  
  const [filters, setFilters] = useState<{ client?: ClientName; date?: Date; city?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFilterChange = (name: string, value: string | Date | undefined) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitFilters = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const formattedDate = filters.date ? format(filters.date, 'yyyy-MM-dd') : undefined;
      const data = await getDemandDataAction({ ...filters, date: formattedDate });
      setDemandData(data);
      // Update summaries based on new data (simplified for mock)
      const newCityMap: Record<string, number> = {};
      data.forEach(item => { newCityMap[item.city] = (newCityMap[item.city] || 0) + item.demandScore; });
      setCityDemand(Object.entries(newCityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand));

      const newClientMap: Record<string, number> = {};
      data.forEach(item => { newClientMap[item.client] = (newClientMap[item.client] || 0) + item.demandScore; });
      setClientDemand(Object.entries(newClientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand));

      toast({ title: "Filters Applied", description: "Demand data updated."});
    } catch (error) {
      console.error("Failed to fetch demand data:", error);
      toast({ title: "Error", description: "Could not update demand data.", variant: "destructive"});
    } finally {
      setIsLoading(false);
    }
  };

  const cityDemandForChart = useMemo(() => cityDemand.slice(0, 10), [cityDemand]); // Top 10 cities
  const clientDemandForChart = useMemo(() => clientDemand, [clientDemand]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filter Demand Data</CardTitle>
          <CardDescription>Refine the data displayed in charts and tables below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitFilters} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <div>
              <Label htmlFor="client-filter">Client</Label>
              <Select onValueChange={(value) => handleFilterChange('client', value as ClientName)} value={filters.client}>
                <SelectTrigger id="client-filter">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Clients</SelectItem>
                  {CLIENT_OPTIONS.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date-filter">Date</Label>
              <DatePicker id="date-filter" date={filters.date} onDateChange={(date) => handleFilterChange('date', date)} />
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
            <Button type="submit" disabled={isLoading} className="w-full lg:w-auto">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Demand by City</CardTitle>
            <CardDescription>Top 10 cities by total demand score.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[350px]">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demand by Client</CardTitle>
            <CardDescription>Distribution of demand across clients.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] sm:h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={clientDemandForChart}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={Math.min(120, window.innerWidth / 4 - 30)} // Responsive radius
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
          </CardContent>
        </Card>
      </div>
      
      <AiSuggestionsPlaceholder />

      <Card>
        <CardHeader>
          <CardTitle>Detailed Demand Data</CardTitle>
          <CardDescription>Paginated view of filtered demand records.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
             <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
             </div>
          ) : demandData.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Demand Score</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demandData.slice(0,10).map(item => ( // Simple pagination: show first 10
                  <TableRow key={item.id}>
                    <TableCell>{item.client}</TableCell>
                    <TableCell>{item.city}</TableCell>
                    <TableCell>{item.area}</TableCell>
                    <TableCell>{item.demandScore}</TableCell>
                    <TableCell>{item.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-4">No data available for the selected filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
