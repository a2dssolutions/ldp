import type { RawSheetData, MergedSheetData, ClientName } from '@/lib/types';

const MOCK_CITIES = ['Metropolis', 'Gotham', 'Star City', 'Central City'];
const MOCK_AREAS_PREFIX = ['Downtown', 'Uptown', 'Midtown', 'Suburb', 'Industrial Park', 'Tech Hub', 'Riverfront', 'Market Square'];

function generateMockData(client: ClientName, count: number = 20): MergedSheetData[] {
  const data: MergedSheetData[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const city = MOCK_CITIES[Math.floor(Math.random() * MOCK_CITIES.length)];
    const area = `${MOCK_AREAS_PREFIX[Math.floor(Math.random() * MOCK_AREAS_PREFIX.length)]} ${city.substring(0,3)}${i+1}`;
    const date = new Date(today);
    date.setDate(today.getDate() - Math.floor(Math.random() * 7)); // Data from the last 7 days
    
    data.push({
      id: `${client.toLowerCase()}-${i}-${Date.now()}`,
      client,
      demandScore: Math.floor(Math.random() * 100) + 1,
      area,
      city,
      timestamp: date.toISOString(),
    });
  }
  return data;
}

const mockSheetData: Record<ClientName, MergedSheetData[]> = {
  Zepto: generateMockData('Zepto'),
  Blinkit: generateMockData('Blinkit'),
  SwiggyFood: generateMockData('SwiggyFood'),
  SwiggyIM: generateMockData('SwiggyIM'),
};

// Simulates fetching CSV/JSON from a sheet URL for a specific client
async function fetchSheetDataForClient(client: ClientName): Promise<MergedSheetData[]> {
  console.log(`Simulating fetch for ${client}...`);
  await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
  return mockSheetData[client] || [];
}

// Fetches data for all clients, normalizes structure, and merges
export async function fetchAllSheetsData(): Promise<MergedSheetData[]> {
  const clients: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
  let allData: MergedSheetData[] = [];

  for (const client of clients) {
    const clientData = await fetchSheetDataForClient(client);
    allData = allData.concat(clientData);
  }
  
  console.log('Simulated fetching and merging all sheets data.');
  return allData;
}

// Simulates saving processed data (e.g., to Firestore)
export async function saveProcessedDemandData(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  console.log('Simulating save of processed demand data to Firestore:', data.length, 'records');
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate save delay
  return { success: true, message: `${data.length} records "saved" successfully.` };
}
