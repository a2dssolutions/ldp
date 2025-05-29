
'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CityClientMatrixRow, ClientName, DemandData } from '@/lib/types';
import { ALL_CLIENT_NAMES } from '@/lib/types';
import { getLocalDemandDataForDate } from '@/lib/services/demand-data-service';
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO } from 'date-fns';
import { Loader2, Search, CheckCircle2, XCircle, ArrowUp, ArrowDown, Filter, List, Columns } from 'lucide-react';
import type { LocalDemandRecord } from '@/lib/dexie';

interface CityAnalysisClientProps {
  initialSelectedDate: string;
}

type SortKey = 'city' | 'activeSelectedClientCount';
interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export function CityAnalysisClient({ initialSelectedDate }: CityAnalysisClientProps) {
  const [selectedDate, setSelectedDate_] = useState<Date>(new Date(initialSelectedDate));
  const [primarySelectedClients, setPrimarySelectedClients] = useState<ClientName[]>(ALL_CLIENT_NAMES);
  const [reportData, setReportData] = useState<CityClientMatrixRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [citySearchTerm, setCitySearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'activeSelectedClientCount', direction: 'desc' });
  const [selectedActiveClientCounts, setSelectedActiveClientCounts] = useState<number[]>([]);


  const handleDateChange = (date: Date | undefined) => {
    if (date && isValid(date)) {
      setSelectedDate_(date);
    } else {
      // Fallback to a valid date if undefined or invalid, to prevent errors
      setSelectedDate_(new Date(initialSelectedDate));
      toast({ title: "Invalid Date", description: "Please select a valid date.", variant: "destructive" });
    }
  };

  const handlePrimaryClientSelectionChange = (client: ClientName, checked: boolean) => {
    setPrimarySelectedClients(prev =>
      checked ? [...prev, client] : prev.filter(c => c !== client)
    );
  };

  const handleActiveClientCountFilterChange = (count: number) => {
    setSelectedActiveClientCounts(prev =>
      prev.includes(count) ? prev.filter(c => c !== count) : [...prev, count]
    );
  };

  const processDataForReport = (localData: LocalDemandRecord[], clientsForAnalysis: ClientName[]): CityClientMatrixRow[] => {
    if (!localData || localData.length === 0) {
      return [];
    }

    // Filter localData to only include records from the clients selected for analysis
    const filteredDataBySelectedPrimaryClients = localData.filter(record => clientsForAnalysis.includes(record.client));

    if (filteredDataBySelectedPrimaryClients.length === 0 && localData.length > 0) {
        toast({ title: "No Data for Selected Clients", description: "No demand data found for the currently selected primary clients on this date." });
        return [];
    }
    if (filteredDataBySelectedPrimaryClients.length === 0 && localData.length === 0) {
        // This case should be handled by the outer check for localData.length
        return [];
    }

    // Group all records by city
    const demandByCity: Record<string, LocalDemandRecord[]> = {};
    for (const record of filteredDataBySelectedPrimaryClients) { // Use data already filtered by primary clients
      if (!record.city) continue;
      if (!demandByCity[record.city]) {
        demandByCity[record.city] = [];
      }
      demandByCity[record.city].push(record);
    }

    const resultMatrix: CityClientMatrixRow[] = [];

    for (const cityName in demandByCity) {
      const recordsInCity = demandByCity[cityName]; // These are already filtered for the primary selected clients
      const clientPresenceFlags: Partial<Record<ClientName, boolean>> = {};
      const clientTopAreaDetails: string[] = [];
      let activeSelectedClientCountForThisCity = 0;

      // Iterate through the *primary selected clients* to build the report row
      for (const selectedClient of clientsForAnalysis) {
        const recordsForThisClientInThisCity = recordsInCity.filter(r => r.client === selectedClient);

        if (recordsForThisClientInThisCity.length > 0) {
          clientPresenceFlags[selectedClient] = true;
          activeSelectedClientCountForThisCity++;

          let topAreaForClient = '';
          let maxDemandForClient = -1;

          // Aggregate demand by area for *this specific client* in *this city*
          const areasForClientInCity: Record<string, number> = {};
          recordsForThisClientInThisCity.forEach(rec => {
            if (rec.area && typeof rec.demandScore === 'number') {
              areasForClientInCity[rec.area] = (areasForClientInCity[rec.area] || 0) + rec.demandScore;
            }
          });

          // Find the top area for this client in this city
          for (const areaName in areasForClientInCity) {
            if (areasForClientInCity[areaName] > maxDemandForClient) {
              maxDemandForClient = areasForClientInCity[areaName];
              topAreaForClient = areaName;
            } else if (areasForClientInCity[areaName] === maxDemandForClient) {
              // Simple tie-breaking: choose the alphabetically first area name
              if (areaName.localeCompare(topAreaForClient) < 0) {
                topAreaForClient = areaName;
              }
            }
          }

          if (topAreaForClient && maxDemandForClient > -1) {
            clientTopAreaDetails.push(`${selectedClient}: ${topAreaForClient} (${maxDemandForClient})`);
          }
        } else {
          clientPresenceFlags[selectedClient] = false;
        }
      }
      
      // Sort the clientTopAreaDetails by client name for consistent order in the "High Demand Areas" column
      clientTopAreaDetails.sort((a, b) => a.localeCompare(b));

      resultMatrix.push({
        city: cityName,
        blinkit: clientPresenceFlags['Blinkit'] ?? false,
        zepto: clientPresenceFlags['Zepto'] ?? false,
        swiggyFood: clientPresenceFlags['SwiggyFood'] ?? false,
        swiggyIM: clientPresenceFlags['SwiggyIM'] ?? false,
        highDemandAreas: clientTopAreaDetails.length > 0 ? clientTopAreaDetails.join(', ') : 'N/A',
        activeSelectedClientCount: activeSelectedClientCountForThisCity,
      });
    }
    return resultMatrix;
  };


  const handleGenerateReport = async () => {
    if (!selectedDate || !isValid(selectedDate)) {
      toast({ title: "Date Required", description: "Please select a valid date to generate the report.", variant: "destructive" });
      return;
    }
    if (primarySelectedClients.length === 0) {
      toast({ title: "Primary Clients Required", description: "Please select at least one primary client to analyze.", variant: "destructive" });
      setReportData([]);
      return;
    }

    setIsLoading(true);
    setReportData([]);
    setSelectedActiveClientCounts([]); // Reset active count filter when primary clients or date changes
    try {
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const localData = await getLocalDemandDataForDate(dateString);

      if (!localData || localData.length === 0) {
        toast({ title: "No Local Data", description: `No local demand data found for ${dateString}. Please sync from Admin Panel or use Data Ingestion.` });
        setReportData([]);
        setIsLoading(false);
        return;
      }

      const processedReport = processDataForReport(localData, primarySelectedClients);
      setReportData(processedReport);

      if (processedReport.length === 0 && localData.length > 0 && primarySelectedClients.length > 0) {
        // This specific toast is handled within processDataForReport if no data for selected clients
      } else if (processedReport.length === 0 && primarySelectedClients.length > 0) {
        // Also implies no local data for the date, or no data for selected clients.
        // The more specific "No Local Data" or "No Data for Selected Clients" toasts will have fired.
      }
      else if (processedReport.length > 0) {
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

  useEffect(() => {
    if (selectedDate && isValid(selectedDate) && primarySelectedClients.length > 0) {
      handleGenerateReport();
    } else if (primarySelectedClients.length === 0) {
        setReportData([]);
        setSelectedActiveClientCounts([]); // Clear filters if no primary clients are selected
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, primarySelectedClients]); // Auto-generate report when date or primary clients change

  const handleSort = (key: SortKey) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        return { key, direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' };
      }
      // Default sort direction for new column: 'desc' for count, 'asc' for text
      return { key, direction: key === 'activeSelectedClientCount' ? 'desc' : 'asc' };
    });
  };

  const uniqueActiveCountsForFilter = useMemo(() => {
    // Derives filter options from the currently processed reportData (before search term or active count filtering)
    const counts = new Set(reportData.map(row => row.activeSelectedClientCount));
    return Array.from(counts).sort((a, b) => a - b);
  }, [reportData]);

  const sortedAndFilteredReportData = useMemo(() => {
    let dataToDisplay = [...reportData];

    if (citySearchTerm) {
      dataToDisplay = dataToDisplay.filter(row =>
        row.city.toLowerCase().includes(citySearchTerm.toLowerCase())
      );
    }

    if (selectedActiveClientCounts.length > 0) {
      dataToDisplay = dataToDisplay.filter(row =>
        selectedActiveClientCounts.includes(row.activeSelectedClientCount)
      );
    }

    if (sortConfig.key) {
      dataToDisplay.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle null or undefined values by pushing them to the end for asc, start for desc
        if (valA == null) valA = sortConfig.direction === 'asc' ? Infinity : -Infinity;
        if (valB == null) valB = sortConfig.direction === 'asc' ? Infinity : -Infinity;
        
        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        }

        // Secondary sort by city name if primary sort key values are equal
        if (comparison === 0 && sortConfig.key !== 'city') {
          comparison = a.city.localeCompare(b.city);
        }


        return sortConfig.direction === 'asc' ? comparison : comparison * -1;
      });
    } else {
      // Default sort if sortConfig.key is not set (should not happen with initial state)
      // but as a fallback: sort by activeSelectedClientCount (desc) then city (asc)
      dataToDisplay.sort((a, b) => {
        const countComparison = (b.activeSelectedClientCount ?? 0) - (a.activeSelectedClientCount ?? 0);
        if (countComparison !== 0) return countComparison;
        return a.city.localeCompare(b.city);
      });
    }
    return dataToDisplay;
  }, [reportData, citySearchTerm, sortConfig, selectedActiveClientCounts]);

  const SortIndicator = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return null;
    return sortConfig.direction === 'asc' ? <ArrowUp className="h-4 w-4 inline ml-1" /> : <ArrowDown className="h-4 w-4 inline ml-1" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Report Filters</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Select date and primary clients to analyze from local data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <Label htmlFor="report-date">Date</Label>
              <DatePicker id="report-date" date={selectedDate} onDateChange={handleDateChange} disabled={isLoading} />
            </div>
            <div>
              <Label>Primary Clients for Analysis</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 border rounded-md">
                {ALL_CLIENT_NAMES.map(client => (
                  <div key={client} className="flex items-center space-x-2">
                    <Checkbox
                      id={`client-${client}`}
                      checked={primarySelectedClients.includes(client)}
                      onCheckedChange={(checked) => handlePrimaryClientSelectionChange(client, !!checked)}
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
           <Button onClick={handleGenerateReport} disabled={isLoading || primarySelectedClients.length === 0} className="w-full sm:w-auto mt-4">
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
              Report for {selectedDate && isValid(selectedDate) ? format(selectedDate, 'PPP') : 'selected date'} using selected primary clients.
              "High Demand Areas" shows the top area for each selected client in that city.
            </CardDescription>
             <div className="pt-2">
              <Label htmlFor="city-search">Filter by City Name</Label>
              <Input
                id="city-search"
                placeholder="Enter city name to filter..."
                value={citySearchTerm}
                onChange={(e) => setCitySearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[600px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow>
                    <TableHead>
                      <Button variant="ghost" onClick={() => handleSort('city')} className="px-0 hover:bg-transparent">
                        City <SortIndicator columnKey="city" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" onClick={() => handleSort('activeSelectedClientCount')} className="px-0 hover:bg-transparent text-center">
                          Active Clients <SortIndicator columnKey="activeSelectedClientCount" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" disabled={uniqueActiveCountsForFilter.length === 0}>
                              <Filter className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuLabel>Filter by Active Client Count</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {uniqueActiveCountsForFilter.map(count => (
                              <DropdownMenuCheckboxItem
                                key={count}
                                checked={selectedActiveClientCounts.includes(count)}
                                onCheckedChange={() => handleActiveClientCountFilterChange(count)}
                              >
                                {count}
                              </DropdownMenuCheckboxItem>
                            ))}
                             {selectedActiveClientCounts.length > 0 && (
                                <>
                                <DropdownMenuSeparator />
                                <Button 
                                    variant="ghost" 
                                    className="w-full justify-start text-xs h-auto py-1 px-2" 
                                    onClick={() => setSelectedActiveClientCounts([])}
                                >
                                    Clear Active Count Filter
                                </Button>
                                </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                    {primarySelectedClients.includes('Blinkit') && <TableHead className="text-center">Blinkit</TableHead>}
                    {primarySelectedClients.includes('Zepto') && <TableHead className="text-center">Zepto</TableHead>}
                    {primarySelectedClients.includes('SwiggyFood') && <TableHead className="text-center">SwiggyFood</TableHead>}
                    {primarySelectedClients.includes('SwiggyIM') && <TableHead className="text-center">SwiggyIM</TableHead>}
                    <TableHead>High Demand Areas (Top per Selected Client)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedAndFilteredReportData
                    .filter(row => row && typeof row === 'object' && row.city) 
                    .map((row) => {
                      return (
                        <TableRow key={row.city}>
                          <TableCell className="font-medium">{row.city ?? 'N/A'}</TableCell>
                          <TableCell className="text-center">{row.activeSelectedClientCount ?? 0}</TableCell>
                          {primarySelectedClients.includes('Blinkit') && (
                            <TableCell className="text-center">
                              {row.blinkit ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                          {primarySelectedClients.includes('Zepto') && (
                            <TableCell className="text-center">
                              {row.zepto ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                           {primarySelectedClients.includes('SwiggyFood') && (
                            <TableCell className="text-center">
                              {row.swiggyFood ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                            </TableCell>
                          )}
                          {primarySelectedClients.includes('SwiggyIM') && (
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
             {sortedAndFilteredReportData.length === 0 && (citySearchTerm || selectedActiveClientCounts.length > 0) && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No cities match your current filter criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && reportData.length === 0 && primarySelectedClients.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              No data to display. Select a date and primary clients, then click "Generate Report".
              Ensure local data is available for the selected date and selected primary clients.
            </p>
          </CardContent>
        </Card>
      )}
      {!isLoading && primarySelectedClients.length === 0 && (
         <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              Please select at least one primary client to generate the report.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
