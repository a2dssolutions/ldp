
'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getDemandForecastAction } from '@/lib/actions';
import type { ClientName, ForecastDemandInput, ForecastDemandOutput } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Brain, TrendingUp } from 'lucide-react';

const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
const ALL_CLIENTS_VALUE = "_ALL_CLIENTS_FORECAST_"; // Unique value for "All Clients"

export function DemandForecastingClient() {
  const [filters, setFilters] = useState<ForecastDemandInput>({
    historicalDays: 30, // Default to 30 days
  });
  const [forecast, setForecast] = useState<ForecastDemandOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFilterChange = (name: keyof ForecastDemandInput, value: string | number | undefined) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setForecast(null);
    try {
      // Ensure client is undefined if "All Clients" is selected
      const forecastInput = {
        ...filters,
        client: filters.client === ALL_CLIENTS_VALUE ? undefined : filters.client,
      };

      const result = await getDemandForecastAction(forecastInput);
      setForecast(result);
      if (result.predictedDemandTrend !== "Error") {
        toast({ title: 'Forecast Generated', description: `Forecast for ${result.forecastPeriod} is ready.` });
      } else {
        toast({ title: 'Forecast Error', description: result.narrative, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Failed to get forecast:', error);
      toast({ title: 'Error', description: 'Could not generate forecast.', variant: 'destructive' });
      setForecast({
        forecastPeriod: "N/A",
        predictedDemandTrend: "Error",
        narrative: "An unexpected error occurred while generating the forecast."
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Brain className="text-primary"/> Configure Forecast</CardTitle>
          <CardDescription>Select criteria to generate a demand forecast.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="client-select-forecast">Client (Optional)</Label>
              <Select
                name="client"
                value={filters.client || ALL_CLIENTS_VALUE}
                onValueChange={(value) => handleFilterChange('client', value === ALL_CLIENTS_VALUE ? undefined : value as ClientName)}
              >
                <SelectTrigger id="client-select-forecast">
                  <SelectValue placeholder="All Clients (Broader Forecast)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS_VALUE}>All Clients (Broader Forecast)</SelectItem>
                  {CLIENT_OPTIONS.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city-input-forecast">City (Optional)</Label>
              <Input
                id="city-input-forecast"
                name="city"
                placeholder="e.g., Bangalore (Leave blank for all)"
                value={filters.city || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value || undefined)}
              />
            </div>
             <div>
              <Label htmlFor="area-input-forecast">Area (Optional)</Label>
              <Input
                id="area-input-forecast"
                name="area"
                placeholder="e.g., Koramangala (Requires City)"
                value={filters.area || ''}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('area', e.target.value || undefined)}
                disabled={!filters.city}
              />
            </div>
            <div>
              <Label htmlFor="historical-days-forecast">Historical Days to Consider</Label>
              <Input
                id="historical-days-forecast"
                name="historicalDays"
                type="number"
                min="7"
                max="90"
                value={filters.historicalDays || 30}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('historicalDays', parseInt(e.target.value,10))}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="mr-2 h-4 w-4" />
              )}
              Generate Forecast
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="text-primary"/> Demand Forecast</CardTitle>
          <CardDescription>AI-powered prediction based on your selections.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[300px] space-y-3">
          {isLoading && (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2 text-sm">Generating forecast...</p>
            </div>
          )}
          {forecast && !isLoading && (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">Forecast Period</Label>
                <p className="text-sm font-semibold">{forecast.forecastPeriod}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Predicted Demand Trend</Label>
                <p className="text-sm font-semibold">{forecast.predictedDemandTrend}</p>
              </div>
              {forecast.confidence && (
                 <div>
                    <Label className="text-xs text-muted-foreground">Confidence</Label>
                    <p className="text-sm font-semibold">{forecast.confidence}</p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Narrative</Label>
                <Textarea value={forecast.narrative} readOnly rows={6} className="bg-muted/30 text-sm"/>
              </div>
            </>
          )}
          {!forecast && !isLoading && (
            <p className="text-center text-sm text-muted-foreground pt-10">
              Configure and generate a forecast to see results here.
            </p>
          )}
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
              Forecasting is experimental and based on available historical data and AI analysis.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
