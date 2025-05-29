
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
  type ClientFetchResult,
} from '@/lib/services/google-sheet-service';
import {
  saveDemandDataToStore,
  clearAllDemandDataFromStore,
  getDemandDataFromFirestore,
  getHistoricalDemandDataFromFirestore,
  calculateCityDemandSummary as serviceGetCityDemandSummary, // Corrected if this was also an issue, but error was for AreaDemand
  calculateClientDemandSummary as serviceGetClientDemandSummary, // Corrected if this was also an issue
  calculateAreaDemandSummary as serviceGetAreaDemandSummary, // Corrected import
  calculateMultiClientHotspots as serviceGetMultiClientHotspots, // Corrected if this was also an issue
  performLocalSyncOperations, // Ensure this is exported if used by client actions
  saveBatchDataToLocalDB, // Ensure this is exported if used by client actions
} from '@/lib/services/demand-data-service';
import { getAppSettings as serviceGetAppSettings, saveAppSettings as serviceSaveAppSettings, type AppSettings } from '@/lib/services/config-service';
import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity, CityClientMatrixRow } from '@/lib/types';
import { format } from 'date-fns';

// Sheet Ingestion Actions
export async function fetchAllSheetsDataAction(clientsToFetch?: ClientName[]): Promise<{
    allMergedData: MergedSheetData[];
    clientResults: ClientFetchResult[];
}> {
  const appSettings = await serviceGetAppSettings();
  const result = await serviceFetchAllSheets(appSettings.sheetUrls, clientsToFetch);
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
  const appSettings = await serviceGetAppSettings();
  try {
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.warn("Failed to clear existing data from Firestore during manual sync:", clearResult.message);
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
    // The actual clearing is done client-side, this action is more of a conceptual trigger if needed.
    return { success: true, message: "Local data clear request acknowledged. Client will perform the operation." };
}

// Summary actions for server-side dashboard data fetching (if needed, mostly client-side now)
export async function getCityDemandSummaryAction(date: string, client?: ClientName): Promise<CityDemand[]> {
  const demandData = await getDemandDataFromFirestore({ date, client }, { bypassLimits: true });
  return serviceGetCityDemandSummary(demandData);
}

export async function getClientDemandSummaryAction(date: string): Promise<ClientDemand[]> {
  const demandData = await getDemandDataFromFirestore({ date }, { bypassLimits: true });
  return serviceGetClientDemandSummary(demandData);
}

export async function getAreaDemandSummaryAction(date: string, client?: ClientName, city?: string): Promise<AreaDemand[]> {
  const demandData = await getDemandDataFromFirestore({ date, client, city }, { bypassLimits: true });
  return serviceGetAreaDemandSummary(demandData);
}

export async function getMultiClientHotspotsAction(date: string, minClients?: number, minDemandPerClient?: number): Promise<MultiClientHotspotCity[]> {
  const demandData = await getDemandDataFromFirestore({ date }, { bypassLimits: true });
  return serviceGetMultiClientHotspots(demandData, minClients, minDemandPerClient);
}

export async function getCityClientMatrixAction(date: string): Promise<CityClientMatrixRow[]> {
  try {
    const allDemandDataForDate = await getDemandDataAction({ date }, { bypassLimits: true });

    if (!allDemandDataForDate || allDemandDataForDate.length === 0) {
      return [];
    }

    const citiesData: Record<string, {
      blinkit: boolean;
      zepto: boolean;
      swiggyFood: boolean;
      swiggyIM: boolean;
      areas: Record<string, number>; // areaName: totalDemand
    }> = {};

    for (const record of allDemandDataForDate) {
      if (!citiesData[record.city]) {
        citiesData[record.city] = {
          blinkit: false,
          zepto: false,
          swiggyFood: false,
          swiggyIM: false,
          areas: {},
        };
      }

      const cityEntry = citiesData[record.city];

      if (record.client === 'Blinkit') cityEntry.blinkit = true;
      if (record.client === 'Zepto') cityEntry.zepto = true;
      if (record.client === 'SwiggyFood') cityEntry.swiggyFood = true;
      if (record.client === 'SwiggyIM') cityEntry.swiggyIM = true;

      cityEntry.areas[record.area] = (cityEntry.areas[record.area] || 0) + record.demandScore;
    }

    const result: CityClientMatrixRow[] = [];
    for (const cityName in citiesData) {
      const data = citiesData[cityName];
      const sortedAreas = Object.entries(data.areas)
        .map(([areaName, totalDemand]) => ({ areaName, totalDemand }))
        .sort((a, b) => b.totalDemand - a.totalDemand);

      const top3Areas = sortedAreas.slice(0, 3)
        .map(a => `${a.areaName} (${a.totalDemand})`)
        .join(', ');

      result.push({
        city: cityName,
        blinkit: data.blinkit,
        zepto: data.zepto,
        swiggyFood: data.swiggyFood,
        swiggyIM: data.swiggyIM,
        highDemandAreas: top3Areas || 'N/A',
      });
    }

    return result.sort((a,b) => a.city.localeCompare(b.city)); // Sort by city name
  } catch (error) {
    console.error("Error in getCityClientMatrixAction:", error);
    throw new Error(`Failed to generate city client matrix: ${error instanceof Error ? error.message : String(error)}`);
  }
}
