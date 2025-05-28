
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fetchAllSheetsDataAction } from '@/lib/actions';
import type { MergedSheetData, ClientName } from '@/lib/types';
import type { ClientFetchResult } from '@/lib/services/google-sheet-service'; // Import the new type
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, FileText, AlertTriangle, CheckCircle, XCircle, FileQuestion, Info } from 'lucide-react';

const CLIENT_OPTIONS_ORDER: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];

interface SourceStatus extends ClientFetchResult {
  status: 'pending' | 'success' | 'error' | 'empty'; // Override status to include pending
}


export function DataIngestionClient() {
  const [mergedData, setMergedData] = useState<MergedSheetData[]>([]);
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>(
    CLIENT_OPTIONS_ORDER.map(client => ({ client, status: 'pending', rowCount: 0 }))
  );
  const [isFetching, setIsFetching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFetchData = async () => {
    setIsFetching(true);
    setMergedData([]); 
    setSourceStatuses(CLIENT_OPTIONS_ORDER.map(client => ({ client, status: 'pending', rowCount: 0 })));
    
    try {
      const result = await fetchAllSheetsDataAction();
      setMergedData(result.allMergedData);
      
      // Update sourceStatuses based on result.clientResults
      const updatedStatuses = CLIENT_OPTIONS_ORDER.map(clientName => {
        const clientResult = result.clientResults.find(cr => cr.client === clientName);
        if (clientResult) {
          return clientResult as SourceStatus; // Cast because server result won't have 'pending'
        }
        // Should not happen if server returns all attempted clients
        return { client: clientName, status: 'error', message: 'Status not reported by server.', rowCount: 0 } as SourceStatus;
      });
      setSourceStatuses(updatedStatuses);

      const successCount = result.clientResults.filter(r => r.status === 'success').length;
      const emptyCount = result.clientResults.filter(r => r.status === 'empty').length;
      const errorCount = result.clientResults.filter(r => r.status === 'error').length;

      if (errorCount > 0) {
        toast({
          title: 'Data Fetched with Some Errors',
          description: `${successCount} sources succeeded, ${emptyCount} empty, ${errorCount} failed. ${result.allMergedData.length} total records fetched. Check details below.`,
          variant: 'default', 
        });
      } else if (result.allMergedData.length === 0 && successCount === 0 && emptyCount > 0) {
        toast({
          title: 'No Data Fetched',
          description: 'All sources were processed but returned no data rows.',
        });
      } else {
        toast({
          title: 'Data Fetched Successfully',
          description: `Successfully fetched ${result.allMergedData.length} records. ${successCount} sources succeeded, ${emptyCount} empty.`,
        });
      }
    } catch (error) {
      console.error('Failed to fetch data (action level):', error);
      toast({
        title: 'Fetch Error',
        description: 'Could not fetch data. Please try again.',
        variant: 'destructive',
      });
      setSourceStatuses(CLIENT_OPTIONS_ORDER.map(client => ({ 
        client, 
        status: 'error', 
        message: 'An unexpected error occurred during fetch.', 
        rowCount: 0 
      })));
    } finally {
      setIsFetching(false);
    }
  };

  const handleUploadData = async () => {
    if (mergedData.length === 0 && !sourceStatuses.some(s => s.status === 'success' && s.rowCount > 0)) {
        // Check if there was any successful data even if mergedData is empty due to filtering later
      toast({
        title: 'No Data to Upload',
        description: 'Fetch data first or ensure some sources fetched data successfully.',
        variant: 'destructive',
      });
      return;
    }
    setIsUploading(true);
    try {
      const result = await saveDemandDataAction(mergedData);
      if (result.success) {
        toast({
          title: 'Upload Successful',
          description: result.message,
        });
      } else {
        toast({
          title: 'Upload Failed',
          description: result.message || 'An unknown error occurred.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Failed to upload data:', error);
      toast({
        title: 'Upload Error',
        description: 'Could not upload data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  const getStatusIcon = (status: SourceStatus['status']) => {
    switch (status) {
      case 'pending': return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'success': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'empty': return <FileQuestion className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingest Demand Data</CardTitle>
        <CardDescription>
          Click "Fetch Now" to retrieve the latest data from configured Google Sheets.
          Preview the combined data below, then "Upload to System" to save it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex space-x-2">
          <Button onClick={handleFetchData} disabled={isFetching || isUploading}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Fetch Now
          </Button>
          <Button onClick={handleUploadData} disabled={isUploading || (mergedData.length === 0 && !sourceStatuses.some(s => s.status === 'success' && s.rowCount > 0)) || isFetching} variant="outline">
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            Upload to System
          </Button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Source Statuses:</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sourceStatuses.map((source) => (
              <li key={source.client} className="flex items-center justify-between p-2 border rounded-md bg-background/50">
                <div className="flex items-center gap-2">
                  {getStatusIcon(source.status)}
                  <span className="font-medium">{source.client}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {source.status === 'pending' && 'Fetching...'}
                  {source.status === 'success' && `Success (${source.rowCount} rows)`}
                  {source.status === 'empty' && (source.message || 'No data')}
                  {source.status === 'error' && (source.message || 'Failed')}
                </div>
              </li>
            ))}
          </ul>
        </div>


        {isFetching && sourceStatuses.every(s => s.status === 'pending') && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Initializing data fetch...</p>
          </div>
        )}

        {mergedData.length > 0 && !isFetching && (
          <div className="max-h-[500px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Demand Score</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.client}</TableCell>
                    <TableCell>{item.city}</TableCell>
                    <TableCell>{item.area}</TableCell>
                    <TableCell>{item.demandScore}</TableCell>
                    <TableCell>{new Date(item.timestamp).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {mergedData.length === 0 && !isFetching && sourceStatuses.some(s => s.status !== 'pending') && (
           <div className="text-center py-10 text-muted-foreground">
             <p>
                {sourceStatuses.every(s => s.status === 'error') 
                    ? "All sources failed to fetch. Check status details above." 
                    : sourceStatuses.every(s => s.status === 'empty' || s.status === 'error')
                    ? "No data was found in any source, or sources failed. Check status details above."
                    : "No data to display. Fetch may have completed with no records or only errors."
                }
             </p>
           </div>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {mergedData.length > 0 ? `${mergedData.length} records loaded for preview.` : !isFetching ? "Data preview will appear here after fetching." : "Fetching data..."}
        </p>
      </CardFooter>
    </Card>
  );
}
