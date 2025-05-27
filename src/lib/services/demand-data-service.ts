
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, getDoc, query, where, orderBy, limit, Timestamp, deleteDoc, documentId, type QueryConstraint } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand } from '@/lib/types';
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
    // Timestamps from sheets are already ISO strings, parseISO is robust for this.
    // format then ensures YYYY-MM-DD for the dateKey.
    const dateKey = format(parseISO(item.timestamp), 'yyyy-MM-dd');


    const parentDocRef = doc(db, 'demandRecords', parentId);
    const parentDocData = { 
      client: item.client, 
      city: item.city, 
      area: item.area 
    };
    // Set with merge to avoid overwriting subcollections if parent doc already exists.
    currentBatch.set(parentDocRef, parentDocData, { merge: true });
    operationsInCurrentBatch++;

    const dailyDocRef = doc(parentDocRef, 'daily', dateKey);
    const dailyDocData = {
      demandScore: item.demandScore,
      timestamp: item.timestamp, // Original ISO string timestamp from sheet processing
      sourceSystemId: item.id, // Original ID from the sheet
    };
    currentBatch.set(dailyDocRef, dailyDocData);
    operationsInCurrentBatch++;
    totalRecordsProcessed++;

    // Firestore batch limit is 500 operations. Commit if we're close.
    if (operationsInCurrentBatch >= 490) { 
      try {
        await currentBatch.commit();
        console.log(`Committed batch of ${operationsInCurrentBatch} operations during save.`);
        currentBatch = writeBatch(db); // Create a new batch for subsequent operations
        operationsInCurrentBatch = 0;
      } catch (error) {
        console.error('Error committing partial batch to Firestore during save:', error);
        return { success: false, message: `Failed to save partial data (batch commit): ${error instanceof Error ? error.message : String(error)}` };
      }
    }
  }

  // Commit any remaining operations in the last batch
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

    // Iterate over each parent document to delete its subcollection
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
        await dailyBatch.commit(); // Commit remaining daily deletes for this parent
      }
    }

    // After all subcollections are cleared, delete the parent documents
    let parentBatch = writeBatch(db);
    let parentOpsInBatch = 0;
    // Re-fetch parent docs to ensure we have the current list after sub-collection deletions.
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
      await parentBatch.commit(); // Commit remaining parent deletes
    }

    console.log(`Successfully deleted ${totalDailyDocsDeleted} daily documents and ${totalParentDocsDeleted} parent documents.`);
    return { success: true, message: `Successfully cleared all data (${totalParentDocsDeleted} entities, ${totalDailyDocsDeleted} daily records).` };

  } catch (error) {
    console.error('Error clearing data from Firestore (new structure):', error);
    return { success: false, message: `Failed to clear data (new structure): ${error instanceof Error ? error.message : String(error)}` };
  }
}


export async function getDemandData(filters?: {
  client?: ClientName;
  date?: string; 
  city?: string;
}): Promise<DemandData[]> {
  const targetDate = filters?.date || format(new Date(), 'yyyy-MM-dd');
  console.log(`Reading from Firestore (new structure) for date: ${targetDate}, filters:`, filters);
  
  const parentCollectionRef = collection(db, 'demandRecords');
  const qConstraints: QueryConstraint[] = [];

  if (filters?.client) {
    qConstraints.push(where('client', '==', filters.client));
  }
  if (filters?.city && filters.city.trim() !== '') {
     qConstraints.push(where('city', '==', filters.city.trim()));
  }
  
  const finalParentQuery = query(parentCollectionRef, ...qConstraints);
  const demandEntries: DemandData[] = [];
  const MAX_INDIVIDUAL_DAILY_FETCHES = 200; // Limit for N+1 sub-collection reads
  const MAX_RESULTS_TO_CLIENT = 500;      // Limit for final payload size

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) {
      console.log("No matching parent documents found for the given filters in getDemandData.");
      return [];
    }

    const docsToProcess = parentDocsSnapshot.docs.slice(0, MAX_INDIVIDUAL_DAILY_FETCHES);
    if (parentDocsSnapshot.docs.length > MAX_INDIVIDUAL_DAILY_FETCHES) {
        console.warn(`[getDemandData] Limiting processing to ${MAX_INDIVIDUAL_DAILY_FETCHES} parent docs out of ${parentDocsSnapshot.docs.length} found.`);
    }

    for (const parentDoc of docsToProcess) {
      const parentData = parentDoc.data() as { client: ClientName; city: string; area: string };
      const dailyDocRef = doc(db, 'demandRecords', parentDoc.id, 'daily', targetDate);
      const dailyDocSnapshot = await getDoc(dailyDocRef);

      if (dailyDocSnapshot.exists()) {
        const dailyData = dailyDocSnapshot.data() as { demandScore: number; timestamp: string; sourceSystemId: string };
        demandEntries.push({
          id: dailyData.sourceSystemId,
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
    if (demandEntries.length > MAX_RESULTS_TO_CLIENT) {
        console.warn(`[getDemandData] Slicing final results from ${demandEntries.length} to ${MAX_RESULTS_TO_CLIENT}.`);
        return demandEntries.slice(0, MAX_RESULTS_TO_CLIENT);
    }
    return demandEntries;

  } catch (error) {
    console.error("Error fetching data from Firestore (getDemandData - new structure):", error);
    return [];
  }
}

export async function getHistoricalDemandData(
  dateRange: { start: string; end: string }, 
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  console.log('Reading historical data from Firestore (new structure):', dateRange, filters);
  
  const parentCollectionRef = collection(db, 'demandRecords');
  const parentQueryConstraints: QueryConstraint[] = [];

  if (filters?.client) {
    parentQueryConstraints.push(where('client', '==', filters.client));
  }
  if (filters?.city && filters.city.trim() !== '') {
     parentQueryConstraints.push(where('city', '==', filters.city.trim()));
  }

  const finalParentQuery = query(parentCollectionRef, ...parentQueryConstraints);
  const historicalEntries: DemandData[] = [];
  const MAX_INDIVIDUAL_HISTORICAL_FETCHES = 100; // Limit for N+1 sub-collection queries for history
  const MAX_HISTORICAL_RESULTS_TO_CLIENT = 1000; // Limit for final historical payload

  try {
    const parentDocsSnapshot = await getDocs(finalParentQuery);
    if (parentDocsSnapshot.empty) {
      console.log("No matching parent documents for historical data filters.");
      return [];
    }

    const docsToProcess = parentDocsSnapshot.docs.slice(0, MAX_INDIVIDUAL_HISTORICAL_FETCHES);
    if (parentDocsSnapshot.docs.length > MAX_INDIVIDUAL_HISTORICAL_FETCHES) {
        console.warn(`[getHistoricalDemandData] Limiting processing to ${MAX_INDIVIDUAL_HISTORICAL_FETCHES} parent docs out of ${parentDocsSnapshot.docs.length} found.`);
    }

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
          id: dailyData.sourceSystemId,
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
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      if (a.client < b.client) return -1;
      if (a.client > b.client) return 1;
      return b.demandScore - a.demandScore; // Secondary sort by demand score
    });
    
    console.log(`Fetched ${historicalEntries.length} raw records from Firestore for getHistoricalDemandData (new structure).`);
    if (historicalEntries.length > MAX_HISTORICAL_RESULTS_TO_CLIENT) {
        console.warn(`[getHistoricalDemandData] Slicing final results from ${historicalEntries.length} to ${MAX_HISTORICAL_RESULTS_TO_CLIENT}.`);
        return historicalEntries.slice(0, MAX_HISTORICAL_RESULTS_TO_CLIENT);
    }
    return historicalEntries;

  } catch (error) {
    console.error("Error fetching historical data from Firestore (new structure):", error);
    return [];
  }
}

export async function getCityDemandSummary(): Promise<CityDemand[]> {
  const data = await getDemandData(); 
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getClientDemandSummary(): Promise<ClientDemand[]> {
   const data = await getDemandData();
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}
