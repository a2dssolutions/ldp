
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
import type { CityClientMatrixRow, ClientName, LocalDemandRecord } from '@/lib/types';
import { ALL_CLIENT_NAMES } from '@/lib/types';
import { getLocalDemandDataForDate } from '@/lib/services/demand-data-service';
import { getAppSettingsAction } from '@/lib/actions';
import type { AppSettings } from '@/lib/services/config-service';
import { useToast } from '@/hooks/use-toast';
import { format, isValid, parseISO } from 'date-fns';
import { Loader2, Search, CheckCircle2, XCircle, ArrowUp, ArrowDown, Filter, ListFilter } from 'lucide-react';

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
  
  const [showBlacklistedCities, setShowBlacklistedCities] = useState(false);
  const [blacklistedCitiesList, setBlacklistedCitiesList] = useState<string[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const settings = await getAppSettingsAction();
        setBlacklistedCitiesList(settings.blacklistedCities || []);
      } catch (error) {
        console.error("Failed to fetch app settings for city analysis:", error);
        toast({ title: "Error", description: "Could not load blacklist settings.", variant: "destructive" });
      } finally {
        setIsLoadingSettings(false);
      }
    };
    fetchSettings();
  }, [toast]);


  const handleDateChange = (date: Date | undefined) => {
    if (date && isValid(date)) {
      setSelectedDate_(date);
    } else {
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

  const processDataForReport = useCallback((localData: LocalDemandRecord[], clientsForAnalysis: ClientName[]): CityClientMatrixRow[] => {
    if (!localData || localData.length === 0) return [];

    const filteredDataBySelectedPrimaryClients = localData.filter(record => 
        clientsForAnalysis.includes(record.client) && 
        record.city && record.area && typeof record.demandScore === 'number'
    );
    
    if (clientsForAnalysis.length > 0 && filteredDataBySelectedPrimaryClients.length === 0 && localData.length > 0) {
        toast({ title: "No Data for Selected Clients", description: "No demand data found for the currently selected primary clients on this date." });
        return [];
    }
    if (filteredDataBySelectedPrimaryClients.length === 0) return [];

    const demandByCity: Record<string, Record<ClientName, LocalDemandRecord[]>> = {};
    for (const record of filteredDataBySelectedPrimaryClients) {
      if (!demandByCity[record.city]) demandByCity[record.city] = {} as Record<ClientName, LocalDemandRecord[]>;
      if (!demandByCity[record.city][record.client]) demandByCity[record.city][record.client] = [];
      demandByCity[record.city][record.client].push(record);
    }

    const resultMatrix: CityClientMatrixRow[] = [];
    for (const cityName in demandByCity) {
      const clientDataInCity = demandByCity[cityName];
      const clientPresenceFlags: Partial<Record<ClientName, boolean>> = {};
      const clientTopAreaDetails: string[] = [];
      let activeSelectedClientCountForThisCity = 0;

      for (const selectedClient of clientsForAnalysis) {
        const recordsForThisClientInThisCity = clientDataInCity[selectedClient] || [];
        clientPresenceFlags[selectedClient] = recordsForThisClientInThisCity.length > 0;

        if (recordsForThisClientInThisCity.length > 0) {
          activeSelectedClientCountForThisCity++;
          let topAreaForClient = '';
          let maxDemandForClient = -1;

          const areasForClientInCity: Record<string, number> = {};
          recordsForThisClientInThisCity.forEach(rec => {
            areasForClientInCity[rec.area] = (areasForClientInCity[rec.area] || 0) + rec.demandScore;
          });

          for (const areaName in areasForClientInCity) {
            if (areasForClientInCity[areaName] > maxDemandForClient) {
              maxDemandForClient = areasForClientInCity[areaName];
              topAreaForClient = areaName;
            } else if (areasForClientInCity[areaName] === maxDemandForClient) {
              if (areaName.localeCompare(topAreaForClient) < 0) {
                topAreaForClient = areaName;
              }
            }
          }
          if (topAreaForClient) {
            clientTopAreaDetails.push(`${selectedClient}: ${topAreaForClient} (${maxDemandForClient})`);
          }
        }
      }
      
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
  }, [toast]);


  const handleGenerateReport = useCallback(async () => {
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
    // setSelectedActiveClientCounts([]); // Reset active count filter only if primary clients or date change significantly
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

      if (processedReport.length > 0) {
        toast({ title: "Report Generated", description: `Analyzed ${processedReport.length} cities for ${dateString} from local data.` });
      }
    } catch (error) {
      console.error('Failed to generate city analysis report from local data:', error);
      toast({ title: 'Error Generating Report', description: error instanceof Error ? error.message : 'Could not generate report.', variant: 'destructive' });
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, primarySelectedClients, processDataForReport, toast]);

  useEffect(() => {
    if (selectedDate && isValid(selectedDate) && primarySelectedClients.length > 0 && !isLoadingSettings) {
      handleGenerateReport();
    } else if (primarySelectedClients.length === 0) {
        setReportData([]);
        setSelectedActiveClientCounts([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, primarySelectedClients, handleGenerateReport, isLoadingSettings]); // Added isLoadingSettings

  const handleSort = (key: SortKey) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        return { key, direction: prevConfig.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: key === 'activeSelectedClientCount' ? 'desc' : 'asc' };
    });
  };

  const uniqueActiveCountsForFilter = useMemo(() => {
    const counts = new Set(reportData.map(row => row.activeSelectedClientCount));
    return Array.from(counts).sort((a, b) => a - b);
  }, [reportData]);

  const sortedAndFilteredReportData = useMemo(() => {
    let dataToDisplay = [...reportData];

    if (!showBlacklistedCities && blacklistedCitiesList.length > 0) {
      const lowercasedBlacklist = blacklistedCitiesList.map(city => city.toLowerCase());
      dataToDisplay = dataToDisplay.filter(row => !lowercasedBlacklist.includes(row.city.toLowerCase()));
    }

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
        
        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        }

        if (comparison === 0 && sortConfig.key !== 'city') {
          comparison = a.city.localeCompare(b.city);
        }
        return sortConfig.direction === 'asc' ? comparison : comparison * -1;
      });
    } else {
      dataToDisplay.sort((a, b) => {
        const countComparison = b.activeSelectedClientCount - a.activeSelectedClientCount;
        if (countComparison !== 0) return countComparison;
        return a.city.localeCompare(b.city);
      });
    }
    return dataToDisplay;
  }, [reportData, citySearchTerm, sortConfig, selectedActiveClientCounts, showBlacklistedCities, blacklistedCitiesList]);

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <div>
              <Label htmlFor="report-date">Date</Label>
              <DatePicker id="report-date" date={selectedDate} onDateChange={handleDateChange} disabled={isLoading || isLoadingSettings} />
            </div>
            <div className="lg:col-span-2">
              <Label>Primary Clients for Analysis</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 border rounded-md">
                {ALL_CLIENT_NAMES.map(client => (
                  <div key={client} className="flex items-center space-x-2">
                    <Checkbox
                      id={`client-${client}`}
                      checked={primarySelectedClients.includes(client)}
                      onCheckedChange={(checked) => handlePrimaryClientSelectionChange(client, !!checked)}
                      disabled={isLoading || isLoadingSettings}
                    />
                    <Label htmlFor={`client-${client}`} className="text-sm font-normal">
                      {client}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
             <div className="flex items-center space-x-2">
              <Switch
                id="show-blacklisted-cities"
                checked={showBlacklistedCities}
                onCheckedChange={setShowBlacklistedCities}
                disabled={isLoading || isLoadingSettings}
              />
              <Label htmlFor="show-blacklisted-cities" className="text-sm">Show Blacklisted Cities</Label>
            </div>
          </div>
           <Button onClick={handleGenerateReport} disabled={isLoading || primarySelectedClients.length === 0 || isLoadingSettings} className="w-full sm:w-auto mt-4">
            {isLoading || isLoadingSettings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {isLoadingSettings ? 'Loading Settings...' : 'Generate Report'}
          </Button>
        </CardContent>
      </Card>

      {(isLoading || isLoadingSettings) && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-sm text-muted-foreground">
            {isLoadingSettings ? 'Loading settings...' : 'Generating report from local data...'}
          </p>
        </div>
      )}

      {!isLoading && !isLoadingSettings && reportData.length > 0 && (
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
                              <ListFilter className="h-4 w-4" />
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
                          <TableCell className="text-center">{row.activeSelectedClientCount}</TableCell>
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
             {sortedAndFilteredReportData.length === 0 && (citySearchTerm || selectedActiveClientCounts.length > 0 || (!showBlacklistedCities && blacklistedCitiesList.length > 0 && reportData.length > 0) ) && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No cities match your current filter criteria.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!isLoading && !isLoadingSettings && reportData.length === 0 && primarySelectedClients.length > 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              No data to display. Select a date and primary clients, then click "Generate Report".
              Ensure local data is available for the selected date and selected primary clients.
            </p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isLoadingSettings && primarySelectedClients.length === 0 && (
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

