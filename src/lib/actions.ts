
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
  calculateCityDemandSummary as serviceGetCityDemandSummary,
  calculateClientDemandSummary as serviceGetClientDemandSummary,
  calculateAreaDemandSummary as serviceGetAreaDemandSummary,
  calculateMultiClientHotspots as serviceGetMultiClientHotspots,
  performLocalSyncOperations as servicePerformLocalSyncOperations,
  saveBatchDataToLocalDB as serviceSaveBatchDataToLocalDB,
  clearDemandDataForDateFromLocalDB as serviceClearDemandDataForDateFromLocalDB,
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

    const { allMergedData: liveData, clientResults } = await fetchAllSheetsDataAction(); // Uses configured sheet URLs

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

// Summary actions for server-side dashboard data fetching
export async function getCityDemandSummaryAction(data: DemandData[]): Promise<CityDemand[]> {
  return serviceGetCityDemandSummary(data);
}

export async function getClientDemandSummaryAction(data: DemandData[]): Promise<ClientDemand[]> {
  return serviceGetClientDemandSummary(data);
}

export async function getAreaDemandSummaryAction(data: DemandData[]): Promise<AreaDemand[]> {
  return serviceGetAreaDemandSummary(data);
}

export async function getMultiClientHotspotsAction(data: DemandData[], minClients?: number, minDemandPerClient?: number): Promise<MultiClientHotspotCity[]> {
  return serviceGetMultiClientHotspots(data, minClients, minDemandPerClient);
}

export async function getCityClientMatrixAction(date: string): Promise<CityClientMatrixRow[]> {
  try {
    const allDemandDataForDate = await getDemandDataAction({ date }, { bypassLimits: true });

    if (!Array.isArray(allDemandDataForDate)) {
      console.error("getCityClientMatrixAction: Fetched data (allDemandDataForDate) is not an array.");
      return []; // Return empty array if data is malformed
    }

    const citiesData: Record<string, {
      blinkit: boolean;
      zepto: boolean;
      swiggyFood: boolean;
      swiggyIM: boolean;
      areas: Record<string, number>; // areaName: totalDemand
    }> = {};

    for (const record of allDemandDataForDate) {
      // Defensive checks for each record
      if (
        !record ||
        typeof record.city !== 'string' || record.city.trim() === '' ||
        typeof record.area !== 'string' || record.area.trim() === '' ||
        typeof record.client !== 'string' ||
        typeof record.demandScore !== 'number' || isNaN(record.demandScore)
      ) {
        console.warn('getCityClientMatrixAction: Skipping malformed or incomplete record:', JSON.stringify(record).substring(0, 200));
        continue;
      }

      const cityKey = record.city;
      const areaKey = record.area;

      if (!citiesData[cityKey]) {
        citiesData[cityKey] = {
          blinkit: false,
          zepto: false,
          swiggyFood: false,
          swiggyIM: false,
          areas: {},
        };
      }

      const cityEntry = citiesData[cityKey];

      if (record.client === 'Blinkit') cityEntry.blinkit = true;
      else if (record.client === 'Zepto') cityEntry.zepto = true;
      else if (record.client === 'SwiggyFood') cityEntry.swiggyFood = true;
      else if (record.client === 'SwiggyIM') cityEntry.swiggyIM = true;
      // else, client is not one of the tracked ones for this matrix, but area demand still counts

      cityEntry.areas[areaKey] = (cityEntry.areas[areaKey] || 0) + record.demandScore;
    }

    const resultMatrix: CityClientMatrixRow[] = [];
    for (const cityName in citiesData) {
      const cityInfo = citiesData[cityName]; // cityInfo is an object by design here

      // cityInfo.areas is also guaranteed to be an object (Record<string, number>)
      const sortedAreas = Object.entries(cityInfo.areas)
        .map(([areaName, totalDemand]) => {
            // Ensure areaName is a string and totalDemand is a number before creating the object
            if (typeof areaName === 'string' && typeof totalDemand === 'number' && !isNaN(totalDemand)) {
                return { areaName, totalDemand };
            }
            console.warn(`getCityClientMatrixAction: Malformed area entry for city ${cityName}: [${areaName}, ${totalDemand}]`);
            return null; 
        })
        .filter(item => item !== null) as { areaName: string; totalDemand: number }[]; // Filter out nulls and assert type
      
      sortedAreas.sort((a, b) => b.totalDemand - a.totalDemand);

      const top3AreasString = sortedAreas.slice(0, 3)
        .map(a => `${a.areaName} (${a.totalDemand})`)
        .join(', ') || 'N/A';

      resultMatrix.push({
        city: cityName,
        blinkit: cityInfo.blinkit,
        zepto: cityInfo.zepto,
        swiggyFood: cityInfo.swiggyFood,
        swiggyIM: cityInfo.swiggyIM,
        highDemandAreas: top3AreasString,
      });
    }
    
    return resultMatrix.sort((a,b) => a.city.localeCompare(b.city));
  } catch (error) {
    console.error("Error in getCityClientMatrixAction:", error);
    // Instead of re-throwing, return empty array to prevent client error if action fails catastrophically
    // Client-side should handle empty array gracefully (e.g. "no data" message)
    return []; 
  }
}
