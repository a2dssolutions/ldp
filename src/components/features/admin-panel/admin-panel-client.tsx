
'use client';

import * as React from 'react'; // Ensure React is imported
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  triggerManualSyncAction,
  syncLocalDemandDataForDateAction,
  saveAppSettingsAction,
  testDataSourcesAction,
} from '@/lib/actions';
import {
  getSyncStatus,
  performLocalSyncOperations,
  clearAllLocalDemandData,
  getTotalLocalRecordsCount,
} from '@/lib/services/demand-data-service';
import type { AppSettings } from '@/lib/services/config-service';
import type { LocalSyncMeta, DataSourceTestResult, HealthCheckStatus, ClientName } from '@/lib/types';
import { Loader2, RefreshCw, Database, FileText, CheckCircle, XCircle, Info, Trash2, DownloadCloud, PlusCircle, ListFilter, AlertTriangle, HardDrive, Activity, Map, Pencil, Trash } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { Badge } from '@/components/ui/badge';

interface AdminPanelClientProps {
  initialSettings: AppSettings;
}

interface LastSyncInfo {
  timestamp: Date | null;
  message: string;
  success: boolean;
}

export function AdminPanelClient({ initialSettings }: AdminPanelClientProps) {
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);
  const [lastFirestoreSyncInfo, setLastFirestoreSyncInfo] = useState<LastSyncInfo | null>(null);
  const [isClearingLocal, setIsClearingLocal] = useState(false);
  const [isSyncingTodayToLocal, setIsSyncingTodayToLocal] = useState(false);
  const { toast } = useToast();

  const [currentSettings, setCurrentSettings] = useState<AppSettings>(initialSettings);
  const [newBlacklistedCity, setNewBlacklistedCity] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [newOriginalCityName, setNewOriginalCityName] = useState('');
  const [newMappedCityName, setNewMappedCityName] = useState('');

  const [healthCheckResults, setHealthCheckResults] = useState<DataSourceTestResult | null>(null);
  const [isTestingSources, setIsTestingSources] = useState(false);

  const localSyncMeta = useLiveQuery(
    () => getSyncStatus(),
    [],
    { id: 'lastSyncStatus', timestamp: null } as LocalSyncMeta
  );

  const totalLocalRecords = useLiveQuery(
    () => getTotalLocalRecordsCount(),
    [],
    0
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
    setCurrentSettings(initialSettings);
  }, [initialSettings]);

  const handleManualFirestoreSync = async () => {
    setIsSyncingFirestore(true);
    setLastFirestoreSyncInfo(null);
    try {
      const result = await triggerManualSyncAction();
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
    toast({ title: "Clearing Local Data...", description: "Attempting to remove all cached demand data." });
    try {
      const result = await clearAllLocalDemandData();
      if (result.success) {
        toast({ title: "Local Data Cleared", description: result.message });
      } else {
        toast({ title: "Failed to Clear Local Data", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error clearing local data:", error);
      toast({ title: "Error", description: `Could not clear local data: ${errorMessage}`, variant: "destructive" });
    } finally {
      setIsClearingLocal(false);
    }
  };

  const handleSyncTodayToLocalDB = async () => {
    setIsSyncingTodayToLocal(true);
    const todayDateString = format(new Date(), 'yyyy-MM-dd');
    toast({ title: "Syncing Today's Data to Local Cache...", description: `Fetching latest data for ${todayDateString} from cloud.` });
    try {
      const result = await syncLocalDemandDataForDateAction(todayDateString);
      if (result.success) {
        await performLocalSyncOperations(todayDateString, result.data);
        toast({ title: "Local Sync Successful", description: `${result.data.length} records for ${todayDateString} saved to local cache.` });
      } else {
        toast({ title: "Local Sync Failed", description: result.message || "Could not sync today's data from cloud.", variant: "destructive" });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error("Failed to sync today's data to local DB:", error);
      toast({ title: "Local Sync Error", description: `An unexpected error occurred during local sync: ${errorMessage}`, variant: "destructive" });
    } finally {
      setIsSyncingTodayToLocal(false);
    }
  };

  const handleAddBlacklistedCity = async () => {
    const cityToAdd = newBlacklistedCity.trim();
    if (!cityToAdd) {
      toast({ title: "Cannot add empty city", variant: "destructive" });
      return;
    }
    const currentBlacklist = currentSettings.blacklistedCities || [];
    if (currentBlacklist.map(c => c.toLowerCase()).includes(cityToAdd.toLowerCase())) {
      toast({ title: "City already blacklisted", description: `${cityToAdd} is already in the list.`, variant: "default" });
      setNewBlacklistedCity('');
      return;
    }

    setIsSavingSettings(true);
    const updatedBlacklist = [...currentBlacklist, cityToAdd];
    const result = await saveAppSettingsAction({ ...currentSettings, blacklistedCities: updatedBlacklist });
    if (result.success) {
      setCurrentSettings(prev => ({ ...prev, blacklistedCities: updatedBlacklist }));
      setNewBlacklistedCity('');
      toast({ title: "Blacklist Updated", description: `${cityToAdd} added to blacklist.` });
    } else {
      toast({ title: "Error Updating Blacklist", description: result.message, variant: "destructive" });
    }
    setIsSavingSettings(false);
  };

  const handleRemoveBlacklistedCity = async (cityToRemove: string) => {
    setIsSavingSettings(true);
    const currentBlacklist = currentSettings.blacklistedCities || [];
    const updatedBlacklist = currentBlacklist.filter(city => city !== cityToRemove);
    const result = await saveAppSettingsAction({ ...currentSettings, blacklistedCities: updatedBlacklist });
    if (result.success) {
      setCurrentSettings(prev => ({ ...prev, blacklistedCities: updatedBlacklist }));
      toast({ title: "Blacklist Updated", description: `${cityToRemove} removed from blacklist.` });
    } else {
      toast({ title: "Error Updating Blacklist", description: result.message, variant: "destructive" });
    }
    setIsSavingSettings(false);
  };

  const handleAddCityMapping = async () => {
    const originalName = newOriginalCityName.trim();
    const mappedName = newMappedCityName.trim();

    if (!originalName || !mappedName) {
      toast({ title: "Both city names required", description: "Please enter both original and mapped city names.", variant: "destructive" });
      return;
    }
    if (originalName === mappedName) {
        toast({ title: "No Change", description: "Original and mapped names are the same.", variant: "default" });
        return;
    }

    const currentMappings = currentSettings.cityMappings || {};
    if (currentMappings[originalName] === mappedName) {
      toast({ title: "Mapping already exists", description: `"${originalName}" is already mapped to "${mappedName}".`, variant: "default" });
      setNewOriginalCityName('');
      setNewMappedCityName('');
      return;
    }

    setIsSavingSettings(true);
    const updatedMappings = { ...currentMappings, [originalName]: mappedName };
    const result = await saveAppSettingsAction({ ...currentSettings, cityMappings: updatedMappings });
    if (result.success) {
      setCurrentSettings(prev => ({ ...prev, cityMappings: updatedMappings }));
      setNewOriginalCityName('');
      setNewMappedCityName('');
      toast({ title: "City Mapping Added", description: `Mapped "${originalName}" to "${mappedName}".` });
    } else {
      toast({ title: "Error Adding Mapping", description: result.message, variant: "destructive" });
    }
    setIsSavingSettings(false);
  };

  const handleRemoveCityMapping = async (originalNameToRemove: string) => {
    setIsSavingSettings(true);
    const currentMappings = { ...(currentSettings.cityMappings || {}) };
    delete currentMappings[originalNameToRemove];
    
    const result = await saveAppSettingsAction({ ...currentSettings, cityMappings: currentMappings });
    if (result.success) {
      setCurrentSettings(prev => ({ ...prev, cityMappings: currentMappings }));
      toast({ title: "City Mapping Removed", description: `Mapping for "${originalNameToRemove}" removed.` });
    } else {
      toast({ title: "Error Removing Mapping", description: result.message, variant: "destructive" });
    }
    setIsSavingSettings(false);
  };


  const handleTestSourceConnections = async () => {
    setIsTestingSources(true);
    setHealthCheckResults(null);
    toast({ title: "Testing Data Sources...", description: "Attempting to connect and validate configured Google Sheets." });
    try {
      const results = await testDataSourcesAction();
      setHealthCheckResults(results);
      const failures = results.filter(r => r.status !== 'success').length;
      if (failures > 0) {
        toast({ title: "Source Tests Completed with Issues", description: `${failures} source(s) have issues. See details below.`, variant: 'default' });
      } else {
        toast({ title: "All Data Sources Healthy!", description: "Successfully connected and validated all configured sources." });
      }
    } catch (error) {
      console.error("Error testing data sources:", error);
      toast({ title: "Error During Source Test", description: `An unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`, variant: "destructive" });
      const clientNamesArray = Object.keys(initialSettings.sheetUrls || {}) as ClientName[];
      setHealthCheckResults(clientNamesArray.length > 0 ? clientNamesArray.map(client => ({
        client,
        status: 'url_error' as HealthCheckStatus,
        message: 'Failed to run tests.',
        url: initialSettings.sheetUrls[client]
      })) : []);
    } finally {
      setIsTestingSources(false);
    }
  };
  
  const getStatusIcon = (status: HealthCheckStatus) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'url_error': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'header_mismatch': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'empty_sheet': return <Info className="h-5 w-5 text-blue-500" />;
      case 'not_configured': return <Info className="h-5 w-5 text-gray-400" />;
      case 'parse_error': return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'pending': return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      default: return <Info className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><RefreshCw className="h-5 w-5 text-primary" /> Manual Firestore Sync</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Trigger sync from Google Sheets to Firestore (Cloud Database).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleManualFirestoreSync} disabled={isSyncingFirestore || isSyncingTodayToLocal || isSavingSettings || isTestingSources} className="w-full">
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
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><Database className="h-5 w-5 text-primary" /> Local Cache Management</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Manage the locally cached (IndexedDB) demand data on this browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 border rounded-md bg-muted/50 space-y-1">
            <p className="text-sm font-medium">Local Sync Status</p>
            <p className="text-xs text-muted-foreground">
              Last Synced to Local: {lastLocalSyncDate && isValid(lastLocalSyncDate) ? format(lastLocalSyncDate, "PPP p") : 'Never'}
            </p>
            <p className="text-xs text-muted-foreground">
              Total Records in Local Cache: {totalLocalRecords ?? 'Loading...'}
            </p>
          </div>
          <Button onClick={handleSyncTodayToLocalDB} variant="outline" disabled={isSyncingTodayToLocal || isSyncingFirestore || isSavingSettings || isTestingSources} className="w-full">
            {isSyncingTodayToLocal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DownloadCloud className="mr-2 h-4 w-4" />}
            Sync Today from Cloud to Local
          </Button>
          <Button onClick={handleClearLocalData} variant="destructive" disabled={isClearingLocal || isSyncingTodayToLocal || isSyncingFirestore || isSavingSettings || isTestingSources} className="w-full">
            {isClearingLocal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Clear All Local Data
          </Button>
        </CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">Manages data cached in your browser. Does not affect cloud data.</p></CardFooter>
      </Card>

      <Card className="xl:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><ListFilter className="h-5 w-5 text-primary" /> Manage Blacklisted Cities</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Cities in this list can be optionally hidden in the City Analysis report.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              type="text"
              placeholder="Enter city name"
              value={newBlacklistedCity}
              onChange={(e) => setNewBlacklistedCity(e.target.value)}
              disabled={isSavingSettings || isTestingSources}
              className="h-9"
            />
            <Button onClick={handleAddBlacklistedCity} disabled={isSavingSettings || !newBlacklistedCity.trim() || isTestingSources} size="sm">
              {isSavingSettings && newBlacklistedCity.trim() ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
              Add
            </Button>
          </div>
          {(currentSettings.blacklistedCities?.length || 0) > 0 ? (
            <ScrollArea className="h-40 w-full rounded-md border p-2">
              <ul className="space-y-1">
                {(currentSettings.blacklistedCities || []).map((city) => (
                  <li key={city} className="flex justify-between items-center p-1.5 text-sm bg-muted/30 rounded hover:bg-muted/50">
                    <span>{city}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 p-0"
                      onClick={() => handleRemoveBlacklistedCity(city)}
                      disabled={isSavingSettings}
                      aria-label={`Remove ${city} from blacklist`}
                    >
                      <XCircle className="h-4 w-4 text-destructive hover:text-destructive/80" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">No cities are currently blacklisted.</p>
          )}
        </CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">Blacklist is stored in Firestore and affects all users.</p></CardFooter>
      </Card>
      
      <Card className="lg:col-span-2 xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><Map className="h-5 w-5 text-primary" /> City Name Mappings</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Standardize city names by mapping variations (e.g., "Bangalore" to "Bengaluru"). Applied during data ingestion.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="original-city-name">Original Name (from Sheet)</Label>
              <Input
                id="original-city-name"
                placeholder="e.g., Bangalore"
                value={newOriginalCityName}
                onChange={(e) => setNewOriginalCityName(e.target.value)}
                disabled={isSavingSettings}
                 className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mapped-city-name">Standardized Name (to use)</Label>
              <Input
                id="mapped-city-name"
                placeholder="e.g., Bengaluru"
                value={newMappedCityName}
                onChange={(e) => setNewMappedCityName(e.target.value)}
                disabled={isSavingSettings}
                className="h-9"
              />
            </div>
          </div>
           <Button onClick={handleAddCityMapping} disabled={isSavingSettings || !newOriginalCityName.trim() || !newMappedCityName.trim()} className="w-full sm:w-auto mt-2" size="sm">
            {isSavingSettings && (newOriginalCityName.trim() && newMappedCityName.trim()) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
            Add/Update Mapping
          </Button>

          {(Object.keys(currentSettings.cityMappings || {}).length || 0) > 0 ? (
            <ScrollArea className="h-48 w-full rounded-md border p-2 mt-2">
              <ul className="space-y-2">
                {Object.entries(currentSettings.cityMappings || {}).map(([original, mapped]) => (
                  <li key={original} className="flex justify-between items-center p-2 text-sm bg-muted/30 rounded hover:bg-muted/50">
                    <div>
                      <span className="font-semibold">{original}</span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span>{mapped}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-0"
                      onClick={() => handleRemoveCityMapping(original)}
                      disabled={isSavingSettings}
                      aria-label={`Remove mapping for ${original}`}
                    >
                      <Trash className="h-4 w-4 text-destructive hover:text-destructive/80" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2 mt-2">No city name mappings are currently configured.</p>
          )}
        </CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">City mappings are stored in Firestore and applied during data ingestion.</p></CardFooter>
      </Card>


      <Card className="lg:col-span-1 xl:col-span-1"> 
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><Activity className="h-5 w-5 text-primary" /> Data Source Health Checks</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Test connectivity and header validity for configured Google Sheet sources.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleTestSourceConnections} disabled={isTestingSources || isSyncingFirestore || isSyncingTodayToLocal} className="w-full">
            {isTestingSources ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HardDrive className="mr-2 h-4 w-4" />}
            Test All Data Sources
          </Button>
          {healthCheckResults && (
            <ScrollArea className="mt-4 max-h-60 w-full rounded-md border">
              <div className="p-4 space-y-3">
                {healthCheckResults.map((result) => (
                  <Card key={result.client} className="shadow-none border bg-card">
                    <CardHeader className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(result.status)}
                          <CardTitle className="text-base font-medium">{result.client}</CardTitle>
                        </div>
                        <Badge variant={result.status === 'success' ? 'default' : result.status === 'url_error' || result.status === 'header_mismatch' || result.status === 'parse_error' ? 'destructive' : 'secondary'} className="text-xs">
                          {result.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </CardHeader>
                    {result.message && (
                      <CardContent className="p-3 pt-0 text-xs">
                        <p className="text-muted-foreground">{result.message}</p>
                        {result.status === 'header_mismatch' && (
                          <>
                            <p className="mt-1"><strong>Expected:</strong> <span className="font-mono text-xs">{result.expectedHeaders?.join(', ') || 'N/A'}</span></p>
                            <p><strong>Found:</strong> <span className="font-mono text-xs">{result.foundHeaders?.join(', ') || 'N/A'}</span></p>
                          </>
                        )}
                         {result.url && <p className="mt-1 truncate"><strong>URL:</strong> <a href={result.url} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80">{result.url}</a></p>}
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">Helps diagnose issues with data ingestion from Google Sheets.</p></CardFooter>
      </Card>

      <Card className="lg:col-span-full xl:col-span-1"> {/* Example of making a card span full on lg, then back to 1 on xl */}
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><FileText className="h-5 w-5 text-primary" /> System Logs</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Access system logs for debugging. (Placeholder)</CardDescription>
        </CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Log Level: INFO. Recent Errors: 0.</p><Button variant="outline" className="mt-2 w-full" disabled>Access Logs</Button></CardContent>
        <CardFooter><p className="text-xs text-muted-foreground">View system and error logs (feature placeholder).</p></CardFooter>
      </Card>
    </div>
  );
}
