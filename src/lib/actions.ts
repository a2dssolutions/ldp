
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
  type ClientFetchResult,
  testAllDataSourcesService,
} from '@/lib/services/google-sheet-service';
import {
  saveDemandDataToStore,
  clearAllDemandDataFromStore,
  getDemandDataFromFirestore,
  getHistoricalDemandDataFromFirestore,
  calculateCityDemandSummary as serviceCalculateCityDemandSummary, // Renamed to avoid conflict
  calculateClientDemandSummary as serviceCalculateClientDemandSummary, // Renamed
  calculateAreaDemandSummary as serviceCalculateAreaDemandSummary, // Renamed
  calculateMultiClientHotspots as serviceCalculateMultiClientHotspots, // Renamed
} from '@/lib/services/demand-data-service';
import { getAppSettings as serviceGetAppSettings, saveAppSettings as serviceSaveAppSettings, type AppSettings } from '@/lib/services/config-service';
import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity, DataSourceTestResult } from '@/lib/types';
import { format } from 'date-fns';

// Sheet Ingestion Actions
export async function fetchAllSheetsDataAction(clientsToFetch?: ClientName[]): Promise<{
    allMergedData: MergedSheetData[];
    clientResults: ClientFetchResult[];
}> {
  const appSettings = await serviceGetAppSettings();
  // Pass cityMappings from appSettings to the service layer
  const result = await serviceFetchAllSheets(appSettings.sheetUrls, clientsToFetch, appSettings.cityMappings);
  return { allMergedData: result.allMergedData, clientResults: result.clientResults};
}

export async function saveDemandDataAction(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  return saveDemandDataToStore(data);
}

// Firestore Data Actions
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

// Manual Sync Action (Admin Panel) - Sheets to Firestore
export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered to load LIVE data from Google Sheets to Firestore...");
  const appSettings = await serviceGetAppSettings(); // Fetch app settings to get cityMappings
  try {
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.warn("Failed to clear existing data from Firestore during manual sync:", clearResult.message);
    }

    // Pass cityMappings to fetchAllSheetsDataAction
    const { allMergedData: liveData, clientResults } = await fetchAllSheetsDataAction(undefined); // undefined fetches all clients as per its internal logic

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
    return { success: saveResult.success && errorFetches === 0, message: overallMessage };
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
    const firestoreData = await getDemandDataFromFirestore({ date }, { bypassLimits: true }); 
    if (firestoreData.length === 0) {
      console.log(`Action: No data found in Firestore for ${date}. Local DB for this date will be cleared if previously populated.`);
    }
    return { success: true, data: firestoreData };
  } catch (error) {
    console.error(`Action: Error syncing local data for date ${date}:`, error);
    return { success: false, data: [], message: `Failed to sync data: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function clearAllLocalDemandDataAction(): Promise<{success: boolean, message: string}> {
    console.log("Action: Request to clear local demand data acknowledged.");
    return { success: true, message: "Local data clear request acknowledged. Client will perform the operation." };
}

// Summary actions now correctly point to serviceCalculate...
export async function getCityDemandSummaryAction(data: DemandData[]): Promise<CityDemand[]> {
  return serviceCalculateCityDemandSummary(data);
}

export async function getClientDemandSummaryAction(data: DemandData[]): Promise<ClientDemand[]> {
  return serviceCalculateClientDemandSummary(data);
}

export async function getAreaDemandSummaryAction(data: DemandData[]): Promise<AreaDemand[]> {
  return serviceCalculateAreaDemandSummary(data);
}

export async function getMultiClientHotspotsAction(data: DemandData[], minClients?: number, minDemandPerClient?: number): Promise<MultiClientHotspotCity[]> {
  // For multi-client hotspot analysis, we ideally need a complete view of the day's data.
  // This implies fetching with bypassLimits if this action were to fetch its own data.
  // However, currently, this action receives data as a parameter, often from the dashboard which might have already applied limits.
  // If this action were to be used independently for a definitive hotspot report, it would need to fetch data with bypassLimits.
  return serviceCalculateMultiClientHotspots(data, minClients, minDemandPerClient);
}

// Data Source Health Check Action
export async function testDataSourcesAction(): Promise<DataSourceTestResult> {
  console.log("Action: Testing all data sources...");
  try {
    const appSettings = await serviceGetAppSettings();
    const results = await testAllDataSourcesService(appSettings.sheetUrls);
    console.log("Action: Data source tests completed.", results);
    return results;
  } catch (error) {
    console.error("Action: Error testing data sources:", error);
    const clientNames: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM']; 
    return clientNames.map(client => ({
      client,
      status: 'url_error', 
      message: `Failed to execute tests: ${error instanceof Error ? error.message : String(error)}`,
    }));
  }
}

// Note: getCityClientMatrixAction was removed as part of "Posting Suggestions" feature removal,
// then re-introduced for a different "City Analysis" feature. If this feature is still desired
// and its logic needs adjustment based on client-side data, it would remain in CityAnalysisClient.tsx.
// If it were to be a server action again, it would need to fetch appSettings for cityMappings.
// For now, assuming City Analysis logic is client-side, this action might not be needed here.
// If it is needed as a server action, ensure it fetches and applies cityMappings.
/*
export async function getCityClientMatrixAction(date: string): Promise<CityClientMatrixRow[]> {
  // ... (Existing logic, ensure it fetches appSettings for cityMappings if used)
}
*/
