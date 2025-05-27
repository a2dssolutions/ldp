
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
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

import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';

export async function fetchAllSheetsDataAction(): Promise<MergedSheetData[]> {
  return serviceFetchAllSheets();
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
    // Provide a more user-friendly error message or specific fallback
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
    return serviceGetMultiClientHotspots(2, 5, filters); // Default: min 2 clients, min 5 demand each
}


export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered to load LIVE data from Google Sheets...");

  try {
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.error("Failed to clear existing data from Firestore:", clearResult.message);
    } else {
      console.log(clearResult.message);
    }

    console.log("Fetching live data from Google Sheets...");
    const liveData = await serviceFetchAllSheets();
    if (!liveData || liveData.length === 0) {
      console.warn("No data fetched from Google Sheets. Firestore will remain empty or as it was if clearing failed.");
      return { success: true, message: "No data fetched from Google Sheets. System may be empty." };
    }
    console.log(`Fetched ${liveData.length} records from Google Sheets.`);

    console.log("Saving fetched live data to Firestore...");
    const saveResult = await saveDemandDataToStore(liveData);
    if (saveResult.success) {
      return { success: true, message: `Successfully fetched ${liveData.length} records from Google Sheets and saved to Firestore.` };
    } else {
      return { success: false, message: `Failed to save live data to Firestore: ${saveResult.message}` };
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
