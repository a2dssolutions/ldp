'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchAllSheetsDataAction, saveDemandDataAction } from '@/lib/actions';
import type { MergedSheetData } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2, UploadCloud, FileText } from 'lucide-react';

export function DataIngestionClient() {
  const [mergedData, setMergedData] = useState<MergedSheetData[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFetchData = async () => {
    setIsFetching(true);
    setMergedData([]); // Clear previous data
    try {
      const data = await fetchAllSheetsDataAction();
      setMergedData(data);
      toast({
        title: 'Data Fetched',
        description: `Successfully fetched ${data.length} records from all sources.`,
      });
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast({
        title: 'Fetch Error',
        description: 'Could not fetch data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleUploadData = async () => {
    if (mergedData.length === 0) {
      toast({
        title: 'No Data',
        description: 'Fetch data first before uploading.',
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
          <Button onClick={handleUploadData} disabled={isUploading || mergedData.length === 0 || isFetching} variant="outline">
            {isUploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            Upload to System
          </Button>
        </div>

        {isFetching && (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2 text-muted-foreground">Fetching data...</p>
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
        {mergedData.length === 0 && !isFetching && (
           <div className="text-center py-10 text-muted-foreground">
             <p>No data fetched yet. Click "Fetch Now" to begin.</p>
           </div>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          {mergedData.length > 0 ? `${mergedData.length} records loaded for preview.` : "Data will appear here after fetching."}
        </p>
      </CardFooter>
    </Card>
  );
}
