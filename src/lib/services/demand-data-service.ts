import type { DemandData, MergedSheetData, ClientName, CityDemand, ClientDemand } from '@/lib/types';
import { format } from 'date-fns';

// Simulate a Firestore-like in-memory store
let storedDemandData: DemandData[] = [];

function processToDemandData(mergedData: MergedSheetData[]): DemandData[] {
  return mergedData.map(item => ({
    ...item,
    date: format(new Date(item.timestamp), 'yyyy-MM-dd'),
  }));
}

export async function saveDemandDataToStore(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  const processedData = processToDemandData(data);
  storedDemandData = [...processedData]; // Replace with new data for simplicity in mock
  console.log('Simulating save to Firestore. Store now has:', storedDemandData.length, 'records');
  await new Promise(resolve => setTimeout(resolve, 300));
  return { success: true, message: `Successfully "saved" ${processedData.length} demand records.` };
}

export async function getDemandData(filters?: {
  client?: ClientName;
  date?: string; // YYYY-MM-DD
  city?: string;
}): Promise<DemandData[]> {
  console.log('Simulating read from Firestore with filters:', filters);
  await new Promise(resolve => setTimeout(resolve, 400));

  if (storedDemandData.length === 0) {
    // Populate with some initial data if empty, for demo purposes
    const initialZeptoData = Array.from({ length: 5 }, (_, i) => ({ id: `z${i}`, client: 'Zepto', city: 'Metropolis', area: `Area Z${i}`, demandScore: 50 + i*5, timestamp: new Date().toISOString(), date: format(new Date(), 'yyyy-MM-dd') })) as DemandData[];
    const initialBlinkitData = Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, client: 'Blinkit', city: 'Gotham', area: `Area B${i}`, demandScore: 60 + i*5, timestamp: new Date().toISOString(), date: format(new Date(), 'yyyy-MM-dd') })) as DemandData[];
    storedDemandData = [...initialZeptoData, ...initialBlinkitData];
  }
  
  let filteredData = storedDemandData;

  if (filters?.client) {
    filteredData = filteredData.filter(d => d.client === filters.client);
  }
  if (filters?.date) {
    filteredData = filteredData.filter(d => d.date === filters.date);
  }
  if (filters?.city) {
    filteredData = filteredData.filter(d => d.city.toLowerCase().includes(filters.city!.toLowerCase()));
  }
  
  return filteredData;
}

export async function getHistoricalDemandData(
  dateRange: { start: string; end: string }, // YYYY-MM-DD
  filters?: { client?: ClientName; city?: string }
): Promise<DemandData[]> {
  console.log('Simulating read historical data from Firestore:', dateRange, filters);
  await new Promise(resolve => setTimeout(resolve, 500));
  
  let historicalData = storedDemandData.filter(d => {
    const itemDate = new Date(d.date);
    return itemDate >= new Date(dateRange.start) && itemDate <= new Date(dateRange.end);
  });

  if (filters?.client) {
    historicalData = historicalData.filter(d => d.client === filters.client);
  }
  if (filters?.city) {
    historicalData = historicalData.filter(d => d.city.toLowerCase().includes(filters.city!.toLowerCase()));
  }

  return historicalData.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}


// Basic suggestion logic (placeholder for AI)
export async function generateAreaSuggestions(client?: ClientName, city?: string): Promise<string[]> {
  console.log('Generating basic area suggestions for client:', client, 'city:', city);
  await new Promise(resolve => setTimeout(resolve, 200));
  // Simulate fetching top 5 areas based on recent high demand scores
  const recentData = storedDemandData
    .filter(d => client ? d.client === client : true)
    .filter(d => city ? d.city.toLowerCase() === city.toLowerCase() : true)
    .sort((a, b) => b.demandScore - a.demandScore);
  
  const uniqueAreas = Array.from(new Set(recentData.map(d => d.area)));
  return uniqueAreas.slice(0, 5);
}

export async function getCityDemandSummary(): Promise<CityDemand[]> {
  const data = await getDemandData(); // Fetch all current data
  const cityMap: Record<string, number> = {};
  data.forEach(item => {
    cityMap[item.city] = (cityMap[item.city] || 0) + item.demandScore;
  });
  return Object.entries(cityMap).map(([city, totalDemand]) => ({ city, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}

export async function getClientDemandSummary(): Promise<ClientDemand[]> {
   const data = await getDemandData(); // Fetch all current data
   const clientMap: Record<string, number> = {};
   data.forEach(item => {
     clientMap[item.client] = (clientMap[item.client] || 0) + item.demandScore;
   });
   return Object.entries(clientMap).map(([client, totalDemand]) => ({ client: client as ClientName, totalDemand })).sort((a,b) => b.totalDemand - a.totalDemand);
}
