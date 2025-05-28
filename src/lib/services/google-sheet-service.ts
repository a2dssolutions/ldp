
import type { RawSheetData, MergedSheetData, ClientName } from '@/lib/types';

interface ClientSheetConfig {
  url: string;
  idField: string | ((row: Record<string, string>, index: number, client: ClientName) => string);
  cityField: string;
  areaField: string;
  demandScoreField: string | ((row: Record<string, string>) => number);
  rowFilter?: (row: Record<string, string>, headers: string[]) => boolean;
}

interface FetchAllResult {
  allMergedData: MergedSheetData[];
  errors: Array<{ client: ClientName; message: string }>;
}

const clientConfigs: Record<ClientName, ClientSheetConfig> = {
  Blinkit: {
    url: 'https://docs.google.com/spreadsheets/d/16wAvZeJxMJBY2uzlisQYNPVeEWcOD1eKohQatPKvD8U/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => row['Store id']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Area',
    demandScoreField: 'Daily demand',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0], 
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
    areaField: 'Store', 
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

function parseCSV(csvText: string): { headers: string[], data: Record<string, string>[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], data: [] };

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let currentMatch: RegExpExecArray | null;
    const regex = /(?:"([^"]*(?:""[^"]*)*)"|([^",]+))(?=,|$)/g;
    
    while ((currentMatch = regex.exec(line)) !== null) {
      const value = currentMatch[1] !== undefined ? currentMatch[1].replace(/""/g, '"') : currentMatch[2];
      values.push(value.trim());
    }
    return values;
  };
  
  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(h => h.trim()).filter(Boolean);

  if (headers.length === 0) return { headers: [], data: [] };

  const dataRows = lines.slice(1);
  const data = dataRows
    .map(line => {
      if (line.trim() === '') return null;
      const values = parseLine(line);
      if (values.length === 0 && line.length > 0) { // Handle lines that are just commas
        return null;
      }
      const rowObject: Record<string, string> = {};
      headers.forEach((header, index) => {
        rowObject[header] = values[index] !== undefined ? values[index] : '';
      });
      return rowObject;
    })
    .filter(Boolean) as Record<string, string>[];

  return { headers, data };
}

async function fetchSheetDataForClient(client: ClientName): Promise<MergedSheetData[]> {
  console.log(`Fetching real sheet data for ${client}...`);
  const config = clientConfigs[client];
  if (!config) {
    throw new Error(`No configuration found for client: ${client}`);
  }

  const response = await fetch(config.url, { cache: 'no-store' });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Failed to fetch sheet for ${client} from ${config.url}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0,500)}`);
    throw new Error(`Failed to fetch sheet for ${client}: ${response.statusText}`);
  }
  const csvText = await response.text();
  if (!csvText || csvText.trim() === '') {
      console.warn(`Fetched empty CSV for ${client} from ${config.url}`);
      return []; // Return empty if sheet is empty, not an error in itself
  }
  
  const { headers: parsedHeaders, data: parsedRows } = parseCSV(csvText);

  if (parsedRows.length === 0 && csvText.trim().split(/\r?\n/).length > 1) { // More than 1 line means headers were there but no data rows
      console.warn(`No data rows parsed for ${client} from URL: ${config.url}, though headers might exist. Headers found: ${parsedHeaders.join(', ')}`);
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

    if (!city || !area) {
        console.warn(`Skipping row for client ${client} due to missing city or area. Row: ${JSON.stringify(row)}`);
        return null;
    }

    return {
      id,
      client,
      city,
      area,
      demandScore,
      timestamp: currentTime,
    };
  }).filter(item => item !== null) as MergedSheetData[];
}

export async function fetchAllSheetsData(): Promise<FetchAllResult> {
  const clients: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];
  let allMergedData: MergedSheetData[] = [];
  const errors: Array<{ client: ClientName; message: string }> = [];

  for (const client of clients) {
    try {
      const clientData = await fetchSheetDataForClient(client);
      if (clientData && clientData.length > 0) {
        allMergedData = allMergedData.concat(clientData);
      } else {
        console.warn(`No data retrieved or processed for client: ${client}`);
        // Optionally, add a non-error entry if needed:
        // errors.push({ client, message: "No data found or processed for this client." });
      }
    } catch (error) {
      console.error(`Error processing sheet for client ${client}:`, error);
      errors.push({
        client,
        message: error instanceof Error ? error.message : 'An unknown error occurred',
      });
    }
  }
  
  console.log(`Total records fetched and merged from all sheets: ${allMergedData.length}. Errors: ${errors.length}`);
  return { allMergedData, errors };
}

export async function saveProcessedDemandData(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  console.log('Simulating save of processed demand data to Firestore:', data.length, 'records');
  await new Promise(resolve => setTimeout(resolve, 300));
  return { success: true, message: `${data.length} records "saved" successfully.` };
}
