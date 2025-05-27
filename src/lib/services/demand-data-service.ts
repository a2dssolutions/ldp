
import { db } from '@/lib/firebase';
import { collection, writeBatch, doc, getDocs, query, where, orderBy, limit, startAt, Timestamp } from 'firebase/firestore';
import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand } from '@/lib/types';
import { format, parseISO } from 'date-fns';

// No longer using in-memory store
// let storedDemandData: DemandData[] = [];

function processToDemandData(mergedData: MergedSheetData[]): DemandData[] {
  return mergedData.map(item => ({
    ...item,
    // Ensure timestamp is a valid string for Firestore or convert to Firestore Timestamp if preferred
    // For simplicity, keeping as ISO string as MergedSheetData defines it.
    // Firestore can store ISO strings.
    timestamp: item.timestamp, // Already an ISO string
    date: format(parseISO(item.timestamp), 'yyyy-MM-dd'), // Date for filtering
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
    const docRef = doc(jpsCollectionRef, item.id); // Use item.id as document ID
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

export async function getDemandData(filters?: {
  client?: ClientName;
  date?: string; // YYYY-MM-DD
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
  if (filters?.city) {
    // Firestore text search is limited. For partial matches, consider Algolia or other search services.
    // For simple exact match (case-sensitive) or prefix, you can use:
    // q = query(q, where('city', '>=', filters.city), where('city', '<=', filters.city + '\uf8ff'));
    // For this app, we'll assume city filter means exact match for simplicity in query
    // or filter client-side if a broader match is needed and dataset is small.
    // For now, let's filter for exact city match.
     q = query(q, where('city', '==', filters.city));
  }
  
  // Add a default ordering and limit for performance and predictability if needed
  q = query(q, orderBy('timestamp', 'desc'), limit(500)); // Example: latest 500 records

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
  dateRange: { start: string; end: string }, // YYYY-MM-DD
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
  if (filters?.city) {
     // Similar to getDemandData, using exact match for city
     q = query(q, where('city', '==', filters.city));
  }

  q = query(q, orderBy('date', 'asc')); // Order by date for historical trends

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


// Basic suggestion logic (placeholder for AI) - This would now use getDemandData which reads from Firestore
export async function generateAreaSuggestions(client?: ClientName, city?: string): Promise<string[]> {
  console.log('Generating basic area suggestions for client:', client, 'city:', city);
  
  // Fetch recent data using getDemandData (which now uses Firestore)
  // For "recent", you might want to add a date filter to getDemandData or fetch all and sort client-side.
  // For simplicity, using current getDemandData and sorting locally.
  const recentData = (await getDemandData({ client, city })) // Pass client and city filters
    .sort((a, b) => b.demandScore - a.demandScore); // Sort by demand score
  
  const uniqueAreas = Array.from(new Set(recentData.map(d => d.area)));
  return uniqueAreas.slice(0, 5);
}

export async function getCityDemandSummary(): Promise<CityDemand[]> {
  const data = await getDemandData(); // Fetch all current data from Firestore
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getClientDemandSummary(): Promise<ClientDemand[]> {
   const data = await getDemandData(); // Fetch all current data from Firestore
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}
