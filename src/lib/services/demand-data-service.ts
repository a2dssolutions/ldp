
import { db } from '@/lib/firebase';
import { localDb, type LocalDemandRecord, type LocalSyncMeta } from '@/lib/dexie';
import { collection, writeBatch, doc, getDocs, getDoc, query, where, orderBy, limit, Timestamp, documentId, type QueryConstraint, type DocumentData, type DocumentSnapshot, type DocumentReference } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format, parseISO, isToday, isValid } from 'date-fns';

// Firestore related code

const MAX_RECORDS_PER_FIRESTORE_BATCH = 100; // Reduced from 150

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
  let totalBatchesCommitted = 0;

  console.log(`[FirestoreSave] Starting save for ${data.length} records. Batch size: ${MAX_RECORDS_PER_FIRESTORE_BATCH} items per batch.`);


  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const parentId = getDemandRecordParentId(item.client, item.city, item.area);
    
    let itemDateObject;
    try {
        itemDateObject = parseISO(item.timestamp);
        if (!isValid(itemDateObject)) {
            console.warn(`[FirestoreSave] Invalid timestamp for item at index ${i}: ${item.timestamp}. ID: ${item.id}. Skipping this record.`);
            continue;
        }
    } catch (e) {
        console.warn(`[FirestoreSave] Error parsing timestamp for item at index ${i}: ${item.timestamp}. ID: ${item.id}. Error: ${e}. Skipping this record.`);
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
      timestamp: Timestamp.fromDate(itemDateObject),
      sourceSystemId: item.id, 
    };
    currentBatch.set(dailyDocRef, dailyDocData);
    
    recordsInCurrentBatch++;

    if (recordsInCurrentBatch >= MAX_RECORDS_PER_FIRESTORE_BATCH || i === data.length - 1) {
      try {
        console.log(`[FirestoreSave] Committing batch #${totalBatchesCommitted + 1} with ${recordsInCurrentBatch} items (approx ${recordsInCurrentBatch * 2} ops). Total items processed for save so far: ${totalRecordsSuccessfullySaved + recordsInCurrentBatch}.`);
        await currentBatch.commit();
        totalRecordsSuccessfullySaved += recordsInCurrentBatch;
        totalBatchesCommitted++;
        console.log(`[FirestoreSave] Batch #${totalBatchesCommitted} committed successfully.`);
        if (i < data.length - 1) { 
            currentBatch = writeBatch(db);
        }
        recordsInCurrentBatch = 0;
      } catch (error) {
        console.error('[FirestoreSave] Error committing batch to Firestore during save:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, message: `Failed to save data (batch commit): ${errorMessage}. ${totalRecordsSuccessfullySaved} items saved before error.` };
      }
    }
  }
  console.log(`[FirestoreSave] Save completed. Total MergedSheetData items successfully saved: ${totalRecordsSuccessfullySaved}. Total batches committed: ${totalBatchesCommitted}.`);
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
    const maxBatchOperations = 490; 

    for (const parentDoc of parentDocsSnapshot.docs) {
      const dailyCollectionRef = collection(db, 'demandRecords', parentDoc.id, 'daily');
      const dailyDocsSnapshot = await getDocs(dailyCollectionRef);

      if (!dailyDocsSnapshot.empty) {
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
    }

    let parentBatch = writeBatch(db);
    let parentOpsInBatch = 0;
    for (const parentDoc of parentDocsSnapshot.docs) {
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

// --- Existing constants for read operations ---
// Max parent documents (client_city_area combinations) to consider for a broad, unfiltered query (e.g., initial dashboard load)
const MAX_PARENT_DOCS_FOR_BROAD_QUERY = 150; // Reduced further
// Max individual parent documents to process for their daily data if a specific filter (client/city) still results in many parents
const MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY = 150; // Reduced further
// Max results to actually send back to the client from a typical dashboard query (safety net)
const MAX_RESULTS_TO_CLIENT = 500;

// Higher limits for "analysis" type queries where bypassLimits might be true
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
    if (!isBroadQuery) { 
      processingCapForParents = options?.bypassLimits ? MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY : MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY;
    }
    
    if (processingCapForParents && docsToProcess.length > processingCapForParents) {
      console.warn(`[getDemandDataFirestore] Specific query (client: ${filters?.client}, city: ${filters?.city}) for date ${targetDate} resulted in ${docsToProcess.length} parent entities. Capping processing to ${processingCapForParents}.`);
      docsToProcess = docsToProcess.slice(0, processingCapForParents);
    } else if (isBroadQuery && queryLimitForParents && parentDocsSnapshot.docs.length >= queryLimitForParents) {
      console.warn(`[getDemandDataFirestore] Broad query for date ${targetDate} hit the parent document limit of ${queryLimitForParents}. Results may be partial.`);
    }

    if (docsToProcess.length === 0) return [];

    const dailyDocRefsAndParentData = docsToProcess.map(parentDoc => {
      const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
      const dailyDocRef = doc(db, 'demandRecords', parentDoc.id, 'daily', targetDate);
      return { dailyDocRef, parentData, parentDocId: parentDoc.id };
    });

    const dailyDocSnapshots = await Promise.all(
        dailyDocRefsAndParentData.map(item => 
            getDoc(item.dailyDocRef).catch(e => {
                console.error(`[getDemandDataFirestore] Error fetching daily doc ${item.dailyDocRef.path}:`, e);
                return null; 
            })
        )
    );

    dailyDocSnapshots.forEach((dailyDocSnapshot, index) => {
      if (dailyDocSnapshot && dailyDocSnapshot.exists()) {
        const { parentData, parentDocId } = dailyDocRefsAndParentData[index];
        const dailyData = dailyDocSnapshot.data() as { demandScore: number; timestamp: Timestamp; sourceSystemId: string };
        
        let timestampStr = targetDate; // Fallback to targetDate if timestamp is problematic
        if (dailyData.timestamp && dailyData.timestamp.toDate) {
            try {
                timestampStr = dailyData.timestamp.toDate().toISOString();
            } catch (e) {
                console.warn(`[getDemandDataFirestore] Error converting Firestore Timestamp to Date for ${parentDocId}/${targetDate}:`, e);
            }
        }

        demandEntries.push({
          id: dailyData.sourceSystemId || parentDocId + '_' + targetDate,
          client: parentData.client,
          city: parentData.city,
          area: parentData.area,
          demandScore: dailyData.demandScore,
          timestamp: timestampStr,
          date: targetDate,
        });
      }
    });

    demandEntries.sort((a, b) => b.demandScore - a.demandScore);

    if (!options?.bypassLimits && demandEntries.length > MAX_RESULTS_TO_CLIENT) {
      console.warn(`[getDemandDataFirestore] Query returned ${demandEntries.length} records for date ${targetDate}, slicing to ${MAX_RESULTS_TO_CLIENT} for client.`);
      return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("[getDemandDataFirestore] Error fetching data from Firestore:", error);
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

  // Apply a limit to the number of parent entities to process for historical data to avoid excessive subcollection queries.
  parentQueryConstraints.push(limit(MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY));


  const finalParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const historicalEntries: DemandData[] = [];

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) return [];

    if (parentDocsSnapshot.docs.length >= MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY) {
        console.warn(`[getHistoricalDemandDataFirestore] Parent document query hit the processing limit of ${MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY}. Historical results may be partial for very broad queries.`);
    }

    const dailyQueriesPromises: Promise<{ parentData: { client: ClientName; city: string; area: string }; parentDocId: string; dailyDocs: DocumentSnapshot<DocumentData>[] }>[] = [];

    for (const parentDoc of parentDocsSnapshot.docs) {
      const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
      const dailyCollectionRef = collection(db, 'demandRecords', parentDoc.id, 'daily');
      const dailyQuery = query(
        dailyCollectionRef,
        where(documentId(), '>=', dateRange.start),
        where(documentId(), '<=', dateRange.end),
        orderBy(documentId(), 'asc') 
      );
      
      dailyQueriesPromises.push(
        getDocs(dailyQuery).then(snapshot => ({
            parentData,
            parentDocId: parentDoc.id,
            dailyDocs: snapshot.docs
        })).catch(e => {
          console.error(`[getHistoricalDemandDataFirestore] Error querying daily subcollection for parent ${parentDoc.id}:`, e);
          return { parentData, parentDocId: parentDoc.id, dailyDocs: [] }; // Return empty array on error for this subcollection
        })
      );
    }

    const allDailyResults = await Promise.all(dailyQueriesPromises);

    allDailyResults.forEach(result => {
        const { parentData, parentDocId, dailyDocs } = result;
        dailyDocs.forEach((dailyDoc) => {
            if (dailyDoc.exists()) {
                const dailyData = dailyDoc.data() as { demandScore: number; timestamp: Timestamp; sourceSystemId: string };
                
                let timestampStr = dailyDoc.id; // Fallback to dailyDoc.id (dateKey) if timestamp is problematic
                if (dailyData.timestamp && dailyData.timestamp.toDate) {
                    try {
                        timestampStr = dailyData.timestamp.toDate().toISOString();
                    } catch (e) {
                        console.warn(`[getHistoricalDemandDataFirestore] Error converting Firestore Timestamp to Date for ${parentDocId}/${dailyDoc.id}:`, e);
                    }
                }

                historicalEntries.push({
                    id: dailyData.sourceSystemId || parentDocId + '_' + dailyDoc.id,
                    client: parentData.client,
                    city: parentData.city,
                    area: parentData.area,
                    demandScore: dailyData.demandScore,
                    timestamp: timestampStr,
                    date: dailyDoc.id, 
                });
            }
        });
    });


    historicalEntries.sort((a, b) => a.date.localeCompare(b.date) || b.demandScore - a.demandScore);

    if (historicalEntries.length > MAX_RESULTS_TO_CLIENT) {
      console.warn(`[getHistoricalDemandDataFirestore] Historical query returned ${historicalEntries.length} records, slicing to ${MAX_RESULTS_TO_CLIENT}.`);
      return historicalEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return historicalEntries;
  } catch (error) {
    console.error("[getHistoricalDemandDataFirestore] Error fetching historical data from Firestore:", error);
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
    // Return 0 or a specific error indicator if preferred, instead of throwing
    return 0;
  }
}

export async function performLocalSyncOperations(dateToSync: string, dataToSave: DemandData[]): Promise<void> {
  try {
    await localDb.transaction('rw', localDb.demandRecords, localDb.meta, async () => {
      console.log(`[LocalSync] Tx: Clearing local data for date ${dateToSync}`);
      await localDb.demandRecords.where('date').equals(dateToSync).delete();

      if (dataToSave && dataToSave.length > 0) {
        console.log(`[LocalSync] Tx: Saving ${dataToSave.length} records to local DB for date ${dateToSync}`);
        const localRecords = dataToSave.map(d => ({ ...d })) as LocalDemandRecord[]; // Ensure it's LocalDemandRecord
        await localDb.demandRecords.bulkPut(localRecords);
      } else {
        console.log(`[LocalSync] Tx: No new data to save for date ${dateToSync}`);
      }

      const newSyncTimestamp = new Date().getTime();
      console.log(`[LocalSync] Tx: Updating sync status timestamp to ${newSyncTimestamp} for ID 'lastSyncStatus'`);
      await localDb.meta.put({ id: 'lastSyncStatus', timestamp: newSyncTimestamp });
    });
    console.log(`[LocalSync] Transaction for date ${dateToSync} completed successfully.`);
  } catch (error) {
    console.error(`[LocalSync] Error during local sync transaction for date ${dateToSync}:`, error);
    throw error; // Re-throw to be caught by the caller
  }
}

export async function saveBatchDataToLocalDB(data: DemandData[]): Promise<void> {
  if (!data || data.length === 0) {
    console.log("[LocalIngestionSave] No data provided to saveBatchDataToLocalDB.");
    return;
  }

  // Group data by date
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
        console.log(`[LocalIngestionSave] Tx: Clearing local data for date ${dateKey}`);
        await localDb.demandRecords.where('date').equals(dateKey).delete();

        const recordsForDate = dataByDate[dateKey];
        if (recordsForDate.length > 0) {
          console.log(`[LocalIngestionSave] Tx: Saving ${recordsForDate.length} records to local DB for date ${dateKey}`);
          const localRecords = recordsForDate.map(d => ({ ...d })) as LocalDemandRecord[];
          await localDb.demandRecords.bulkPut(localRecords);
        }
      }
    });
    console.log(`[LocalIngestionSave] Transaction for batch data completed successfully.`);
  } catch (error) {
    console.error(`[LocalIngestionSave] Error during local save transaction for batch data:`, error);
    throw error; // Re-throw
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
    throw error;
  }
}

export async function updateSyncStatus(timestamp: Date): Promise<void> {
  try {
    await localDb.meta.put({ id: 'lastSyncStatus', timestamp: timestamp.getTime() });
  } catch (error) {
    console.error("Error updating sync status:", error);
    // Potentially re-throw or handle if critical
    throw error;
  }
}

// Summary calculation functions
export function calculateCityDemandSummary(data: LocalDemandRecord[]): CityDemand[] {
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a, b) => b.totalDemand - a.totalDemand);
}

export function calculateClientDemandSummary(data: LocalDemandRecord[]): ClientDemand[] {
  const clientMap: Record<string, number> = {};
  data.forEach(item => {
    clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
  });
  return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a, b) => b.totalDemand - a.totalDemand);
}

export function calculateAreaDemandSummary(data: LocalDemandRecord[]): AreaDemand[] {
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
  data: LocalDemandRecord[],
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

    