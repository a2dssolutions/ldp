
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { ClientName, CityWithSingleClient, PostingSuggestions } from '@/lib/types';
import { getPostingSuggestionsAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2, ListChecks, Users, User } from 'lucide-react';

interface PostingSuggestionsClientProps {
  initialSelectedDate: Date;
  allAvailableClients: ClientName[];
}

export function PostingSuggestionsClient({
  initialSelectedDate,
  allAvailableClients,
}: PostingSuggestionsClientProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialSelectedDate);
  const [selectedClients, setSelectedClients] = useState<ClientName[]>(allAvailableClients);
  const [suggestions, setSuggestions] = useState<PostingSuggestions | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClientSelection = (client: ClientName, checked: boolean) => {
    setSelectedClients(prev =>
      checked ? [...prev, client] : prev.filter(c => c !== client)
    );
  };

  const handleGetSuggestions = async () => {
    if (!selectedDate) {
      toast({ title: 'Date Required', description: 'Please select a date to get suggestions.', variant: 'destructive' });
      return;
    }
    if (selectedClients.length === 0) {
      toast({ title: 'Clients Required', description: 'Please select at least one client.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    setSuggestions(null);
    try {
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      const result = await getPostingSuggestionsAction(formattedDate, selectedClients);
      setSuggestions(result);
      if (result.commonCities.length === 0 && result.singleClientCities.length === 0) {
        toast({ title: 'No Specific Suggestions Found', description: 'Try different clients or date.' });
      } else {
        toast({ title: 'Suggestions Loaded', description: 'Review the cities below.' });
      }
    } catch (error) {
      console.error('Error fetching posting suggestions:', error);
      toast({ title: 'Error', description: 'Could not fetch suggestions. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Effect to fetch suggestions when date or clients change automatically (optional)
  // For now, using an explicit button click is clearer.
  // useEffect(() => {
  //   if (selectedDate && selectedClients.length > 0) {
  //     handleGetSuggestions();
  //   }
  // }, [selectedDate, selectedClients]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filter Options</CardTitle>
          <CardDescription>Select a date and clients to analyze for posting suggestions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="suggestion-date">Date</Label>
              <DatePicker id="suggestion-date" date={selectedDate} onDateChange={setSelectedDate} />
            </div>
            <div className="md:col-span-2">
              <Label>Select Clients</Label>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2 p-3 border rounded-md bg-background/50 max-h-48 overflow-y-auto">
                {allAvailableClients.map(client => (
                  <div key={client} className="flex items-center space-x-2">
                    <Checkbox
                      id={`client-${client}-suggestion`}
                      checked={selectedClients.includes(client)}
                      onCheckedChange={checked => handleClientSelection(client, !!checked)}
                      disabled={isLoading}
                    />
                    <Label htmlFor={`client-${client}-suggestion`} className="text-sm font-normal">
                      {client}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleGetSuggestions} disabled={isLoading || !selectedDate || selectedClients.length === 0}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ListChecks className="mr-2 h-4 w-4" />}
            Get Suggestions
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-muted-foreground">Loading suggestions...</p>
        </div>
      )}

      {suggestions && !isLoading && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Common Cities (2+ Selected Clients)
              </CardTitle>
              <CardDescription>Cities where multiple selected clients have demand.</CardDescription>
            </CardHeader>
            <CardContent>
              {suggestions.commonCities.length > 0 ? (
                <ul className="space-y-2 text-sm list-disc list-inside">
                  {suggestions.commonCities.map(city => (
                    <li key={city}>{city}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No cities found with demand from 2 or more selected clients for this date.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Cities With Only One Selected Client
              </CardTitle>
              <CardDescription>Cities where only one of the selected clients has demand.</CardDescription>
            </CardHeader>
            <CardContent>
              {suggestions.singleClientCities.length > 0 ? (
                <ul className="space-y-2 text-sm list-disc list-inside">
                  {suggestions.singleClientCities.map(item => (
                    <li key={`${item.city}-${item.client}`}>{item.city} (Client: {item.client})</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No cities found with demand from only one selected client for this date.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
       { !suggestions && !isLoading && (
        <Card className="mt-6">
          <CardContent className="pt-6">
             <p className="text-center text-sm text-muted-foreground">
                Select a date and clients, then click "Get Suggestions" to see results.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
