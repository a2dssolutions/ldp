
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
  type FetchAllSheetsDataActionResult,
} from '@/lib/services/google-sheet-service';
import {
  saveDemandDataToStore,
  clearAllDemandDataFromStore,
  getDemandDataFromFirestore, // Renamed for clarity
  getHistoricalDemandDataFromFirestore, // Renamed for clarity
  clearAllLocalDemandData as serviceClearAllLocalDemandData,
  // Summary functions are now client-side or called with data, not direct Firestore calls from client
} from '@/lib/services/demand-data-service';
import { getAppSettings as serviceGetAppSettings, saveAppSettings as serviceSaveAppSettings, type AppSettings } from '@/lib/services/config-service';
import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format } from 'date-fns';

// Sheet Ingestion Actions
export async function fetchAllSheetsDataAction(clientsToFetch?: ClientName[]): Promise<FetchAllSheetsDataActionResult> {
  const appSettings = await serviceGetAppSettings();
  return serviceFetchAllSheets(appSettings.sheetUrls, clientsToFetch);
}

export async function saveDemandDataAction(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  return saveDemandDataToStore(data);
}

// Firestore Data Actions (primarily for server-side use or specific direct calls if needed)
export async function getDemandDataAction(
  filters?: {
    client?: ClientName;
    date?: string;
    city?: string;
  },
  options?: { bypassLimits?: boolean }
): Promise<DemandData[]> {
  return getDemandDataFromFirestore(filters, options);
}

export async function getHistoricalDemandDataAction(
  dateRange: { start: string; end: string },
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  return getHistoricalDemandDataFromFirestore(dateRange, filters);
}

// Manual Sync Action (Admin Panel)
export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered to load LIVE data from Google Sheets to Firestore...");
  const appSettings = await serviceGetAppSettings();
  try {
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.error("Failed to clear existing data from Firestore during manual sync:", clearResult.message);
    }
    const { allMergedData: liveData, clientResults } = await fetchAllSheetsDataAction();
    
    const successfulFetches = clientResults.filter(r => r.status === 'success' || r.status === 'empty').length;
    const errorFetches = clientResults.filter(r => r.status === 'error').length;
    let fetchSummary = `Fetched ${liveData.length} total records. ${successfulFetches} sources processed, ${errorFetches} sources failed.`;
    
    clientResults.forEach(res => {
        console.log(`Manual Sync - Client: ${res.client}, Status: ${res.status}, Rows: ${res.rowCount}, Message: ${res.message || ''}`);
    });

    if (!liveData || liveData.length === 0) {
      return { success: errorFetches === 0, message: `${fetchSummary} No new data to save to Firestore.` };
    }
    
    const saveResult = await saveDemandDataToStore(liveData);
    const overallMessage = `${fetchSummary} ${saveResult.message}`;
    // After saving to Firestore, this action does NOT automatically update local IndexedDB for all clients.
    // Clients should use their own "Sync" button on the dashboard for that.
    return { success: saveResult.success, message: overallMessage };
  } catch (error) {
    console.error("Error during manual live data sync to Firestore:", error);
    return { success: false, message: `Manual sync to Firestore failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Configuration Actions
export async function getAppSettingsAction(): Promise<AppSettings> {
  return serviceGetAppSettings();
}

export async function saveAppSettingsAction(settings: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
  return serviceSaveAppSettings(settings);
}

// Action for client to sync its local DB with Firestore for a specific date
export async function syncLocalDemandDataForDateAction(date: string): Promise<{ success: boolean; data: DemandData[], message?: string }> {
  try {
    console.log(`Action: Syncing local data for date ${date} from Firestore.`);
    // Fetch data from Firestore for the given date (no client/city filters for a full day sync)
    const firestoreData = await getDemandDataFromFirestore({ date });
    if (firestoreData.length === 0) {
      console.log(`Action: No data found in Firestore for ${date}. Local DB for this date will be cleared if previously populated.`);
    }
    // The actual saving to Dexie will happen client-side after this action returns the data.
    // This action just provides the data from Firestore.
    return { success: true, data: firestoreData };
  } catch (error) {
    console.error(`Action: Error syncing local data for date ${date}:`, error);
    return { success: false, data: [], message: `Failed to sync data: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Action for client to clear its local IndexedDB
export async function clearAllLocalDemandDataAction(): Promise<{success: boolean, message: string}> {
    // This action primarily serves as a server-side acknowledgement if needed,
    // but the actual clearing happens client-side via the service.
    // For now, it can just return a success message.
    // The service 'serviceClearAllLocalDemandData' is client-side.
    // This action is more of a conceptual trigger if we wanted server logging or coordination.
    // The actual clearing must be done in the client's browser context.
    // So, this server action might not be strictly necessary if the client directly calls the service.
    // However, to keep the pattern of using actions:
    console.log("Action: Request to clear local demand data acknowledged.");
    // The client will call the local service function.
    return { success: true, message: "Local data clear request acknowledged. Client will perform the operation." };
}
