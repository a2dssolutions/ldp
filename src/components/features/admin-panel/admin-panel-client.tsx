'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { triggerManualSyncAction } from '@/lib/actions';
import { Loader2, RefreshCw, Database, FileText } from 'lucide-react';

export function AdminPanelClient() {
  const [isSyncing, setIsSyncing] = useState(false);
  const { toast } = useToast();

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const result = await triggerManualSyncAction();
      if (result.success) {
        toast({ title: 'Manual Sync Successful', description: result.message });
      } else {
        toast({ title: 'Manual Sync Failed', description: result.message, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Manual sync error:', error);
      toast({ title: 'Sync Error', description: 'An unexpected error occurred during manual sync.', variant: 'destructive' });
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
        <CardContent>
          <Button onClick={handleManualSync} disabled={isSyncing} className="w-full">
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Start Manual Sync
          </Button>
        </CardContent>
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
