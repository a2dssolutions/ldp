
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
    const dateKey = format(parseISO(item.timestamp), 'yyyy-MM-dd');

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
      timestamp: item.timestamp, 
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
    // ... (rest of the clear logic remains the same, ensuring batches for deletion)
    let totalDailyDocsDeleted = 0;
    let totalParentDocsDeleted = 0;

    for (const parentDoc of parentDocsSnapshot.docs) {
      const dailyCollectionRef = collection(db, 'demandRecords', parentDoc.id, 'daily');
      const dailyDocsSnapshot = await getDocs(dailyCollectionRef);
      
      let dailyBatch = writeBatch(db);
      let dailyOpsInBatch = 0;
      for (const dailyDoc of dailyDocsSnapshot.docs) {
        dailyBatch.delete(dailyDoc.ref);
        dailyOpsInBatch++;
        totalDailyDocsDeleted++;
        if (dailyOpsInBatch >= 490) {
          await dailyBatch.commit();
          dailyBatch = writeBatch(db);
          dailyOpsInBatch = 0;
        }
      }
      if (dailyOpsInBatch > 0) {
        await dailyBatch.commit(); 
      }
    }

    let parentBatch = writeBatch(db);
    let parentOpsInBatch = 0;
    const freshParentDocsSnapshot = await getDocs(demandRecordsCollectionRef); 
    for (const parentDoc of freshParentDocsSnapshot.docs) {
      parentBatch.delete(parentDoc.ref);
      parentOpsInBatch++;
      totalParentDocsDeleted++;
      if (parentOpsInBatch >= 490) {
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

// Firestore Data Fetching (used by server actions for syncing to local)
const MAX_PARENT_DOCS_FOR_BROAD_QUERY = 150;
const MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY = 150;
const MAX_RESULTS_TO_CLIENT = 500;
const MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY = 750;
const MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY = 750;

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
  if (filters?.city && filters.city.trim() !== '') qConstraints.push(where('city', '==', filters.city.trim()));
  
  let queryLimitApplied = false;
  if (isBroadQuery) {
    const limitToApply = options?.bypassLimits ? MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY : MAX_PARENT_DOCS_FOR_BROAD_QUERY;
    qConstraints.push(limit(limitToApply));
    queryLimitApplied = true;
  }
  
  const finalParentQuery = query(parentCollectionRef, ...qConstraints);
  const demandEntries: DemandData[] = [];

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    let docsToProcess = parentDocsSnapshot.docs;
    if (!queryLimitApplied && !isBroadQuery) { 
      const processingLimit = options?.bypassLimits ? MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY : MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY;
      if (docsToProcess.length > processingLimit) {
        docsToProcess = docsToProcess.slice(0, processingLimit);
      }
    }

    for (const parentDoc of docsToProcess) {
      const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
      const dailyDocRef = doc(db, 'demandRecords', parentDoc.id, 'daily', targetDate);
      const dailyDocSnapshot = await getDoc(dailyDocRef);

      if (dailyDocSnapshot.exists()) {
        const dailyData = dailyDocSnapshot.data() as { demandScore: number; timestamp: string; sourceSystemId: string };
        demandEntries.push({
          id: dailyData.sourceSystemId || parentDoc.id + '_' + targetDate, 
          client: parentData.client,
          city: parentData.city,
          area: parentData.area,
          demandScore: dailyData.demandScore,
          timestamp: dailyData.timestamp,
          date: targetDate,
        });
      }
    }
    
    demandEntries.sort((a, b) => b.demandScore - a.demandScore);
    
    if (!options?.bypassLimits && demandEntries.length > MAX_RESULTS_TO_CLIENT) {
        return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("Error fetching data from Firestore (getDemandDataFromFirestore):", error);
    return [];
  }
}

export async function getHistoricalDemandDataFromFirestore(
  dateRange: { start: string; end: string }, 
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  const parentCollectionRef = collection(db, 'demandRecords');
  const parentQueryConstraints: QueryConstraint[] = [];

  if (filters?.client) parentQueryConstraints.push(where('client', '==', filters.client));
  if (filters?.city && filters.city.trim() !== '') parentQueryConstraints.push(where('city', '==', filters.city.trim()));
  
  // Apply a limit to parent documents for broad historical queries to avoid excessive sub-collection reads
  const initialParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const parentCountSnapshot = await getDocs(initialParentQuery);
  if (parentCountSnapshot.docs.length > MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY) { // Using a moderate limit here
    parentQueryConstraints.push(limit(MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY));
    console.warn(`[getHistoricalDemandDataFromFirestore] Applied limit of ${MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY} to parent document query. Original matches: ${parentCountSnapshot.docs.length}`);
  }

  const finalParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const historicalEntries: DemandData[] = [];
  
  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    for (const parentDoc of parentDocsSnapshot.docs) {
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
    }
    
    historicalEntries.sort((a, b) => a.date.localeCompare(b.date) || b.demandScore - a.demandScore);
    
    if (historicalEntries.length > MAX_RESULTS_TO_CLIENT) { // Using MAX_RESULTS_TO_CLIENT as a general cap
        return historicalEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return historicalEntries;
  } catch (error) {
    console.error("Error fetching historical data from Firestore:", error);
    return [];
  }
}

// Dexie (Local IndexedDB) Service Functions
export async function getLocalDemandDataForDate(date: string): Promise<DemandData[]> {
  try {
    return await localDb.demandRecords.where('date').equals(date).toArray();
  } catch (error) {
    console.error("Error fetching local demand data for date:", date, error);
    return [];
  }
}

export async function saveDemandDataToLocalDB(data: DemandData[]): Promise<void> {
  if (!data || data.length === 0) return;
  try {
    // Using bulkPut for efficient add/update. It uses the primary key ('id') to update if exists, or add if not.
    await localDb.demandRecords.bulkPut(data.map(d => ({...d} as LocalDemandRecord))); // Ensure it's plain objects
  } catch (error) {
    console.error("Error saving demand data to local DB:", error);
  }
}

export async function clearDemandDataForDateFromLocalDB(date: string): Promise<void> {
  try {
    await localDb.demandRecords.where('date').equals(date).delete();
  } catch (error) {
    console.error("Error clearing local demand data for date:", date, error);
  }
}

export async function clearAllLocalDemandData(): Promise<{success: boolean, message: string}> {
  try {
    await localDb.demandRecords.clear();
    await localDb.meta.clear(); // Also clear meta table
    return {success: true, message: "Successfully cleared all local demand data."};
  } catch (error) {
    console.error("Error clearing all local demand data:", error);
    return {success: false, message: `Failed to clear local data: ${error}`};
  }
}

export async function getSyncStatus(): Promise<LocalSyncMeta | null> {
  try {
    const status = await localDb.meta.get('lastSyncStatus');
    return status || { id: 'lastSyncStatus', timestamp: null };
  } catch (error) {
    console.error("Error fetching sync status:", error);
    return { id: 'lastSyncStatus', timestamp: null };
  }
}

export async function updateSyncStatus(timestamp: Date): Promise<void> {
  try {
    await localDb.meta.put({ id: 'lastSyncStatus', timestamp: timestamp.getTime() });
  } catch (error) {
    console.error("Error updating sync status:", error);
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
  minDemandPerClient: number = 5
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
