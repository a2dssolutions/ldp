
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
  type FetchAllSheetsDataActionResult,
} from '@/lib/services/google-sheet-service';
import {
  saveDemandDataToStore,
  clearAllDemandDataFromStore,
  getDemandData as serviceGetDemand,
  getHistoricalDemandData as serviceGetHistorical,
  getCityDemandSummary as serviceGetCityDemand,
  getClientDemandSummary as serviceGetClientDemand,
  getAreaDemandSummary as serviceGetAreaDemand,
  getMultiClientHotspots as serviceGetMultiClientHotspots,
} from '@/lib/services/demand-data-service';
import { getAppSettings as serviceGetAppSettings, saveAppSettings as serviceSaveAppSettings, type AppSettings } from '@/lib/services/config-service';


import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';


export async function fetchAllSheetsDataAction(clientsToFetch?: ClientName[]): Promise<FetchAllSheetsDataActionResult> {
  const appSettings = await serviceGetAppSettings();
  return serviceFetchAllSheets(appSettings.sheetUrls, clientsToFetch);
}

export async function saveDemandDataAction(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  return saveDemandDataToStore(data);
}

export async function getDemandDataAction(filters?: {
  client?: ClientName;
  date?: string;
  city?: string;
}): Promise<DemandData[]> {
  return serviceGetDemand(filters);
}

export async function getHistoricalDemandDataAction(
  dateRange: { start: string; end: string },
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  return serviceGetHistorical(dateRange, filters);
}

export async function getCityDemandSummaryAction(filters?: { client?: ClientName; date?: string; city?: string }): Promise<CityDemand[]> {
  return serviceGetCityDemand(filters);
}

export async function getClientDemandSummaryAction(filters?: { client?: ClientName; date?: string; city?: string }): Promise<ClientDemand[]> {
  return serviceGetClientDemand(filters);
}

export async function getAreaDemandSummaryAction(filters?: { client?: ClientName; date?: string; city?: string }): Promise<AreaDemand[]> {
  return serviceGetAreaDemand(filters);
}

export async function getMultiClientHotspotsAction(filters?: { date?: string }): Promise<MultiClientHotspotCity[]> {
    return serviceGetMultiClientHotspots(2, 5, filters); 
}


export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered to load LIVE data from Google Sheets...");
  const appSettings = await serviceGetAppSettings();

  try {
    // Step 1: Clear existing data from Firestore.
    // Note: This will clear ALL data. If selective client sync is intended to only *update* 
    // those clients without affecting others, this clearing step might need to be more nuanced
    // or skipped if the save operation correctly overwrites.
    // For now, a full clear followed by a save of (potentially all) clients is the flow.
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      // Decide if we should stop if clearing fails. For now, we'll log and continue.
      console.error("Failed to clear existing data from Firestore during manual sync:", clearResult.message);
    } else {
      console.log("Successfully cleared existing data from Firestore.");
    }

    // Step 2: Fetch live data from Google Sheets (for ALL clients, as per current manual sync design)
    console.log("Fetching live data from all configured Google Sheets...");
    const { allMergedData: liveData, clientResults } = await serviceFetchAllSheets(appSettings.sheetUrls); // Fetch all for manual sync
    
    const successfulFetches = clientResults.filter(r => r.status === 'success' || r.status === 'empty').length;
    const errorFetches = clientResults.filter(r => r.status === 'error').length;
    let fetchSummary = `Fetched ${liveData.length} total records. ${successfulFetches} sources processed, ${errorFetches} sources failed.`;
    
    clientResults.forEach(res => {
        console.log(`Manual Sync - Client: ${res.client}, Status: ${res.status}, Rows: ${res.rowCount}, Message: ${res.message || ''}`);
    });

    if (liveData.length === 0 && errorFetches === 0) {
      fetchSummary += " No data was found in any successfully processed source.";
      console.warn("Manual Sync:", fetchSummary);
    } else if (liveData.length === 0 && errorFetches > 0) {
      fetchSummary += " No data was retrieved due to errors or empty sources.";
      console.error("Manual Sync:", fetchSummary);
    } else {
      console.log("Manual Sync:", fetchSummary);
    }

    // If no data fetched at all, report based on errors.
    if (!liveData || liveData.length === 0) {
      return { success: errorFetches === 0, message: fetchSummary };
    }
    
    // Step 3: Save fetched live data to Firestore
    console.log("Saving fetched live data to Firestore...");
    const saveResult = await saveDemandDataToStore(liveData);
    if (saveResult.success) {
      return { success: true, message: `${fetchSummary} ${saveResult.message}` };
    } else {
      return { success: false, message: `${fetchSummary} Failed to save live data to Firestore: ${saveResult.message}` };
    }
  } catch (error) {
    console.error("Error during manual live data sync:", error);
    return { success: false, message: `Manual sync with live data failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Configuration Actions
export async function getAppSettingsAction(): Promise<AppSettings> {
  return serviceGetAppSettings();
}

export async function saveAppSettingsAction(settings: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
  return serviceSaveAppSettings(settings);
}

    