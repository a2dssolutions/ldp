'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAiAreaSuggestionsAction } from '@/lib/actions';
import type { ClientName } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ListChecks, Sparkles } from 'lucide-react';

const CLIENT_OPTIONS: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];

export function AreaSuggestionsClient() {
  const [filters, setFilters] = useState<{ client: ClientName; city: string }>({
    client: 'Zepto', // Default client
    city: '',
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFilterChange = (name: string, value: string) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!filters.city) {
      toast({ title: "City Required", description: "Please enter a city to get suggestions.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setSuggestions([]);
    try {
      const result = await getAiAreaSuggestionsAction({
        client: filters.client,
        city: filters.city,
      });
      setSuggestions(result);
      if (result.length > 0) {
        toast({ title: 'Suggestions Loaded', description: `Found ${result.length} top areas.` });
      } else {
        toast({ title: 'No Suggestions', description: 'No specific suggestions found for the criteria.' });
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      toast({ title: 'Error', description: 'Could not fetch suggestions.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Get Area Suggestions</CardTitle>
          <CardDescription>Select a client and enter a city to find the top 5 suggested areas for job postings.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="client-select">Client</Label>
              <Select
                name="client"
                value={filters.client}
                onValueChange={(value) => handleFilterChange('client', value as ClientName)}
              >
                <SelectTrigger id="client-select">
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_OPTIONS.map(client => (
                    <SelectItem key={client} value={client}>{client}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city-input">City</Label>
              <Input
                id="city-input"
                name="city"
                placeholder="e.g., Metropolis"
                value={filters.city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilterChange('city', e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Get Suggestions
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-primary" />
            <CardTitle>Top 5 Suggested Areas</CardTitle>
          </div>
          <CardDescription>Based on your selection and current demand analysis.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px]">
          {isLoading && (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
          {!isLoading && suggestions.length > 0 && (
            <ul className="space-y-2">
              {suggestions.map((area, index) => (
                <li key={index} className="flex items-center gap-2 p-3 bg-accent/20 rounded-md border border-accent/50">
                  <Sparkles className="h-4 w-4 text-accent-foreground" /> 
                  <span className="text-sm font-medium text-foreground">{area}</span>
                </li>
              ))}
            </ul>
          )}
          {!isLoading && suggestions.length === 0 && (
            <p className="text-center text-muted-foreground pt-10">
              Enter criteria and click "Get Suggestions" to see results.
            </p>
          )}
        </CardContent>
        <CardFooter>
            <p className="text-xs text-muted-foreground">
              Suggestions are generated by AI based on available data.
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
