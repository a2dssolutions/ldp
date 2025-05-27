
'use server';

import {
  fetchAllSheetsData as serviceFetchAllSheets,
} from '@/lib/services/google-sheet-service';
import {
  saveDemandDataToStore,
  clearAllDemandDataFromStore, // Added import
  getDemandData as serviceGetDemand,
  getHistoricalDemandData as serviceGetHistorical,
  getCityDemandSummary as serviceGetCityDemand,
  getClientDemandSummary as serviceGetClientDemand
} from '@/lib/services/demand-data-service';
import { suggestAreasForJobPosting, type SuggestAreasForJobPostingInput } from '@/ai/flows/suggest-areas-for-job-posting';
import type { MergedSheetData, DemandData, ClientName, CityDemand, ClientDemand } from '@/lib/types';

const MOCK_INDIAN_DEMAND_DATA: MergedSheetData[] = [
  { id: 'del-cp-1', client: 'Zepto', city: 'Delhi', area: 'Connaught Place', demandScore: 120, timestamp: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: 'del-sk-2', client: 'Blinkit', city: 'Delhi', area: 'Saket', demandScore: 90, timestamp: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: 'del-cp-3', client: 'SwiggyFood', city: 'Delhi', area: 'Connaught Place', demandScore: 110, timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'mum-ban-1', client: 'SwiggyFood', city: 'Mumbai', area: 'Bandra', demandScore: 150, timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'mum-and-2', client: 'SwiggyIM', city: 'Mumbai', area: 'Andheri', demandScore: 110, timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'mum-ban-3', client: 'Zepto', city: 'Mumbai', area: 'Bandra', demandScore: 160, timestamp: new Date().toISOString() },
  { id: 'blr-kor-1', client: 'Zepto', city: 'Bangalore', area: 'Koramangala', demandScore: 200, timestamp: new Date().toISOString() },
  { id: 'blr-ind-2', client: 'Blinkit', city: 'Bangalore', area: 'Indiranagar', demandScore: 180, timestamp: new Date().toISOString() },
  { id: 'blr-kor-3', client: 'SwiggyIM', city: 'Bangalore', area: 'Koramangala', demandScore: 190, timestamp: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: 'che-tna-1', client: 'SwiggyFood', city: 'Chennai', area: 'T. Nagar', demandScore: 130, timestamp: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: 'kol-pst-1', client: 'Zepto', city: 'Kolkata', area: 'Park Street', demandScore: 100, timestamp: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: 'hyd-bh-1', client: 'Blinkit', city: 'Hyderabad', area: 'Banjara Hills', demandScore: 160, timestamp: new Date().toISOString() },
  { id: 'pun-kp-1', client: 'SwiggyIM', city: 'Pune', area: 'Koregaon Park', demandScore: 140, timestamp: new Date(Date.now() - 86400000 * 2).toISOString() },
  {
    id: 'lko-vk-1', // Lucknow, Vivek Khand
    client: 'Blinkit',
    city: 'Lucknow',
    area: 'Vivek Khand',
    demandScore: 60,
    timestamp: new Date().toISOString() // Today's date
  },
  {
    id: 'lko-gn-1', // Lucknow, Gomti Nagar
    client: 'Zepto',
    city: 'Lucknow',
    area: 'Gomti Nagar',
    demandScore: 75,
    timestamp: new Date(Date.now() - 86400000 * 1).toISOString() // Yesterday
  }
];


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
  console.log("Manual sync triggered to load MOCK INDIAN DATA...");

  try {
    // Clear existing data
    const clearResult = await clearAllDemandDataFromStore();
    if (!clearResult.success) {
      console.error("Failed to clear existing data:", clearResult.message);
      // Decide if you want to proceed or return failure
      // For testing, we might proceed to load mock data anyway
    } else {
      console.log(clearResult.message);
    }

    // Save mock Indian data
    const saveResult = await saveDemandDataToStore(MOCK_INDIAN_DEMAND_DATA);
    if (saveResult.success) {
      return { success: true, message: "Mock Indian demand data loaded and saved successfully." };
    } else {
      return { success: false, message: `Failed to save mock data: ${saveResult.message}` };
    }
  } catch (error) {
    console.error("Error during manual mock data sync:", error);
    return { success: false, message: `Manual sync with mock data failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  // Original live data fetching - commented out for mock data testing
  // console.log("Manual sync triggered action...");
  // await new Promise(resolve => setTimeout(resolve, 1000));
  // const rawData = await serviceFetchAllSheets();
  // const saveResult = await saveDemandDataToStore(rawData);
  // if (saveResult.success) {
  //   return { success: true, message: "Manual sync completed and data saved." };
  // }
  // return { success: false, message: "Manual sync failed during data saving." };
}
