
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, query, where, orderBy, limit, Timestamp, deleteDoc } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand } from '@/lib/types';
import { format, parseISO } from 'date-fns';

function processToDemandData(mergedData: MergedSheetData[]): DemandData[] {
  return mergedData.map(item => ({
    ...item,
    timestamp: item.timestamp, 
    date: format(parseISO(item.timestamp), 'yyyy-MM-dd'), 
  }));
}

export async function saveDemandDataToStore(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  if (!data || data.length === 0) {
    return { success: true, message: "No data provided to save." };
  }
  const processedData = processToDemandData(data);
  const batch = writeBatch(db);
  const jpsCollectionRef = collection(db, 'jps');

  processedData.forEach(item => {
    const docRef = doc(jpsCollectionRef, item.id); 
    batch.set(docRef, item);
  });

  try {
    await batch.commit();
    console.log('Successfully saved to Firestore. Records:', processedData.length);
    return { success: true, message: `Successfully saved ${processedData.length} demand records to 'jps' collection.` };
  } catch (error) {
    console.error('Error saving data to Firestore:', error);
    return { success: false, message: `Failed to save data to Firestore: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function clearAllDemandDataFromStore(): Promise<{ success: boolean; message: string }> {
  console.log("Attempting to clear all data from 'jps' collection...");
  const jpsCollectionRef = collection(db, 'jps');
  const q = query(jpsCollectionRef); // Query to get all documents
  const batch = writeBatch(db);
  let deletedCount = 0;

  try {
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return { success: true, message: "'jps' collection is already empty." };
    }
    querySnapshot.forEach((document) => {
      batch.delete(document.ref);
      deletedCount++;
    });
    await batch.commit();
    console.log(`Successfully deleted ${deletedCount} documents from 'jps' collection.`);
    return { success: true, message: `Successfully deleted ${deletedCount} documents from 'jps' collection.` };
  } catch (error) {
    console.error('Error clearing data from Firestore:', error);
    return { success: false, message: `Failed to clear data: ${error instanceof Error ? error.message : String(error)}` };
  }
}


export async function getDemandData(filters?: {
  client?: ClientName;
  date?: string; 
  city?: string;
}): Promise<DemandData[]> {
  console.log('Reading from Firestore with filters:', filters);
  
  const jpsCollectionRef = collection(db, 'jps');
  let q = query(jpsCollectionRef);

  if (filters?.client) {
    q = query(q, where('client', '==', filters.client));
  }
  if (filters?.date) {
    q = query(q, where('date', '==', filters.date));
  }
  if (filters?.city && filters.city.trim() !== '') { // Updated city filter condition
     q = query(q, where('city', '==', filters.city.trim()));
  }
  
  q = query(q, orderBy('timestamp', 'desc'), limit(500)); 

  try {
    const querySnapshot = await getDocs(q);
    const demandEntries: DemandData[] = [];
    querySnapshot.forEach((doc) => {
      demandEntries.push(doc.data() as DemandData);
    });
    console.log(`Fetched ${demandEntries.length} records from Firestore for getDemandData.`);
    return demandEntries;
  } catch (error) {
    console.error("Error fetching data from Firestore:", error);
    return [];
  }
}

export async function getHistoricalDemandData(
  dateRange: { start: string; end: string }, 
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  console.log('Reading historical data from Firestore:', dateRange, filters);
  
  const jpsCollectionRef = collection(db, 'jps');
  let q = query(jpsCollectionRef, 
    where('date', '>=', dateRange.start), 
    where('date', '<=', dateRange.end)
  );

  if (filters?.client) {
    q = query(q, where('client', '==', filters.client));
  }
  if (filters?.city && filters.city.trim() !== '') { // Updated city filter condition
     q = query(q, where('city', '==', filters.city.trim()));
  }

  q = query(q, orderBy('date', 'asc')); 

  try {
    const querySnapshot = await getDocs(q);
    const historicalEntries: DemandData[] = [];
    querySnapshot.forEach((doc) => {
      historicalEntries.push(doc.data() as DemandData);
    });
    console.log(`Fetched ${historicalEntries.length} records from Firestore for getHistoricalDemandData.`);
    return historicalEntries;
  } catch (error) {
    console.error("Error fetching historical data from Firestore:", error);
    return [];
  }
}

export async function generateAreaSuggestions(client?: ClientName, city?: string): Promise<string[]> {
  console.log('Generating basic area suggestions for client:', client, 'city:', city);
  const recentData = (await getDemandData({ client, city })) 
    .sort((a, b) => b.demandScore - a.demandScore); 
  
  const uniqueAreas = Array.from(new Set(recentData.map(d => d.area)));
  return uniqueAreas.slice(0, 5);
}

export async function getCityDemandSummary(): Promise<CityDemand[]> {
  const data = await getDemandData(); // This still fetches all data for global summary on initial load.
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getClientDemandSummary(): Promise<ClientDemand[]> {
   const data = await getDemandData(); // This still fetches all data for global summary on initial load.
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}
