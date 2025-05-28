
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { triggerManualSyncAction } from '@/lib/actions';
import { Loader2, RefreshCw, Database, FileText, CheckCircle, XCircle, Info } from 'lucide-react';
import { format } from 'date-fns';

interface LastSyncInfo {
  timestamp: Date | null;
  message: string;
  success: boolean;
}

export function AdminPanelClient() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncInfo, setLastSyncInfo] = useState<LastSyncInfo | null>(null);
  const { toast } = useToast();

  // Effect to load last sync info from localStorage if needed (optional persistence)
  useEffect(() => {
    const storedSyncInfo = localStorage.getItem('lastAdminSyncInfo');
    if (storedSyncInfo) {
      const parsedInfo = JSON.parse(storedSyncInfo);
      // Ensure timestamp is converted back to Date object
      if (parsedInfo.timestamp) {
        parsedInfo.timestamp = new Date(parsedInfo.timestamp);
      }
      setLastSyncInfo(parsedInfo);
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setLastSyncInfo(null); // Clear previous sync info
    try {
      const result = await triggerManualSyncAction();
      const currentSyncInfo = {
        timestamp: new Date(),
        message: result.message,
        success: result.success,
      };
      setLastSyncInfo(currentSyncInfo);
      localStorage.setItem('lastAdminSyncInfo', JSON.stringify(currentSyncInfo)); // Optional: persist

      if (result.success) {
        toast({ title: 'Manual Sync Successful', description: result.message });
      } else {
        toast({ title: 'Manual Sync Partially Successful or Failed', description: result.message, variant: 'default' });
      }
    } catch (error) {
      console.error('Manual sync error:', error);
      const errorSyncInfo = {
        timestamp: new Date(),
        message: 'An unexpected error occurred during manual sync.',
        success: false,
      };
      setLastSyncInfo(errorSyncInfo);
      localStorage.setItem('lastAdminSyncInfo', JSON.stringify(errorSyncInfo)); // Optional: persist
      toast({ title: 'Sync Error', description: errorSyncInfo.message, variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Manual Data Sync
          </CardTitle>
          <CardDescription>
            Trigger a manual fetch and process of data from all Google Sheet sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleManualSync} disabled={isSyncing} className="w-full">
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Start Manual Sync
          </Button>
          {lastSyncInfo && (
            <div className="mt-4 p-3 border rounded-md bg-muted/50 space-y-2">
              <div className="flex items-center gap-2">
                {lastSyncInfo.success ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <p className={`text-sm font-semibold ${lastSyncInfo.success ? 'text-green-600' : 'text-red-600'}`}>
                  Last Sync: {lastSyncInfo.success ? 'Successful' : 'Failed/Partial'}
                </p>
              </div>
              {lastSyncInfo.timestamp && (
                <p className="text-xs text-muted-foreground">
                  Timestamp: {format(lastSyncInfo.timestamp, "PPP p")}
                </p>
              )}
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">Details: {lastSyncInfo.message}</p>
            </div>
          )}
          {!lastSyncInfo && !isSyncing && (
             <div className="mt-4 p-3 border rounded-md bg-muted/50 flex items-center gap-2">
                <Info className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No sync performed yet in this session.</p>
            </div>
          )}
        </CardContent>
         <CardFooter>
            <p className="text-xs text-muted-foreground">
                This operation clears existing data and re-imports from sheets.
            </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Firestore Status
          </CardTitle>
          <CardDescription>
            View the current status and health of the Firestore database. (Placeholder)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Status: <span className="text-green-600 font-semibold">Nominal</span></p>
          <p className="text-sm text-muted-foreground">Last Backup: Today, 3:00 AM</p>
          <Button variant="outline" className="mt-2 w-full" disabled>View Detailed Status</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            System Logs
          </CardTitle>
          <CardDescription>
            Access and view system logs for debugging and monitoring. (Placeholder)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Log Level: INFO</p>
          <p className="text-sm text-muted-foreground">Recent Errors: 0</p>
          <Button variant="outline" className="mt-2 w-full" disabled>Access Logs</Button>
        </CardContent>
      </Card>
    </div>
  );
}
