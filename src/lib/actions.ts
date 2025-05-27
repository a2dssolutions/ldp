
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
  getClientDemandSummary as serviceGetClientDemand
} from '@/lib/services/demand-data-service';
import { suggestAreasForJobPosting, type SuggestAreasForJobPostingInput } from '@/ai/flows/suggest-areas-for-job-posting';
import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand } from '@/lib/types';

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
    return [`Error fetching suggestions for ${input.city}`];
  }
}

export async function getCityDemandSummaryAction(): Promise<CityDemand[]> {
  return serviceGetCityDemand();
}

export async function getClientDemandSummaryAction(): Promise<ClientDemand[]> {
  return serviceGetClientDemand();
}

export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered to load LIVE data from Google Sheets...");

  try {
    // Clear existing data from Firestore
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.error("Failed to clear existing data from Firestore:", clearResult.message);
      // Optionally, you might want to return or handle this error more gracefully
      // For now, we'll log and proceed with fetching and saving new data
    } else {
      console.log(clearResult.message);
    }

    // Fetch live data from Google Sheets
    console.log("Fetching live data from Google Sheets...");
    const liveData = await serviceFetchAllSheets();
    if (!liveData || liveData.length === 0) {
      console.warn("No data fetched from Google Sheets. Firestore will remain empty or as it was if clearing failed.");
      return { success: true, message: "No data fetched from Google Sheets. System may be empty." };
    }
    console.log(`Fetched ${liveData.length} records from Google Sheets.`);

    // Save fetched live data to Firestore
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
