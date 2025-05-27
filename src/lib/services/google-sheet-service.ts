
import type { RawSheetData, MergedSheetData, ClientName } from '@/lib/types';

interface ClientSheetConfig {
  url: string;
  idField: string | ((row: Record<string, string>, index: number, client: ClientName) => string);
  cityField: string;
  areaField: string;
  demandScoreField: string | ((row: Record<string, string>) => number);
  // Optional function to pre-process rows if needed, e.g., filter out headers incorrectly parsed as data
  rowFilter?: (row: Record<string, string>, headers: string[]) => boolean;
}

const clientConfigs: Record<ClientName, ClientSheetConfig> = {
  Blinkit: {
    url: 'https://docs.google.com/spreadsheets/d/16wAvZeJxMJBY2uzlisQYNPVeEWcOD1eKohQatPKvD8U/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => row['Store id']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Area',
    demandScoreField: 'Daily demand',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0], // Ensure first column is not empty and not header
  },
  SwiggyFood: {
    url: 'https://docs.google.com/spreadsheets/d/160jz7oIaRpXyIbGdzY3yH5EzEPizrxQ0GUhdylJuAV4/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => `${client.toLowerCase()}-${row['City Name']?.trim()}-${row['Area']?.trim()}-${index}`.replace(/\s+/g, '_') || `${client.toLowerCase()}-gen-${index}-${Date.now()}`,
    cityField: 'City Name',
    areaField: 'Area',
    demandScoreField: 'Food',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0],
  },
  SwiggyIM: {
    url: 'https://docs.google.com/spreadsheets/d/1__vqRu9WBTnv8Ptp1vlRUVBDvKCIfrR-Rq-eU5iKEa4/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => `${client.toLowerCase()}-${row['City Name']?.trim()}-${row['Area']?.trim()}-${index}`.replace(/\s+/g, '_') || `${client.toLowerCase()}-gen-${index}-${Date.now()}`,
    cityField: 'City Name',
    areaField: 'Area',
    demandScoreField: 'Instamart',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0],
  },
  Zepto: {
    url: 'https://docs.google.com/spreadsheets/d/1VrHYofM707-7lC7cglbGzArKsJVYqjZN303weUEmGo8/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => row['Store']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Store', // Using 'Store' as area identifier
    demandScoreField: (row) => {
      const morningFT = parseInt(row['Morning_FT Demand'], 10) || 0;
      const morningPT = parseInt(row['Morning_PT Demand'], 10) || 0;
      const eveningFT = parseInt(row['Evening_FT Demand'], 10) || 0;
      const eveningPT = parseInt(row['Evening_PT Demand'], 10) || 0;
      return morningFT + morningPT + eveningFT + eveningPT;
    },
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0],
  },
};

// Basic CSV parser
function parseCSV(csvText: string): { headers: string[], data: Record<string, string>[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], data: [] };

  // Regex to split CSV line, handling quoted fields. Strips surrounding quotes from fields.
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let currentMatch: RegExpExecArray | null;
    // This regex captures fields separated by commas, respecting double quotes
    // It handles fields with commas inside if they are quoted.
    // It also removes the surrounding quotes from the captured group.
    const regex = /(?:"([^"]*(?:""[^"]*)*)"|([^",]+))(?=,|$)/g;
    
    while ((currentMatch = regex.exec(line)) !== null) {
      // If group 1 (quoted) is matched, use it; otherwise use group 2 (unquoted).
      // Replace double double quotes with single double quotes.
      const value = currentMatch[1] !== undefined ? currentMatch[1].replace(/""/g, '"') : currentMatch[2];
      values.push(value.trim());
    }
    return values;
  };
  
  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim()).filter(Boolean); // Ensure headers are trimmed and not empty

  if (headers.length === 0) return { headers: [], data: [] };

  const dataRows = lines.slice(1);
  const data = dataRows
    .map(line => {
      if (line.trim() === '') return null; // Skip empty lines
      const values = parseLine(line);
      const rowObject: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObject[header] = values[index] !== undefined ? values[index] : '';
      });
      return rowObject;
    })
    .filter(Boolean) as Record<string, string>[]; // Filter out nulls from empty lines

  return { headers, data };
}


// Simulates fetching CSV/JSON from a sheet URL for a specific client
async function fetchSheetDataForClient(client: ClientName): Promise<MergedSheetData[]> {
  console.log(`Fetching real sheet data for ${client}...`);
  const config = clientConfigs[client];
  if (!config) {
    console.error(`No configuration found for client: ${client}`);
    return [];
  }

  try {
    const response = await fetch(config.url, { cache: 'no-store' }); // Disable caching for fresh data
    if (!response.ok) {
      console.error(`Failed to fetch sheet for ${client} from ${config.url}: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error(`Error body: ${errorBody.substring(0, 500)}`);
      return [];
    }
    const csvText = await response.text();
    if (!csvText || csvText.trim() === '') {
        console.warn(`Fetched empty CSV for ${client} from ${config.url}`);
        return [];
    }
    
    const { headers: parsedHeaders, data: parsedRows } = parseCSV(csvText);

    if (parsedRows.length === 0) {
        console.warn(`No data rows parsed for ${client} from URL: ${config.url}. Headers found: ${parsedHeaders.join(', ')}`);
        return [];
    }

    const currentTime = new Date().toISOString();
    const filteredRows = config.rowFilter ? parsedRows.filter(row => config.rowFilter!(row, parsedHeaders)) : parsedRows;

    return filteredRows.map((row, index) => {
      const id = typeof config.idField === 'function' 
        ? config.idField(row, index, client) 
        : row[config.idField]?.trim() || `${client.toLowerCase()}-gen-${index}-${Date.now()}`;
      
      const city = row[config.cityField]?.trim() || '';
      const area = row[config.areaField]?.trim() || '';
      
      let demandScore: number;
      if (typeof config.demandScoreField === 'function') {
        demandScore = config.demandScoreField(row);
      } else {
        demandScore = parseInt(row[config.demandScoreField], 10);
      }
      if (isNaN(demandScore)) demandScore = 0;

      return {
        id,
        client,
        city,
        area,
        demandScore,
        timestamp: currentTime,
      };
    }).filter(item => item.city && item.area); // Ensure essential fields are present

  } catch (error) {
    console.error(`Error processing sheet for ${client} (${config.url}):`, error);
    return [];
  }
}

// Fetches data for all clients, normalizes structure, and merges
export async function fetchAllSheetsData(): Promise<MergedSheetData[]> {
  const clients: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
  let allData: MergedSheetData[] = [];

  for (const client of clients) {
    const clientData = await fetchSheetDataForClient(client);
    if (clientData && clientData.length > 0) {
      allData = allData.concat(clientData);
    } else {
      console.warn(`No data retrieved for client: ${client}`);
    }
  }
  
  console.log(`Total records fetched and merged from all sheets: ${allData.length}`);
  return allData;
}

// Simulates saving processed data (e.g., to Firestore)
export async function saveProcessedDemandData(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  console.log('Simulating save of processed demand data to Firestore:', data.length, 'records');
  // This is where you'd interact with Firestore or another database
  // For now, it's just a placeholder
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate save delay
  return { success: true, message: `${data.length} records "saved" successfully.` };
}
