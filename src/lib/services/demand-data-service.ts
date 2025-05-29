
import { db } from '@/lib/firebase';
import { localDb, type LocalDemandRecord, type LocalSyncMeta } from '@/lib/dexie';
import { collection, writeBatch, doc, getDocs, getDoc, query, where, orderBy, limit, Timestamp, documentId, type QueryConstraint } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format, parseISO, isToday, isValid } from 'date-fns';

// Firestore related code

// Define a more conservative batch size for Firestore writes
const MAX_RECORDS_PER_FIRESTORE_BATCH = 150; // Each record ~2 ops, so ~300 ops/batch

function getDemandRecordParentId(client: ClientName, city: string, area: string): string {
  const sanitize = (str: string) => str.replace(/[\s/\\.#$[\]]/g, '_');
  return `${sanitize(client)}_${sanitize(city)}_${sanitize(area)}`;
}

export async function saveDemandDataToStore(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  if (!data || data.length === 0) {
    return { success: true, message: "No data provided to save to Firestore." };
  }

  let currentBatch = writeBatch(db);
  let recordsInCurrentBatch = 0;
  let totalRecordsSuccessfullySaved = 0;

  console.log(`Starting Firestore save for ${data.length} records. Batch size: ${MAX_RECORDS_PER_FIRESTORE_BATCH} records.`);

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const parentId = getDemandRecordParentId(item.client, item.city, item.area);
    
    // Ensure timestamp is a Date object for Firestore Timestamp.fromDate()
    // The incoming item.timestamp from MergedSheetData is already an ISO string.
    const itemDateObject = parseISO(item.timestamp); 
    if (!isValid(itemDateObject)) {
        console.warn(`Invalid timestamp for item at index ${i}: ${item.timestamp}. Skipping this record for Firestore save.`);
        continue;
    }
    const dateKey = format(itemDateObject, 'yyyy-MM-dd');

    const parentDocRef = doc(db, 'demandRecords', parentId);
    const parentDocData = {
      client: item.client,
      city: item.city,
      area: item.area
    };
    currentBatch.set(parentDocRef, parentDocData, { merge: true });

    const dailyDocRef = doc(parentDocRef, 'daily', dateKey);
    const dailyDocData = {
      demandScore: item.demandScore,
      timestamp: Timestamp.fromDate(itemDateObject), // Store as Firestore Timestamp
      sourceSystemId: item.id,
    };
    currentBatch.set(dailyDocRef, dailyDocData);
    recordsInCurrentBatch++;

    // Commit batch if it's full or if it's the last item
    if (recordsInCurrentBatch >= MAX_RECORDS_PER_FIRESTORE_BATCH || i === data.length - 1) {
      try {
        console.log(`Committing batch with ${recordsInCurrentBatch} records. Total saved so far: ${totalRecordsSuccessfullySaved}.`);
        await currentBatch.commit();
        totalRecordsSuccessfullySaved += recordsInCurrentBatch;
        if (i < data.length - 1) { // Don't create a new batch if it was the last item
            currentBatch = writeBatch(db);
        }
        recordsInCurrentBatch = 0;
      } catch (error) {
        console.error('Error committing batch to Firestore during save:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Failed to save data (batch commit): ${errorMessage}. ${totalRecordsSuccessfullySaved} records saved before error.` };
      }
    }
  }
  console.log(`Firestore save completed. Total records saved: ${totalRecordsSuccessfullySaved}.`);
  return { success: true, message: `Successfully saved ${totalRecordsSuccessfullySaved} demand records to Firestore.` };
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
    const maxBatchOperations = 490; // Firestore limit

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

    // It's safer to delete parent docs in a separate loop after all subcollections are confirmed deleted.
    // Re-fetch parent docs to ensure we are working with the current state after subcollection deletion.
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


const MAX_PARENT_DOCS_FOR_BROAD_QUERY = 150;
const MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY = 150;
const MAX_RESULTS_TO_CLIENT = 500;
const MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY = 400; // Reduced from 750
const MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY = 400; // Reduced from 750


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
  if (isBroadQuery) {
    queryLimitForParents = options?.bypassLimits ? MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY : MAX_PARENT_DOCS_FOR_BROAD_QUERY;
  }

  if (queryLimitForParents) {
    qConstraints.push(limit(queryLimitForParents));
  }

  const finalParentQuery = query(parentCollectionRef, ...qConstraints);
  const demandEntries: DemandData[] = [];

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    let docsToProcess = parentDocsSnapshot.docs;

    let processingCapForParents: number | undefined;
    if (!isBroadQuery) { // This applies to specific client/city queries
      processingCapForParents = options?.bypassLimits ? MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY : MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY;
    }
    
    if (processingCapForParents && docsToProcess.length > processingCapForParents) {
      console.warn(`[getDemandDataFromFirestore] Specific query (client: ${filters?.client}, city: ${filters?.city}) for date ${targetDate} resulted in ${docsToProcess.length} parent entities. Capping processing to ${processingCapForParents}.`);
      docsToProcess = docsToProcess.slice(0, processingCapForParents);
    } else if (isBroadQuery && queryLimitForParents && parentDocsSnapshot.docs.length >= queryLimitForParents) {
      console.warn(`[getDemandDataFromFirestore] Broad query for date ${targetDate} hit the parent document limit of ${queryLimitForParents}. Results may be partial.`);
    }


    for (const parentDoc of docsToProcess) {
      try {
        const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
        const dailyDocRef = doc(db, 'demandRecords', parentDoc.id, 'daily', targetDate);
        const dailyDocSnapshot = await getDoc(dailyDocRef);

        if (dailyDocSnapshot.exists()) {
          const dailyData = dailyDocSnapshot.data() as { demandScore: number; timestamp: Timestamp; sourceSystemId: string }; // Expect Firestore Timestamp
          demandEntries.push({
            id: dailyData.sourceSystemId || parentDoc.id + '_' + targetDate,
            client: parentData.client,
            city: parentData.city,
            area: parentData.area,
            demandScore: dailyData.demandScore,
            timestamp: dailyData.timestamp.toDate().toISOString(), // Convert Firestore Timestamp to ISO string
            date: targetDate,
          });
        }
      } catch (dailyFetchError) {
        console.error(`Error fetching daily data for parent ${parentDoc.id} on date ${targetDate}:`, dailyFetchError);
      }
    }

    demandEntries.sort((a, b) => b.demandScore - a.demandScore);

    if (!options?.bypassLimits && demandEntries.length > MAX_RESULTS_TO_CLIENT) {
      console.warn(`[getDemandDataFromFirestore] Query returned ${demandEntries.length} records, slicing to ${MAX_RESULTS_TO_CLIENT} for client for date ${targetDate}.`);
      return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("Error fetching data from Firestore (getDemandDataFromFirestore):", error);
    throw error;
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

  // Apply a limit to the number of parent documents to prevent excessive subcollection queries
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
          const dailyData = dailyDoc.data() as { demandScore: number; timestamp: Timestamp; sourceSystemId: string }; // Expect Firestore Timestamp
          historicalEntries.push({
            id: dailyData.sourceSystemId || parentDoc.id + '_' + dailyDoc.id,
            client: parentData.client,
            city: parentData.city,
            area: parentData.area,
            demandScore: dailyData.demandScore,
            timestamp: dailyData.timestamp.toDate().toISOString(), // Convert Firestore Timestamp
            date: dailyDoc.id,
          });
        });
      } catch (dailyQueryError) {
        console.error(`Error fetching historical daily data for parent ${parentDoc.id} in range ${dateRange.start}-${dateRange.end}:`, dailyQueryError);
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
    throw error;
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

export async function getTotalLocalRecordsCount(): Promise<number> {
  try {
    return await localDb.demandRecords.count();
  } catch (error) {
    console.error("Error fetching total local records count:", error);
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
        // Ensure data conforms to LocalDemandRecord, primarily id vs localId
        const localRecords = dataToSave.map(d => ({ ...d })) as LocalDemandRecord[];
        await localDb.demandRecords.bulkPut(localRecords);
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

export async function saveBatchDataToLocalDB(data: DemandData[]): Promise<void> {
  if (!data || data.length === 0) {
    console.log("Local Ingestion Save: No data provided to saveBatchDataToLocalDB.");
    return;
  }

  const dataByDate: Record<string, DemandData[]> = data.reduce((acc, record) => {
    const dateKey = record.date;
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(record);
    return acc;
  }, {} as Record<string, DemandData[]>);

  try {
    await localDb.transaction('rw', localDb.demandRecords, async () => {
      for (const dateKey in dataByDate) {
        console.log(`Local Ingestion Save: Clearing local data for date ${dateKey}`);
        await localDb.demandRecords.where('date').equals(dateKey).delete();

        const recordsForDate = dataByDate[dateKey];
        if (recordsForDate.length > 0) {
          console.log(`Local Ingestion Save: Saving ${recordsForDate.length} records to local DB for date ${dateKey}`);
          const localRecords = recordsForDate.map(d => ({ ...d })) as LocalDemandRecord[];
          await localDb.demandRecords.bulkPut(localRecords);
        }
      }
    });
    console.log(`Local Ingestion Save: Transaction for batch data completed successfully.`);
  } catch (error) {
    console.error(`Error during local save transaction for batch data:`, error);
    throw error;
  }
}


export async function clearAllLocalDemandData(): Promise<{ success: boolean, message: string }> {
  try {
    await localDb.demandRecords.clear();
    await localDb.meta.clear();
    console.log("Local Dexie DB cleared successfully.");
    return { success: true, message: "Successfully cleared all local demand data." };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error clearing all local demand data:", error);
    return { success: false, message: `Failed to clear local data: ${errorMessage}` };
  }
}

export async function getSyncStatus(): Promise<LocalSyncMeta | undefined> {
  try {
    const status = await localDb.meta.get('lastSyncStatus');
    return status;
  } catch (error) {
    console.error("Error fetching sync status:", error);
    // It might be better to return undefined or a specific error object
    // For now, re-throwing, but consider how useLiveQuery handles this.
    throw error;
  }
}

export async function updateSyncStatus(timestamp: Date): Promise<void> {
  try {
    await localDb.meta.put({ id: 'lastSyncStatus', timestamp: timestamp.getTime() });
  } catch (error) {
    console.error("Error updating sync status:", error);
    throw error;
  }
}

// Summary calculation functions
export function calculateCityDemandSummary(data: DemandData[] | LocalDemandRecord[]): CityDemand[] {
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a, b) => b.totalDemand - a.totalDemand);
}

export function calculateClientDemandSummary(data: DemandData[] | LocalDemandRecord[]): ClientDemand[] {
  const clientMap: Record<string, number> = {};
  data.forEach(item => {
    clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
  });
  return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a, b) => b.totalDemand - a.totalDemand);
}

export function calculateAreaDemandSummary(data: DemandData[] | LocalDemandRecord[]): AreaDemand[] {
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
  data: DemandData[] | LocalDemandRecord[],
  minClients: number = 2,
  minDemandPerClient: number = 1
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
