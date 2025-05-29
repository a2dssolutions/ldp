
import { db } from '@/lib/firebase';
import { localDb, type LocalDemandRecord, type LocalSyncMeta } from '@/lib/dexie';
import { collection, writeBatch, doc, getDocs, getDoc, query, where, orderBy, limit, Timestamp, deleteDoc, documentId, type QueryConstraint } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format, parseISO, isToday, isValid } from 'date-fns';

// Firestore related code (remains largely the same for SSoT operations)
function getDemandRecordParentId(client: ClientName, city: string, area: string): string {
  const sanitize = (str: string) => str.replace(/[\s/\\.#$[\]]/g, '_');
  return `${sanitize(client)}_${sanitize(city)}_${sanitize(area)}`;
}

export async function saveDemandDataToStore(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  if (!data || data.length === 0) {
    return { success: true, message: "No data provided to save to Firestore." };
  }
  
  let currentBatch = writeBatch(db);
  let operationsInCurrentBatch = 0;
  let totalRecordsProcessed = 0;

  for (const item of data) {
    const parentId = getDemandRecordParentId(item.client, item.city, item.area);
    // Ensure timestamp is valid before parsing
    const itemTimestamp = typeof item.timestamp === 'string' ? item.timestamp : new Date(item.timestamp).toISOString();
    const dateKey = format(parseISO(itemTimestamp), 'yyyy-MM-dd');


    const parentDocRef = doc(db, 'demandRecords', parentId);
    const parentDocData = { 
      client: item.client, 
      city: item.city, 
      area: item.area 
    };
    currentBatch.set(parentDocRef, parentDocData, { merge: true });
    operationsInCurrentBatch++;

    const dailyDocRef = doc(parentDocRef, 'daily', dateKey);
    const dailyDocData = {
      demandScore: item.demandScore,
      timestamp: itemTimestamp, 
      sourceSystemId: item.id, 
    };
    currentBatch.set(dailyDocRef, dailyDocData);
    operationsInCurrentBatch++;
    totalRecordsProcessed++;

    if (operationsInCurrentBatch >= 490) { 
      try {
        await currentBatch.commit();
        currentBatch = writeBatch(db); 
        operationsInCurrentBatch = 0;
      } catch (error) {
        console.error('Error committing partial batch to Firestore during save:', error);
        return { success: false, message: `Failed to save partial data (batch commit): ${error instanceof Error ? error.message : String(error)}` };
      }
    }
  }

  if (operationsInCurrentBatch > 0) {
    try {
      await currentBatch.commit();
    } catch (error) {
      console.error('Error saving final batch data to Firestore:', error);
      return { success: false, message: `Failed to save final data batch: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { success: true, message: `Successfully saved ${totalRecordsProcessed} demand records to Firestore.` };
}

export async function clearAllDemandDataFromStore(): Promise<{ success: boolean; message: string }> {
  const demandRecordsCollectionRef = collection(db, 'demandRecords');
  try {
    const parentDocsSnapshot = await getDocs(demandRecordsCollectionRef);
    if (parentDocsSnapshot.empty) {
      return { success: true, message: "'demandRecords' collection is already empty." };
    }
    
    let totalDailyDocsDeleted = 0;
    let totalParentDocsDeleted = 0;
    const maxBatchOperations = 490; // Firestore batch limit is 500

    for (const parentDoc of parentDocsSnapshot.docs) {
      const dailyCollectionRef = collection(db, 'demandRecords', parentDoc.id, 'daily');
      const dailyDocsSnapshot = await getDocs(dailyCollectionRef);
      
      let dailyBatch = writeBatch(db);
      let dailyOpsInBatch = 0;
      for (const dailyDoc of dailyDocsSnapshot.docs) {
        dailyBatch.delete(dailyDoc.ref);
        dailyOpsInBatch++;
        totalDailyDocsDeleted++;
        if (dailyOpsInBatch >= maxBatchOperations) {
          await dailyBatch.commit();
          dailyBatch = writeBatch(db);
          dailyOpsInBatch = 0;
        }
      }
      if (dailyOpsInBatch > 0) {
        await dailyBatch.commit(); 
      }
    }

    // Fetch a fresh snapshot because the subcollection deletions might take time to reflect
    // and we want to ensure we're deleting parents that are now empty or intended to be cleared.
    const freshParentDocsSnapshot = await getDocs(demandRecordsCollectionRef); 
    let parentBatch = writeBatch(db);
    let parentOpsInBatch = 0;
    for (const parentDoc of freshParentDocsSnapshot.docs) {
      parentBatch.delete(parentDoc.ref);
      parentOpsInBatch++;
      totalParentDocsDeleted++;
      if (parentOpsInBatch >= maxBatchOperations) {
        await parentBatch.commit();
        parentBatch = writeBatch(db);
        parentOpsInBatch = 0;
      }
    }
    if (parentOpsInBatch > 0) {
      await parentBatch.commit(); 
    }
    return { success: true, message: `Successfully cleared all data from Firestore (${totalParentDocsDeleted} entities, ${totalDailyDocsDeleted} daily records).` };

  } catch (error) {
    console.error('Error clearing data from Firestore:', error);
    return { success: false, message: `Failed to clear data from Firestore: ${error instanceof Error ? error.message : String(error)}` };
  }
}


// Limits for Firestore queries
const MAX_PARENT_DOCS_FOR_BROAD_QUERY = 150; // For unfiltered dashboard loads
const MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY = 150; // For filtered dashboard loads
const MAX_RESULTS_TO_CLIENT = 500; 

// For analysis type queries that bypass normal limits (e.g., for internal processing or less frequent reports)
// Reduced from 750 to 400
const MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY = 400;
const MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY = 400;


export async function getDemandDataFromFirestore(filters?: {
  client?: ClientName;
  date?: string; 
  city?: string;
}, options?: { bypassLimits?: boolean }): Promise<DemandData[]> {
  const targetDate = filters?.date || format(new Date(), 'yyyy-MM-dd');
  const parentCollectionRef = collection(db, 'demandRecords');
  const qConstraints: QueryConstraint[] = [];

  const isSpecificClientQuery = !!filters?.client;
  const isSpecificCityQuery = !!(filters?.city && filters.city.trim() !== '');
  const isBroadQuery = !isSpecificClientQuery && !isSpecificCityQuery;

  if (filters?.client) qConstraints.push(where('client', '==', filters.client));
  if (filters?.city && filters.city.trim() !== '') {
     qConstraints.push(where('city', '==', filters.city.trim()));
  }
  
  let queryLimitForParents: number | undefined = undefined;
  let processingLimitForParents: number | undefined;

  if (isBroadQuery) {
    queryLimitForParents = options?.bypassLimits ? MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY : MAX_PARENT_DOCS_FOR_BROAD_QUERY;
  }
  
  if(queryLimitForParents) {
    qConstraints.push(limit(queryLimitForParents));
  }
  
  const finalParentQuery = query(parentCollectionRef, ...qConstraints);
  const demandEntries: DemandData[] = [];

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    let docsToProcess = parentDocsSnapshot.docs;
    
    if (!isBroadQuery) { 
      const specificQueryProcessingCap = options?.bypassLimits ? MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY : MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY;
      if (docsToProcess.length > specificQueryProcessingCap) {
        console.warn(`[getDemandDataFromFirestore] Specific query (client: ${filters?.client}, city: ${filters?.city}) resulted in ${docsToProcess.length} parent entities. Capping processing to ${specificQueryProcessingCap}.`);
        docsToProcess = docsToProcess.slice(0, specificQueryProcessingCap);
      }
    } else if (isBroadQuery && queryLimitForParents && parentDocsSnapshot.docs.length >= queryLimitForParents) {
        console.warn(`[getDemandDataFromFirestore] Broad query hit the parent document limit of ${queryLimitForParents}. Results may be partial.`);
    }


    for (const parentDoc of docsToProcess) {
      try {
        const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
        const dailyDocRef = doc(db, 'demandRecords', parentDoc.id, 'daily', targetDate);
        const dailyDocSnapshot = await getDoc(dailyDocRef);

        if (dailyDocSnapshot.exists()) {
          const dailyData = dailyDocSnapshot.data() as { demandScore: number; timestamp: string; sourceSystemId: string };
          demandEntries.push({
            id: dailyData.sourceSystemId || parentDoc.id + '_' + targetDate, // Fallback ID
            client: parentData.client,
            city: parentData.city,
            area: parentData.area,
            demandScore: dailyData.demandScore,
            timestamp: dailyData.timestamp,
            date: targetDate,
          });
        }
      } catch (dailyFetchError) {
         console.error(`Error fetching daily data for parent ${parentDoc.id} on date ${targetDate}:`, dailyFetchError);
        // Continue processing other parent documents
      }
    }
    
    demandEntries.sort((a, b) => b.demandScore - a.demandScore);
    
    if (!options?.bypassLimits && demandEntries.length > MAX_RESULTS_TO_CLIENT) {
        console.warn(`[getDemandDataFromFirestore] Query returned ${demandEntries.length} records, slicing to ${MAX_RESULTS_TO_CLIENT} for client.`);
        return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("Error fetching data from Firestore (getDemandDataFromFirestore):", error);
    throw error; // Re-throw the error to be caught by the calling action
  }
}

export async function getHistoricalDemandDataFromFirestore(
  dateRange: { start: string; end: string }, 
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  const parentCollectionRef = collection(db, 'demandRecords');
  const parentQueryConstraints: QueryConstraint[] = [];

  if (filters?.client) parentQueryConstraints.push(where('client', '==', filters.client));
  if (filters?.city && filters.city.trim() !== '') {
     parentQueryConstraints.push(where('city', '==', filters.city.trim()));
  }
  
  // Use analysis query limit for historical data fetches as these are often for broader analysis
  parentQueryConstraints.push(limit(MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY));


  const finalParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const historicalEntries: DemandData[] = [];
  
  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    if (parentDocsSnapshot.docs.length >= MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY) {
         console.warn(`[getHistoricalDemandDataFromFirestore] Parent document query hit the processing limit of ${MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY}. Results may be partial for very broad historical queries.`);
    }

    for (const parentDoc of parentDocsSnapshot.docs) {
      try {
        const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
        const dailyCollectionRef = collection(db, 'demandRecords', parentDoc.id, 'daily');
        const dailyQuery = query(
          dailyCollectionRef, 
          where(documentId(), '>=', dateRange.start), 
          where(documentId(), '<=', dateRange.end),
          orderBy(documentId(), 'asc') 
        );
        
        const dailyDocsSnapshot = await getDocs(dailyQuery);
        dailyDocsSnapshot.forEach((dailyDoc) => {
          const dailyData = dailyDoc.data() as { demandScore: number; timestamp: string; sourceSystemId: string };
          historicalEntries.push({
            id: dailyData.sourceSystemId || parentDoc.id + '_' + dailyDoc.id, 
            client: parentData.client,
            city: parentData.city,
            area: parentData.area,
            demandScore: dailyData.demandScore,
            timestamp: dailyData.timestamp,
            date: dailyDoc.id, 
          });
        });
      } catch (dailyQueryError) {
        console.error(`Error fetching historical daily data for parent ${parentDoc.id} in range ${dateRange.start}-${dateRange.end}:`, dailyQueryError);
        // Continue processing other parent documents
      }
    }
    
    historicalEntries.sort((a, b) => a.date.localeCompare(b.date) || b.demandScore - a.demandScore);
    
    if (historicalEntries.length > MAX_RESULTS_TO_CLIENT) { 
        console.warn(`[getHistoricalDemandDataFromFirestore] Historical query returned ${historicalEntries.length} records, slicing to ${MAX_RESULTS_TO_CLIENT}.`);
        return historicalEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return historicalEntries;
  } catch (error) {
    console.error("Error fetching historical data from Firestore:", error);
    throw error; // Re-throw
  }
}

// Dexie (Local IndexedDB) Service Functions
export async function getLocalDemandDataForDate(date: string): Promise<LocalDemandRecord[]> {
  try {
    return await localDb.demandRecords.where('date').equals(date).toArray();
  } catch (error) {
    console.error("Error fetching local demand data for date:", date, error);
    throw error; 
  }
}

// This function is intended to be called from client-side components after fetching data via an action
export async function saveDemandDataToLocalDB(data: DemandData[]): Promise<void> {
  if (!data || data.length === 0) return;
  try {
    await localDb.demandRecords.bulkPut(data as LocalDemandRecord[]);
  } catch (error) {
    console.error("Error saving demand data to local DB:", error);
    throw error; 
  }
}

export async function clearDemandDataForDateFromLocalDB(date: string): Promise<void> {
  try {
    await localDb.demandRecords.where('date').equals(date).delete();
  } catch (error) {
    console.error("Error clearing local demand data for date:", date, error);
    throw error; 
  }
}

export async function performLocalSyncOperations(dateToSync: string, dataToSave: DemandData[]): Promise<void> {
  try {
    await localDb.transaction('rw', localDb.demandRecords, localDb.meta, async () => {
      console.log(`Local Sync: Clearing local data for date ${dateToSync}`);
      await localDb.demandRecords.where('date').equals(dateToSync).delete();

      if (dataToSave && dataToSave.length > 0) {
        console.log(`Local Sync: Saving ${dataToSave.length} records to local DB for date ${dateToSync}`);
        await localDb.demandRecords.bulkPut(dataToSave as LocalDemandRecord[]);
      } else {
        console.log(`Local Sync: No new data to save for date ${dateToSync}`);
      }

      const newSyncTimestamp = new Date().getTime();
      console.log(`Local Sync: Updating sync status timestamp to ${newSyncTimestamp}`);
      await localDb.meta.put({ id: 'lastSyncStatus', timestamp: newSyncTimestamp });
    });
     console.log(`Local Sync: Transaction for date ${dateToSync} completed successfully.`);
  } catch (error) {
    console.error(`Error during local sync transaction for date ${dateToSync}:`, error);
    throw error; 
  }
}


export async function clearAllLocalDemandData(): Promise<{success: boolean, message: string}> {
  try {
    await localDb.demandRecords.clear();
    await localDb.meta.clear(); 
    console.log("Local Dexie DB cleared successfully.");
    return {success: true, message: "Successfully cleared all local demand data."};
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error clearing all local demand data:", error);
    return {success: false, message: `Failed to clear local data: ${errorMessage}`};
  }
}

export async function getSyncStatus(): Promise<LocalSyncMeta | undefined> { 
  try {
    const status = await localDb.meta.get('lastSyncStatus');
    return status; 
  } catch (error) {
    console.error("Error fetching sync status:", error);
    throw error; 
  }
}

export async function updateSyncStatus(timestamp: Date): Promise<void> {
  try {
    await localDb.meta.put({ id: 'lastSyncStatus', timestamp: timestamp.getTime() });
  } catch (error)
{
    console.error("Error updating sync status:", error);
    throw error; 
  }
}


// Summary calculation functions (can operate on data from Firestore or LocalDB)
export function calculateCityDemandSummary(data: DemandData[]): CityDemand[] {
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export function calculateClientDemandSummary(data: DemandData[]): ClientDemand[] {
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export function calculateAreaDemandSummary(data: DemandData[]): AreaDemand[] {
  const areaMap: Record<string, { city: string; totalDemand: number; clients: Set<ClientName> }> = {};
  data.forEach(item => {
    const key = `${item.city}-${item.area}`; 
    if (!areaMap[key]) {
      areaMap[key] = { city: item.city, totalDemand: 0, clients: new Set() };
    }
    areaMap[key].totalDemand += item.demandScore;
    areaMap[key].clients.add(item.client);
  });
  return Object.entries(areaMap)
    .map(([key, value]) => ({
      area: key.split('-').slice(1).join('-'), 
      city: value.city,
      totalDemand: value.totalDemand,
      clients: Array.from(value.clients),
    }))
    .sort((a, b) => b.totalDemand - a.totalDemand);
}

export function calculateMultiClientHotspots(
  data: DemandData[],
  minClients: number = 2, 
  minDemandPerClient: number = 1 // Lowered minDemandPerClient to be more inclusive for testing
): MultiClientHotspotCity[] {
  const cityClientDemand: Record<string, Record<ClientName, number>> = {};
  data.forEach(item => {
    if (!cityClientDemand[item.city]) {
      cityClientDemand[item.city] = {} as Record<ClientName, number>;
    }
    cityClientDemand[item.city][item.client] = (cityClientDemand[item.city][item.client] || 0) + item.demandScore;
  });

  const hotspots: MultiClientHotspotCity[] = [];
  for (const city in cityClientDemand) {
    const clientsInCity = cityClientDemand[city];
    const activeClients: ClientName[] = [];
    let totalDemandInCityForHotspot = 0;
    (Object.keys(clientsInCity) as ClientName[]).forEach(client => { 
      if (clientsInCity[client] >= minDemandPerClient) {
        activeClients.push(client);
        totalDemandInCityForHotspot += clientsInCity[client];
      }
    });
    if (activeClients.length >= minClients) {
      hotspots.push({
        city,
        activeClients,
        totalDemand: totalDemandInCityForHotspot,
        clientCount: activeClients.length,
      });
    }
  }
  return hotspots.sort((a, b) => b.clientCount - a.clientCount || b.totalDemand - a.totalDemand);
}
