
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { fetchAllSheetsDataAction, saveDemandDataAction } from '@/lib/actions';
import type { MergedSheetData, ClientName, DemandData } from '@/lib/types';
import { ALL_CLIENT_NAMES } from '@/lib/types';
import { saveBatchDataToLocalDB, updateSyncStatus } from '@/lib/services/demand-data-service';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, FileText, AlertTriangle, CheckCircle, XCircle, FileQuestion, Info, Database } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format, parseISO } from 'date-fns';

interface SourceStatus {
  client: ClientName;
  status: 'initial' | 'pending' | 'success' | 'error' | 'empty' | 'not-fetched';
  message?: string;
  rowCount: number;
}

interface DataFetchedThisSession {
  [key: string]: MergedSheetData[];
}

export function DataIngestionClient() {
  const [mergedDataPreview, setMergedDataPreview] = useState<MergedSheetData[]>([]);
  const [dataFetchedThisSession, setDataFetchedThisSession] = useState<DataFetchedThisSession>({});

  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>(
    ALL_CLIENT_NAMES.map(client => ({ client, status: 'initial', rowCount: 0, message: 'Ready' }))
  );

  const [selectedClientsToFetch, setSelectedClientsToFetch] = useState<ClientName[]>(ALL_CLIENT_NAMES);
  const [selectedClientsToUpload, setSelectedClientsToUpload] = useState<ClientName[]>([]);

  const [isFetching, setIsFetching] = useState(false);
  const [isUploadingToSystem, setIsUploadingToSystem] = useState(false);
  const [isUploadingToLocal, setIsUploadingToLocal] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let newPreview: MergedSheetData[] = [];
    if (Object.keys(dataFetchedThisSession).length > 0) {
      selectedClientsToUpload.forEach(clientName => {
        if (dataFetchedThisSession[clientName]) {
          newPreview = newPreview.concat(dataFetchedThisSession[clientName]);
        }
      });
    }
    setMergedDataPreview(newPreview);
  }, [dataFetchedThisSession, selectedClientsToUpload]);


  const handleClientSelectionForFetch = (client: ClientName, checked: boolean) => {
    setSelectedClientsToFetch(prev =>
      checked ? [...prev, client] : prev.filter(c => c !== client)
    );
  };

  const handleClientSelectionForUpload = (client: ClientName, checked: boolean) => {
    setSelectedClientsToUpload(prev =>
      checked ? [...prev, client] : prev.filter(c => c !== client)
    );
  };

  const handleFetchData = async () => {
    if (selectedClientsToFetch.length === 0) {
      toast({ title: 'No Clients Selected', description: 'Please select at least one client to fetch data for.', variant: 'destructive' });
      return;
    }
    setIsFetching(true);
    setDataFetchedThisSession({});
    setMergedDataPreview([]);
    setSelectedClientsToUpload([]);

    setSourceStatuses(prevStatuses =>
      ALL_CLIENT_NAMES.map(clientName => ({
        client: clientName,
        status: selectedClientsToFetch.includes(clientName) ? 'pending' : 'not-fetched',
        rowCount: 0,
        message: selectedClientsToFetch.includes(clientName) ? 'Fetching...' : 'Not included in this fetch.',
      }))
    );

    try {
      const result = await fetchAllSheetsDataAction(selectedClientsToFetch);

      const newFetchedData: DataFetchedThisSession = {};
      result.clientResults.forEach(cr => {
        if (cr.status === 'success' && result.allMergedData) {
          newFetchedData[cr.client] = result.allMergedData.filter(d => d.client === cr.client);
        }
      });
      setDataFetchedThisSession(newFetchedData);
      const successfullyFetchedClients = result.clientResults
        .filter(cr => cr.status === 'success' && (newFetchedData[cr.client]?.length || 0) > 0)
        .map(cr => cr.client);
      setSelectedClientsToUpload(successfullyFetchedClients);

      const updatedStatuses = ALL_CLIENT_NAMES.map(clientName => {
        const clientResult = result.clientResults.find(cr => cr.client === clientName);
        if (clientResult) {
          return {
            client: clientResult.client,
            status: clientResult.status,
            rowCount: clientResult.rowCount,
            message: clientResult.message
          } as SourceStatus;
        }
        // If client was not part of this fetch operation, keep its status as 'not-fetched' or 'initial'
        const existingStatus = sourceStatuses.find(s => s.client === clientName);
        if (!selectedClientsToFetch.includes(clientName) && existingStatus) {
            return {...existingStatus, status: 'not-fetched', message: 'Not included in this fetch.'};
        }
        return { client: clientName, status: 'initial', message: 'Status unknown.', rowCount: 0 } as SourceStatus;
      });
      setSourceStatuses(updatedStatuses);

      const successCount = result.clientResults.filter(r => r.status === 'success' && r.rowCount > 0).length;
      const emptyCount = result.clientResults.filter(r => r.status === 'empty' || (r.status === 'success' && r.rowCount === 0)).length;
      const errorCount = result.clientResults.filter(r => r.status === 'error').length;
      const totalFetchedRecords = Object.values(newFetchedData).reduce((sum, arr) => sum + arr.length, 0);

      if (errorCount > 0) {
        toast({
          title: 'Data Fetched with Some Errors',
          description: `${successCount} sources succeeded, ${emptyCount} empty/no data, ${errorCount} failed. ${totalFetchedRecords} total records fetched. Check details below.`,
          variant: 'default',
        });
      } else if (totalFetchedRecords === 0 && (successCount === 0 || emptyCount > 0)) {
        toast({
          title: 'No Data Fetched',
          description: 'Selected sources were processed but returned no data rows.',
        });
      } else {
        toast({
          title: 'Data Fetched Successfully',
          description: `Successfully fetched ${totalFetchedRecords} records. ${successCount} sources succeeded, ${emptyCount} empty/no data.`,
        });
      }
    } catch (error) {
      console.error('Failed to fetch data (action level):', error);
      toast({
        title: 'Fetch Error',
        description: 'Could not fetch data. Please try again.',
        variant: 'destructive',
      });
      setSourceStatuses(prevStatuses =>
        prevStatuses.map(s =>
          selectedClientsToFetch.includes(s.client)
            ? { ...s, status: 'error', message: 'An unexpected error occurred during fetch.', rowCount: 0 }
            : s
        )
      );
    } finally {
      setIsFetching(false);
    }
  };

  const getSelectedDataToUpload = (): MergedSheetData[] => {
    let dataToUpload: MergedSheetData[] = [];
    selectedClientsToUpload.forEach(clientName => {
      if (dataFetchedThisSession[clientName]) {
        dataToUpload = dataToUpload.concat(dataFetchedThisSession[clientName]);
      }
    });
    return dataToUpload;
  }

  const handleUploadToSystem = async () => {
    const dataToUpload = getSelectedDataToUpload();
    if (dataToUpload.length === 0) {
      toast({
        title: 'No Data to Upload',
        description: 'Select clients with fetched data to upload.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingToSystem(true);
    try {
      const firestoreResult = await saveDemandDataAction(dataToUpload);
      if (firestoreResult.success) {
        toast({
          title: 'Firestore Upload Successful',
          description: firestoreResult.message,
        });

        try {
          const demandDataToSaveLocally: DemandData[] = dataToUpload.map(item => ({
            ...item,
            date: format(parseISO(item.timestamp), 'yyyy-MM-dd')
          }));
          await saveBatchDataToLocalDB(demandDataToSaveLocally);
          await updateSyncStatus(new Date()); 
          toast({ title: 'Local Cache Updated', description: 'Fetched data also saved to local cache and sync status updated.' });
        } catch (localSaveError) {
          console.error('Failed to save data to local Dexie DB or update sync status:', localSaveError);
          toast({
            title: 'Local Cache Update Failed',
            description: `Data saved to Firestore, but failed to update local cache: ${localSaveError instanceof Error ? localSaveError.message : String(localSaveError)}`,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Firestore Upload Failed',
          description: firestoreResult.message || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to upload data to Firestore:', error);
      toast({
        title: 'Upload Error',
        description: 'Could not upload data to Firestore. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingToSystem(false);
    }
  };

  const handleUploadToLocalOnly = async () => {
    const dataToUpload = getSelectedDataToUpload();
    if (dataToUpload.length === 0) {
      toast({
        title: 'No Data to Upload',
        description: 'Select clients with fetched data to upload locally.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploadingToLocal(true);
    try {
      const demandDataToSaveLocally: DemandData[] = dataToUpload.map(item => ({
        ...item,
        date: format(parseISO(item.timestamp), 'yyyy-MM-dd')
      }));
      await saveBatchDataToLocalDB(demandDataToSaveLocally);
      await updateSyncStatus(new Date()); 
      toast({ title: 'Local Cache Updated', description: 'Fetched data saved to local cache and sync status updated.' });
    } catch (localSaveError) {
      console.error('Failed to save data to local Dexie DB or update sync status:', localSaveError);
      toast({
        title: 'Local Cache Save Failed',
        description: `Failed to save data to local cache: ${localSaveError instanceof Error ? localSaveError.message : String(localSaveError)}`,
        variant: 'destructive',
      });
    } finally {
      setIsUploadingToLocal(false);
    }
  }

  const getStatusIcon = (status: SourceStatus['status']) => {
    switch (status) {
      case 'initial': return <Info className="h-4 w-4 text-muted-foreground" />;
      case 'pending': return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'empty': return <FileQuestion className="h-4 w-4 text-yellow-500" />;
      case 'not-fetched': return <Info className="h-4 w-4 text-gray-400" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const isAnyClientSelectedForFetch = selectedClientsToFetch.length > 0;
  const isAnyClientSelectedForUpload = selectedClientsToUpload.length > 0 && Object.keys(dataFetchedThisSession).some(client => selectedClientsToUpload.includes(client as ClientName) && (dataFetchedThisSession[client]?.length || 0) > 0);
  const isAnyOperationInProgress = isFetching || isUploadingToSystem || isUploadingToLocal;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Ingest Demand Data</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Select clients to fetch data from. Preview the data, then choose to upload it to the cloud system (Firestore & Local Cache) or to local cache only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">1. Select Clients to Fetch Data From:</h3>
            <ScrollArea className="h-48 md:h-60 w-full rounded-md border p-3 bg-background/50">
              <div className="space-y-2">
                {ALL_CLIENT_NAMES.map(client => (
                  <div key={client} className="flex items-center space-x-2">
                    <Checkbox
                      id={`fetch-${client}`}
                      checked={selectedClientsToFetch.includes(client)}
                      onCheckedChange={(checked) => handleClientSelectionForFetch(client, !!checked)}
                      disabled={isAnyOperationInProgress}
                    />
                    <Label htmlFor={`fetch-${client}`} className="text-sm font-normal">
                      {client}
                    </Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <Button onClick={handleFetchData} disabled={isAnyOperationInProgress || !isAnyClientSelectedForFetch} className="w-full">
              {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Fetch Selected Clients
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">2. Source Statuses:</h3>
            <ScrollArea className="h-48 md:h-60 w-full rounded-md border p-3 bg-background/50">
              <ul className="space-y-2">
                {sourceStatuses.map((source) => (
                  <li key={source.client} className="flex items-center justify-between p-2 border rounded-md bg-card shadow-sm">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(source.status)}
                      <span className="text-sm font-medium">{source.client}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[100px] sm:max-w-[150px]" title={source.message}>
                      {source.status === 'initial' && 'Ready'}
                      {source.status === 'pending' && (source.message || 'Fetching...')}
                      {source.status === 'success' && `Success (${source.rowCount} rows)`}
                      {source.status === 'empty' && (source.message || 'No data found')}
                      {source.status === 'error' && (source.message || 'Failed')}
                      {source.status === 'not-fetched' && (source.message || 'Not fetched')}
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        </div>

        {Object.keys(dataFetchedThisSession).length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-base font-semibold text-foreground">3. Select Fetched Clients to Upload:</h3>
            <ScrollArea className="h-32 md:h-40 w-full rounded-md border p-3 bg-background/50">
              <div className="space-y-2">
                {ALL_CLIENT_NAMES.filter(client => dataFetchedThisSession[client] && dataFetchedThisSession[client].length > 0).map(client => (
                  <div key={`upload-${client}`} className="flex items-center space-x-2">
                    <Checkbox
                      id={`upload-${client}`}
                      checked={selectedClientsToUpload.includes(client)}
                      onCheckedChange={(checked) => handleClientSelectionForUpload(client, !!checked)}
                      disabled={isAnyOperationInProgress}
                    />
                    <Label htmlFor={`upload-${client}`} className="text-sm font-normal">
                      {client} ({dataFetchedThisSession[client]?.length || 0} records)
                    </Label>
                  </div>
                ))}
                {ALL_CLIENT_NAMES.filter(client => dataFetchedThisSession[client] && dataFetchedThisSession[client].length > 0).length === 0 && (
                  <p className="text-sm text-muted-foreground">No data successfully fetched in this session to upload.</p>
                )}
              </div>
            </ScrollArea>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button onClick={handleUploadToSystem} disabled={isAnyOperationInProgress || !isAnyClientSelectedForUpload} className="w-full sm:flex-1">
                {isUploadingToSystem ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                Upload to System (Cloud & Local)
                </Button>
                <Button onClick={handleUploadToLocalOnly} variant="outline" disabled={isAnyOperationInProgress || !isAnyClientSelectedForUpload} className="w-full sm:flex-1">
                {isUploadingToLocal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                Upload to Local Only
                </Button>
            </div>
          </div>
        )}

        {isFetching && sourceStatuses.some(s => s.status === 'pending') && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-sm text-muted-foreground">Fetching data for selected sources...</p>
          </div>
        )}

        {mergedDataPreview.length > 0 && !isFetching && (
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-base font-semibold text-foreground">Preview of Data Selected for Upload ({mergedDataPreview.length} records):</h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Client</TableHead>
                    <TableHead className="whitespace-nowrap">City</TableHead>
                    <TableHead className="whitespace-nowrap">Area</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Demand Score</TableHead>
                    <TableHead className="whitespace-nowrap">Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergedDataPreview.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{item.client}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{item.city}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{item.area}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap text-right">{item.demandScore}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{new Date(item.timestamp).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {mergedDataPreview.length === 0 && !isFetching && Object.keys(dataFetchedThisSession).length > 0 && (
          <div className="text-center py-10 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              No clients selected for upload, or selected clients have no data from the recent fetch.
            </p>
          </div>
        )}

        {mergedDataPreview.length === 0 && !isFetching && Object.keys(dataFetchedThisSession).length === 0 && sourceStatuses.every(s => s.status === 'initial' || s.status === 'not-fetched') && (
          <p className="text-center text-sm text-muted-foreground py-4">
            Select clients and click "Fetch Selected Clients" to load data.
          </p>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {mergedDataPreview.length > 0 ? `${mergedDataPreview.length} records in current upload selection.` :
            !isFetching && (sourceStatuses.every(s => s.status === 'initial' || s.status === 'not-fetched') || selectedClientsToFetch.length === 0) ? "Ready to fetch data." :
              !isFetching && Object.keys(dataFetchedThisSession).length > 0 ? "Select clients from fetched data to upload or preview." :
                !isFetching ? "Data preview will appear here after fetching and selection." :
                  "Fetching data..."}
        </p>
      </CardFooter>
    </Card>
  );
}
