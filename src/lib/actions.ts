
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
import { suggestAreasForJobPosting, type SuggestAreasForJobPostingInput } from '@/ai/flows/suggest-areas-for-job-posting';
import { forecastDemand, type ForecastDemandInput, type ForecastDemandOutput } from '@/ai/flows/forecast-demand-flow';
import { getAppSettings as serviceGetAppSettings, saveAppSettings as serviceSaveAppSettings, type AppSettings } from '@/lib/services/config-service';


import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';


export async function fetchAllSheetsDataAction(): Promise<FetchAllSheetsDataActionResult> {
  const appSettings = await serviceGetAppSettings();
  // Pass appSettings.sheetUrls to serviceFetchAllSheets if it needs dynamic URLs
  // For now, assuming serviceFetchAllSheets reads its own config or uses a fixed one
  return serviceFetchAllSheets(appSettings.sheetUrls);
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

export async function getAiAreaSuggestionsAction(input: SuggestAreasForJobPostingInput): Promise<string[]> {
  try {
    const result = await suggestAreasForJobPosting(input);
    return result.areas;
  } catch (error) {
    console.error("Error fetching AI suggestions:", error);
    return [`Error: Could not generate suggestions for ${input.city}. Please try again later.`];
  }
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
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.error("Failed to clear existing data from Firestore:", clearResult.message);
    } else {
      console.log(clearResult.message);
    }

    console.log("Fetching live data from Google Sheets using configured URLs...");
    const { allMergedData: liveData, clientResults } = await serviceFetchAllSheets(appSettings.sheetUrls);
    
    const successfulFetches = clientResults.filter(r => r.status === 'success' || r.status === 'empty').length;
    const errorFetches = clientResults.filter(r => r.status === 'error').length;
    let fetchSummary = `Fetched ${liveData.length} total records. ${successfulFetches} sources processed, ${errorFetches} sources failed.`;
    
    clientResults.forEach(res => {
        console.log(`Client: ${res.client}, Status: ${res.status}, Rows: ${res.rowCount}, Message: ${res.message || ''}`);
    });

    if (liveData.length === 0 && errorFetches === 0) {
      fetchSummary += " No data was found in any successfully processed source.";
      console.warn(fetchSummary);
    } else if (liveData.length === 0 && errorFetches > 0) {
      fetchSummary += " No data was retrieved due to errors in all sources or empty sources.";
      console.error(fetchSummary);
    } else {
      console.log(fetchSummary);
    }

    if (!liveData || liveData.length === 0) {
      return { success: errorFetches === 0, message: fetchSummary };
    }
    
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

export async function getDemandForecastAction(input: ForecastDemandInput): Promise<ForecastDemandOutput> {
  try {
    const result = await forecastDemand(input);
    return result;
  } catch (error) {
    console.error("Error fetching AI forecast:", error);
    return {
      forecastPeriod: "N/A",
      predictedDemandTrend: "Error",
      narrative: `Could not generate forecast: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// Configuration Actions
export async function getAppSettingsAction(): Promise<AppSettings> {
  return serviceGetAppSettings();
}

export async function saveAppSettingsAction(settings: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
  return serviceSaveAppSettings(settings);
}

