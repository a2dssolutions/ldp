'use server';

import { 
  fetchAllSheetsData as serviceFetchAllSheets, 
  saveProcessedDemandData as serviceSaveProcessedData 
} from '@/lib/services/google-sheet-service';
import { 
  saveDemandDataToStore, 
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
  // In a real app, this might first call serviceSaveProcessedData if there's a distinction,
  // then saveDemandDataToStore for the analytical store.
  // For this mock, we'll just use saveDemandDataToStore as it uses DemandData type internally.
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
    // Fallback to basic suggestions or return an error message / empty array
    // For now, returning placeholder from AI flow which is static.
    // If AI flow itself fails, this will be caught.
    return ["AI Suggestion Error - Area X", "AI Suggestion Error - Area Y"]; 
  }
}

export async function getCityDemandSummaryAction(): Promise<CityDemand[]> {
  return serviceGetCityDemand();
}

export async function getClientDemandSummaryAction(): Promise<ClientDemand[]> {
  return serviceGetClientDemand();
}

export async function triggerManualSyncAction(): Promise<{ success: boolean; message: string }> {
  console.log("Manual sync triggered action...");
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate sync process
  // Potentially call fetchAllSheetsDataAction and then saveDemandDataAction here
  const rawData = await serviceFetchAllSheets();
  const saveResult = await saveDemandDataToStore(rawData);
  if (saveResult.success) {
    return { success: true, message: "Manual sync completed and data saved." };
  }
  return { success: false, message: "Manual sync failed during data saving." };
}
