
'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DatePicker } from '@/components/ui/date-picker';
import { getHistoricalDemandDataAction } from '@/lib/actions';
import type { DemandData, ClientName } from '@/lib/types';
import { format, subDays } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Loader2, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const ALL_CLIENTS_SELECT_ITEM_VALUE_HISTORY = "_ALL_CLIENTS_HISTORY_";


interface DateRange {
  from?: Date;
  to?: Date;
}

interface DemandHistoryClientProps {
  initialFromDate: Date;
  initialToDate: Date;
}

export function DemandHistoryClient({ initialFromDate, initialToDate }: DemandHistoryClientProps) {
  const [historicalData, setHistoricalData] = useState<DemandData[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ 
    from: initialFromDate, 
    to: initialToDate 
  });
  const [filters, setFilters] = useState<{ client?: ClientName; city?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Optionally, trigger an initial data fetch if desired on component mount
    // handleSubmit(new Event('submit') as unknown as FormEvent); // Example of initial fetch trigger
  }, []);

  const handleDateRangeChange = (field: 'from' | 'to', date: Date | undefined) => {
    setDateRange(prev => ({ ...prev, [field]: date }));
  };

  const handleFilterChange = (name: 'client' | 'city', value: ClientName | string | undefined) => {
    if (name === 'client') {
      setFilters(prev => ({ ...prev, client: value as ClientName | undefined }));
    } else if (name === 'city') {
      setFilters(prev => ({ ...prev, city: value as string | undefined }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dateRange.from || !dateRange.to) {
      toast({ title: "Date Range Required", description: "Please select a start and end date.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const result = await getHistoricalDemandDataAction(
        { start: format(dateRange.from, 'yyyy-MM-dd'), end: format(dateRange.to, 'yyyy-MM-dd') },
        filters 
      );
      setHistoricalData(result);
      toast({ title: "History Loaded", description: `Found ${result.length} records for the selected period.` });
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
      toast({ title: 'Error', description: 'Could not fetch historical data.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  const chartData = useMemo(() => {
    if (!historicalData.length) return [];
    const aggregated: Record<string, { date: string; totalDemand: number }> = {};
    historicalData.forEach(item => {
      const dateKey = item.date; 
      if (!aggregated[dateKey]) {
        aggregated[dateKey] = { date: dateKey, totalDemand: 0 };
      }
      aggregated[dateKey].totalDemand += item.demandScore;
    });
    return Object.values(aggregated).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [historicalData]);


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filter Historical Data</CardTitle>
          <CardDescription>Select date range and apply filters to explore past demand trends.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 items-end">
            <div>
              <Label htmlFor="date-from">From</Label>
              <DatePicker id="date-from" date={dateRange.from} onDateChange={(date) => handleDateRangeChange('from', date)} />
            </div>
            <div>
              <Label htmlFor="date-to">To</Label>
              <DatePicker id="date-to" date={dateRange.to} onDateChange={(date) => handleDateRangeChange('to', date)} />
            </div>
            <div>
              <Label htmlFor="client-filter-hist">Client</Label>
              <Select
                onValueChange={(selectedValue) => {
                  if (selectedValue === ALL_CLIENTS_SELECT_ITEM_VALUE_HISTORY) {
                    handleFilterChange('client', undefined);
                  } else {
                    handleFilterChange('client', selectedValue as ClientName);
                  }
                }}
                value={filters.client || ALL_CLIENTS_SELECT_ITEM_VALUE_HISTORY} 
              >
                <SelectTrigger id="client-filter-hist">
                  <SelectValue placeholder="All Clients" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS_SELECT_ITEM_VALUE_HISTORY}>All Clients</SelectItem>
                  {CLIENT_OPTIONS.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city-filter-hist">City</Label>
              <Input
                id="city-filter-hist"
                placeholder="Enter city name"
                value={filters.city || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full lg:col-span-3 xl:col-span-1">
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Search className="mr-2 h-4 w-4" /> View History
            </Button>
          </form>
        </CardContent>
      </Card>

      {chartData.length > 0 && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Demand Trend</CardTitle>
            <CardDescription>Total demand score over the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isClient ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                  <XAxis dataKey="date" fontSize={12} tickFormatter={(val) => format(new Date(val), 'MMM d')} />
                  <YAxis fontSize={12} />
                  <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)'}}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend wrapperStyle={{fontSize: "12px"}} />
                  <Line type="monotone" dataKey="totalDemand" name="Total Demand" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historical Data Records</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : historicalData.length > 0 ? (
            <div className="max-h-[500px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Demand Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicalData.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs sm:text-sm">{item.date}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{item.client}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{item.city}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{item.area}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{item.demandScore}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-4">No historical data found for the selected criteria. Try adjusting your filters or date range.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
