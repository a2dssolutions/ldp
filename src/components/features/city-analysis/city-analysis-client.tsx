
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CityClientMatrixRow, ClientName, DemandData } from '@/lib/types';
import { ALL_CLIENT_NAMES } from '@/lib/types';
import { getLocalDemandDataForDate } from '@/lib/services/demand-data-service';
import { useToast } from '@/hooks/use-toast';
import { format, isValid } from 'date-fns';
import { Loader2, Search, CheckCircle2, XCircle } from 'lucide-react';

interface CityAnalysisClientProps {
  initialSelectedDate: string;
}

export function CityAnalysisClient({ initialSelectedDate }: CityAnalysisClientProps) {
  const [selectedDate, setSelectedDate_] = useState<Date>(new Date(initialSelectedDate));
  const [selectedClients, setSelectedClients] = useState<ClientName[]>(ALL_CLIENT_NAMES);
  const [reportData, setReportData] = useState<CityClientMatrixRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDateChange = (date: Date | undefined) => {
    if (date && isValid(date)) {
      setSelectedDate_(date);
    } else {
      setSelectedDate_(new Date(initialSelectedDate));
      toast({ title: "Invalid Date", description: "Please select a valid date.", variant: "destructive" });
    }
  };

  const handleClientSelectionChange = (client: ClientName, checked: boolean) => {
    setSelectedClients(prev =>
      checked ? [...prev, client] : prev.filter(c => c !== client)
    );
  };

  const processDataForReport = (localData: DemandData[], clientsForAnalysis: ClientName[]): CityClientMatrixRow[] => {
    if (!localData || localData.length === 0) {
      return [];
    }

    const filteredData = localData.filter(record => clientsForAnalysis.includes(record.client));

    if (filteredData.length === 0 && localData.length > 0) {
        toast({ title: "No Data for Selected Clients", description: "No demand data found for the currently selected clients on this date." });
        return [];
    }
    if (filteredData.length === 0 && localData.length === 0) {
         toast({ title: "No Local Data", description: `No local demand data found for ${format(selectedDate, 'yyyy-MM-dd')}. Sync from Admin Panel or use Data Ingestion.` });
        return [];
    }


    const citiesData: Record<string, {
      activeClients: Set<ClientName>;
      areas: Record<string, number>; // areaName: totalDemand from selected clients
    }> = {};

    for (const record of filteredData) {
      if (!record || typeof record.city !== 'string' || record.city.trim() === '') {
        continue;
      }
      const cityKey = record.city;

      if (!citiesData[cityKey]) {
        citiesData[cityKey] = {
          activeClients: new Set(),
          areas: {},
        };
      }
      const cityEntry = citiesData[cityKey];
      cityEntry.activeClients.add(record.client);

      if (record.area && typeof record.area === 'string' && record.area.trim() !== '' && typeof record.demandScore === 'number') {
        cityEntry.areas[record.area] = (cityEntry.areas[record.area] || 0) + record.demandScore;
      }
    }

    const resultMatrix: CityClientMatrixRow[] = [];
    for (const cityName in citiesData) {
      const cityInfo = citiesData[cityName];
      const sortedAreas = Object.entries(cityInfo.areas)
        .map(([areaName, totalDemand]) => ({ areaName, totalDemand }))
        .sort((a, b) => b.totalDemand - a.totalDemand);

      const top3AreasString = sortedAreas.slice(0, 3)
        .map(a => `${a.areaName} (${a.totalDemand})`)
        .join(', ') || 'N/A';

      const clientPresence: Partial<Record<ClientName, boolean>> = {};
      clientsForAnalysis.forEach(client => {
        clientPresence[client] = cityInfo.activeClients.has(client);
      });

      resultMatrix.push({
        city: cityName,
        blinkit: clientPresence['Blinkit'] || false,
        zepto: clientPresence['Zepto'] || false,
        swiggyFood: clientPresence['SwiggyFood'] || false,
        swiggyIM: clientPresence['SwiggyIM'] || false,
        highDemandAreas: top3AreasString,
        activeSelectedClientCount: cityInfo.activeClients.size, // Store count for sorting
      });
    }

    // Sort: Primary by number of active selected clients (desc), Secondary by city name (asc)
    return resultMatrix.sort((a, b) => {
      if ((b.activeSelectedClientCount ?? 0) !== (a.activeSelectedClientCount ?? 0)) {
        return (b.activeSelectedClientCount ?? 0) - (a.activeSelectedClientCount ?? 0);
      }
      return a.city.localeCompare(b.city);
    });
  };


  const handleGenerateReport = async () => {
    if (!selectedDate || !isValid(selectedDate)) {
      toast({ title: "Date Required", description: "Please select a valid date to generate the report.", variant: "destructive" });
      return;
    }
    if (selectedClients.length === 0) {
      toast({ title: "Clients Required", description: "Please select at least one client to analyze.", variant: "destructive" });
      setReportData([]);
      return;
    }

    setIsLoading(true);
    setReportData([]);
    try {
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const localData = await getLocalDemandDataForDate(dateString);

      if (!localData || localData.length === 0) {
        toast({ title: "No Local Data", description: `No local demand data found for ${dateString}. Please sync from Admin Panel or use Data Ingestion.` });
        setReportData([]);
        setIsLoading(false);
        return;
      }
      
      const processedReport = processDataForReport(localData, selectedClients);
      setReportData(processedReport);

      if (processedReport.length === 0 && localData.length > 0) {
        // This case is handled by processDataForReport toast if no data for selected clients
      } else if (processedReport.length === 0) {
        // Handled by the no local data check above
      }
      else {
        toast({ title: "Report Generated", description: `Analyzed ${processedReport.length} cities for ${dateString} from local data.` });
      }
    } catch (error) {
      console.error('Failed to generate city analysis report from local data:', error);
      toast({ title: 'Error Generating Report', description: error instanceof Error ? error.message : 'Could not generate report.', variant: 'destructive' });
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-generate report when date or selected clients change
  useEffect(() => {
    if (selectedDate && isValid(selectedDate) && selectedClients.length > 0) {
      handleGenerateReport();
    } else if (selectedClients.length === 0) {
        setReportData([]); // Clear report if no clients are selected
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedClients]);


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Report Filters</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Select date and clients to analyze from local data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="report-date">Date</Label>
              <DatePicker id="report-date" date={selectedDate} onDateChange={handleDateChange} disabled={isLoading} />
            </div>
            <div>
              <Label>Clients</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 border rounded-md">
                {ALL_CLIENT_NAMES.map(client => (
                  <div key={client} className="flex items-center space-x-2">
                    <Checkbox
                      id={`client-${client}`}
                      checked={selectedClients.includes(client)}
                      onCheckedChange={(checked) => handleClientSelectionChange(client, !!checked)}
                      disabled={isLoading}
                    />
                    <Label htmlFor={`client-${client}`} className="text-sm font-normal">
                      {client}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
           <Button onClick={handleGenerateReport} disabled={isLoading || selectedClients.length === 0} className="w-full sm:w-auto mt-4">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-sm text-muted-foreground">Generating report from local data...</p>
        </div>
      )}

      {!isLoading && reportData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">City Client Activity &amp; Top Demand Areas</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Report for {selectedDate && isValid(selectedDate) ? format(selectedDate, 'PPP') : 'selected date'} using selected clients.
              Sorted by number of active selected clients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[600px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow>
                    <TableHead>City</TableHead>
                    {selectedClients.includes('Blinkit') && <TableHead className="text-center">Blinkit</TableHead>}
                    {selectedClients.includes('Zepto') && <TableHead className="text-center">Zepto</TableHead>}
                    {selectedClients.includes('SwiggyFood') && <TableHead className="text-center">SwiggyFood</TableHead>}
                    {selectedClients.includes('SwiggyIM') && <TableHead className="text-center">SwiggyIM</TableHead>}
                    <TableHead>High Demand Areas (Top 3 from Selected Clients)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData
                    .filter(row => row && typeof row === 'object' && row.city)
                    .map((row) => {
                      return (
                        <TableRow key={row.city}>
                          <TableCell className="font-medium">{row.city ?? 'N/A'}</TableCell>
                          {selectedClients.includes('Blinkit') && (
                            <TableCell className="text-center">
                              {row.blinkit ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                          {selectedClients.includes('Zepto') && (
                            <TableCell className="text-center">
                              {row.zepto ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                           {selectedClients.includes('SwiggyFood') && (
                            <TableCell className="text-center">
                              {row.swiggyFood ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                          {selectedClients.includes('SwiggyIM') && (
                            <TableCell className="text-center">
                              {row.swiggyIM ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                          <TableCell className="text-xs sm:text-sm">{row.highDemandAreas || 'N/A'}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!isLoading && reportData.length === 0 && selectedClients.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              No data to display. Select a date and clients, then click "Generate Report".
              Ensure local data is available for the selected date.
            </p>
          </CardContent>
        </Card>
      )}
      {!isLoading && selectedClients.length === 0 && (
         <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              Please select at least one client to generate the report.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
