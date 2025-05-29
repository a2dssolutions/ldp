
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { triggerManualSyncAction, clearAllLocalDemandDataAction } from '@/lib/actions'; // Added clearAllLocalDemandDataAction
import { clearAllLocalDemandData, getSyncStatus } from '@/lib/services/demand-data-service'; // Import local service
import type { LocalSyncMeta } from '@/lib/types';
import { Loader2, RefreshCw, Database, FileText, CheckCircle, XCircle, Info, Trash2, History } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';


interface LastSyncInfo {
  timestamp: Date | null;
  message: string;
  success: boolean;
}

export function AdminPanelClient() {
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [lastFirestoreSyncInfo, setLastFirestoreSyncInfo] = useState<LastSyncInfo | null>(null);
  const [isClearingLocal, setIsClearingLocal] = useState(false);
  const { toast } = useToast();

  // Live query for local sync status
  const localSyncMeta = useLiveQuery(
    () => getSyncStatus(),
    [],
    { id: 'lastSyncStatus', timestamp: null } as LocalSyncMeta
  );
  
  const lastLocalSyncDate = useMemo(() => {
    return localSyncMeta?.timestamp ? new Date(localSyncMeta.timestamp) : null;
  }, [localSyncMeta]);


  useEffect(() => {
    const storedSyncInfo = localStorage.getItem('lastAdminFirestoreSyncInfo');
    if (storedSyncInfo) {
      const parsedInfo = JSON.parse(storedSyncInfo);
      if (parsedInfo.timestamp) parsedInfo.timestamp = new Date(parsedInfo.timestamp);
      setLastFirestoreSyncInfo(parsedInfo);
    }
  }, []);

  const handleManualFirestoreSync = async () => {
    setIsSyncingFirestore(true);
    setLastFirestoreSyncInfo(null); 
    try {
      const result = await triggerManualSyncAction(); // This syncs Sheets to Firestore
      const currentSyncInfo = {
        timestamp: new Date(),
        message: result.message,
        success: result.success,
      };
      setLastFirestoreSyncInfo(currentSyncInfo);
      localStorage.setItem('lastAdminFirestoreSyncInfo', JSON.stringify(currentSyncInfo));

      if (result.success) {
        toast({ title: 'Firestore Sync Successful', description: result.message });
      } else {
        toast({ title: 'Firestore Sync Partially Successful or Failed', description: result.message, variant: 'default' });
      }
    } catch (error) {
      console.error('Manual Firestore sync error:', error);
      const errorSyncInfo = {
        timestamp: new Date(),
        message: 'An unexpected error occurred during Firestore sync.',
        success: false,
      };
      setLastFirestoreSyncInfo(errorSyncInfo);
      localStorage.setItem('lastAdminFirestoreSyncInfo', JSON.stringify(errorSyncInfo));
      toast({ title: 'Firestore Sync Error', description: errorSyncInfo.message, variant: 'destructive' });
    } finally {
      setIsSyncingFirestore(false);
    }
  };

  const handleClearLocalData = async () => {
    setIsClearingLocal(true);
    toast({title: "Clearing Local Data...", description: "Attempting to remove all cached demand data."});
    try {
      // Call the service function directly, as it operates on the client's IndexedDB
      const result = await clearAllLocalDemandData(); 
      if (result.success) {
        toast({ title: "Local Data Cleared", description: result.message });
      } else {
        toast({ title: "Failed to Clear Local Data", description: result.message, variant: "destructive" });
      }
      // The useLiveQuery for localSyncMeta should update automatically.
    } catch (error) {
      console.error("Error clearing local data:", error);
      toast({ title: "Error", description: "Could not clear local data.", variant: "destructive"});
    } finally {
      setIsClearingLocal(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" /> Manual Firestore Sync</CardTitle>
          <CardDescription>Trigger sync from Google Sheets to Firestore (Cloud Database).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleManualFirestoreSync} disabled={isSyncingFirestore} className="w-full">
            {isSyncingFirestore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sync Sheets to Firestore
          </Button>
          {lastFirestoreSyncInfo && (
            <div className="mt-4 p-3 border rounded-md bg-muted/50 space-y-2">
              <div className="flex items-center gap-2">
                {lastFirestoreSyncInfo.success ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <p className={`text-sm font-semibold ${lastFirestoreSyncInfo.success ? 'text-green-600' : 'text-red-600'}`}>
                  Last Firestore Sync: {lastFirestoreSyncInfo.success ? 'Successful' : 'Failed/Partial'}
                </p>
              </div>
              {lastFirestoreSyncInfo.timestamp && isValid(lastFirestoreSyncInfo.timestamp) && (
                <p className="text-xs text-muted-foreground">Timestamp: {format(lastFirestoreSyncInfo.timestamp, "PPP p")}</p>
              )}
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">Details: {lastFirestoreSyncInfo.message}</p>
            </div>
          )}
        </CardContent>
         <CardFooter><p className="text-xs text-muted-foreground">This operation re-imports from sheets to the main cloud database.</p></CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5 text-primary" /> Local Cache Management</CardTitle>
          <CardDescription>Manage the locally cached (IndexedDB) demand data on this browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="p-3 border rounded-md bg-muted/50 space-y-1">
             <p className="text-sm font-medium">Local Sync Status</p>
             <p className="text-xs text-muted-foreground">
                Last Synced to Local: {lastLocalSyncDate && isValid(lastLocalSyncDate) ? format(lastLocalSyncDate, "PPP p") : 'Never'}
             </p>
           </div>
          <Button onClick={handleClearLocalData} variant="outline" disabled={isClearingLocal} className="w-full">
            {isClearingLocal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Clear All Local Data
          </Button>
        </CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">Clears data cached in your browser. Does not affect cloud data.</p></CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> System Logs</CardTitle>
          <CardDescription>Access system logs for debugging. (Placeholder)</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Log Level: INFO. Recent Errors: 0.</p><Button variant="outline" className="mt-2 w-full" disabled>Access Logs</Button></CardContent>
      </Card>
    </div>
  );
}
