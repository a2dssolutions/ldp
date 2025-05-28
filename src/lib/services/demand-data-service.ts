
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, getDoc, query, where, orderBy, limit, Timestamp, deleteDoc, documentId, type QueryConstraint } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand, AreaDemand, MultiClientHotspotCity } from '@/lib/types';
import { format, parseISO } from 'date-fns';

// Helper to create a Firestore-safe ID for the parent document
function getDemandRecordParentId(client: ClientName, city: string, area: string): string {
  const sanitize = (str: string) => str.replace(/[\s/\\.#$[\]]/g, '_'); // More comprehensive sanitization
  return `${sanitize(client)}_${sanitize(city)}_${sanitize(area)}`;
}

export async function saveDemandDataToStore(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  if (!data || data.length === 0) {
    return { success: true, message: "No data provided to save." };
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
        console.log(`Committed batch of ${operationsInCurrentBatch} operations during save.`);
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
      console.log(`Committed final batch of ${operationsInCurrentBatch} operations during save.`);
    } catch (error) {
      console.error('Error saving final batch data to Firestore:', error);
      return { success: false, message: `Failed to save final data batch: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  console.log('Successfully saved to Firestore (new structure). Total records processed:', totalRecordsProcessed);
  return { success: true, message: `Successfully saved ${totalRecordsProcessed} demand records with new structure.` };
}

export async function clearAllDemandDataFromStore(): Promise<{ success: boolean; message: string }> {
  console.log("Attempting to clear all data from 'demandRecords' collection and their 'daily' subcollections...");
  const demandRecordsCollectionRef = collection(db, 'demandRecords');
  
  try {
    const parentDocsSnapshot = await getDocs(demandRecordsCollectionRef);
    if (parentDocsSnapshot.empty) {
      return { success: true, message: "'demandRecords' collection is already empty." };
    }

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

    console.log(`Successfully deleted ${totalDailyDocsDeleted} daily documents and ${totalParentDocsDeleted} parent documents.`);
    return { success: true, message: `Successfully cleared all data (${totalParentDocsDeleted} entities, ${totalDailyDocsDeleted} daily records).` };

  } catch (error) {
    console.error('Error clearing data from Firestore (new structure):', error);
    return { success: false, message: `Failed to clear data (new structure): ${error instanceof Error ? error.message : String(error)}` };
  }
}

// Limits for standard dashboard queries
const MAX_PARENT_DOCS_FOR_BROAD_QUERY = 300; 
const MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY = 250;
const MAX_RESULTS_TO_CLIENT = 500;      

// Higher limits for analysis queries (when bypassLimits is true)
const MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY = 750; // Reduced from 1500
const MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY = 750; // Reduced from 1500


export async function getDemandData(filters?: {
  client?: ClientName;
  date?: string; 
  city?: string;
}, options?: { bypassLimits?: boolean }): Promise<DemandData[]> {
  const targetDate = filters?.date || format(new Date(), 'yyyy-MM-dd');
  console.log(`Reading from Firestore (new structure) for date: ${targetDate}, filters:`, filters, "options:", options);
  
  const parentCollectionRef = collection(db, 'demandRecords');
  const qConstraints: QueryConstraint[] = [];

  const isSpecificClientQuery = !!filters?.client;
  const isSpecificCityQuery = !!(filters?.city && filters.city.trim() !== '');
  const isBroadQuery = !isSpecificClientQuery && !isSpecificCityQuery;

  if (isSpecificClientQuery) {
    qConstraints.push(where('client', '==', filters.client));
  }
  if (isSpecificCityQuery && filters.city && filters.city.trim() !== '') { // Ensure city is not empty
     qConstraints.push(where('city', '==', filters.city.trim()));
  }
  
  if (isBroadQuery) {
    if (options?.bypassLimits) {
      console.warn(`[getDemandData] Broad query with bypassLimits. Applying analysis limit of ${MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY} parent documents.`);
      qConstraints.push(limit(MAX_PARENT_DOCS_FOR_BROAD_ANALYSIS_QUERY));
    } else {
      console.warn(`[getDemandData] Broad query. Applying default limit of ${MAX_PARENT_DOCS_FOR_BROAD_QUERY} parent documents.`);
      qConstraints.push(limit(MAX_PARENT_DOCS_FOR_BROAD_QUERY));
    }
  }
  
  const finalParentQuery = query(parentCollectionRef, ...qConstraints);
  const demandEntries: DemandData[] = [];

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) {
      console.log("No matching parent documents found for the given filters in getDemandData.");
      return [];
    }

    let docsToProcess = parentDocsSnapshot.docs;

    if (!isBroadQuery) { 
      const processingLimit = options?.bypassLimits 
        ? MAX_DAILY_FETCHES_FOR_SPECIFIC_ANALYSIS_QUERY 
        : MAX_INDIVIDUAL_DAILY_FETCHES_FOR_SPECIFIC_QUERY;
      
      if (docsToProcess.length > processingLimit) {
        console.warn(`[getDemandData] Specific query (bypassLimits: ${!!options?.bypassLimits}) matched ${docsToProcess.length} parent docs. Limiting processing loop for daily data to ${processingLimit}.`);
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

    console.log(`Fetched ${demandEntries.length} raw records from Firestore for getDemandData (new structure).`);
    
    if (!options?.bypassLimits && demandEntries.length > MAX_RESULTS_TO_CLIENT) {
        console.warn(`[getDemandData] Slicing final results from ${demandEntries.length} to ${MAX_RESULTS_TO_CLIENT}.`);
        return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("Error fetching data from Firestore (getDemandData - new structure):", error);
     if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('code=permission-denied'))) {
      console.error("Firestore permission denied. Check your Firestore security rules. Path:", parentCollectionRef.path);
    }
    return [];
  }
}

const MAX_INDIVIDUAL_HISTORICAL_FETCHES = 100; 
const MAX_HISTORICAL_RESULTS_TO_CLIENT = 1000; 


export async function getHistoricalDemandData(
  dateRange: { start: string; end: string }, 
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  console.log('Reading historical data from Firestore (new structure):', dateRange, filters);
  
  const parentCollectionRef = collection(db, 'demandRecords');
  const parentQueryConstraints: QueryConstraint[] = [];

  const isSpecificClientQuery = !!filters?.client;
  const isSpecificCityQuery = !!(filters?.city && filters.city.trim() !== '');

  if (isSpecificClientQuery) {
    parentQueryConstraints.push(where('client', '==', filters.client));
  }
  if (isSpecificCityQuery && filters.city && filters.city.trim() !== '') { // Ensure city is not empty
     parentQueryConstraints.push(where('city', '==', filters.city.trim()));
  }

  
  const finalParentQueryWithoutLimit = query(parentCollectionRef, ...parentQueryConstraints);
  const parentDocsSnapshotForCount = await getDocs(finalParentQueryWithoutLimit);

  if (parentDocsSnapshotForCount.docs.length > MAX_INDIVIDUAL_HISTORICAL_FETCHES) {
      parentQueryConstraints.push(limit(MAX_INDIVIDUAL_HISTORICAL_FETCHES));
      console.warn(`[getHistoricalDemandData] Applied limit of ${MAX_INDIVIDUAL_HISTORICAL_FETCHES} to parent document query. Original matches: ${parentDocsSnapshotForCount.docs.length}`);
  }


  const finalParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const historicalEntries: DemandData[] = [];
  
  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) {
      console.log("No matching parent documents for historical data filters.");
      return [];
    }

    let docsToProcess = parentDocsSnapshot.docs;
    
    for (const parentDoc of docsToProcess) {
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
    
    historicalEntries.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      const clientCompare = a.client.localeCompare(b.client);
      if (clientCompare !== 0) return clientCompare;
      return b.demandScore - a.demandScore; 
    });
    
    console.log(`Fetched ${historicalEntries.length} raw records from Firestore for getHistoricalDemandData (new structure).`);
    if (historicalEntries.length > MAX_HISTORICAL_RESULTS_TO_CLIENT) {
        console.warn(`[getHistoricalDemandData] Slicing final results from ${historicalEntries.length} to ${MAX_HISTORICAL_RESULTS_TO_CLIENT}.`);
        return historicalEntries.slice(0, MAX_HISTORICAL_RESULTS_TO_CLIENT);
    }
    return historicalEntries;

  } catch (error) {
    console.error("Error fetching historical data from Firestore (new structure):", error);
    if (error instanceof Error && (error.message.includes('permission-denied') || error.message.includes('code=permission-denied'))) {
      console.error("Firestore permission denied. Check your Firestore security rules. Path:", parentCollectionRef.path);
    }
    return [];
  }
}

export async function getCityDemandSummary(filters?: { client?: ClientName; date?: string; city?: string }): Promise<CityDemand[]> {
  const data = await getDemandData(filters); 
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getClientDemandSummary(filters?: { client?: ClientName; date?: string; city?: string }): Promise<ClientDemand[]> {
   const data = await getDemandData(filters);
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getAreaDemandSummary(filters?: { client?: ClientName; date?: string; city?: string }): Promise<AreaDemand[]> {
  const data = await getDemandData(filters); 
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

export async function getMultiClientHotspots(
  minClients: number = 2, 
  minDemandPerClient: number = 5,
  filters?: { date?: string }
): Promise<MultiClientHotspotCity[]> {
  const allDemandData = await getDemandData({ date: filters?.date }, { bypassLimits: true }); 

  const cityClientDemand: Record<string, Record<ClientName, number>> = {};

  allDemandData.forEach(item => {
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
