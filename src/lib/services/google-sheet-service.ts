
import type { RawSheetData, MergedSheetData, ClientName } from '@/lib/types';

interface ClientSheetConfig {
  url: string;
  idField: string | ((row: Record<string, string>, index: number, client: ClientName) => string);
  cityField: string;
  areaField: string;
  demandScoreField: string | ((row: Record<string, string>) => number);
  rowFilter?: (row: Record<string, string>, headers: string[]) => boolean;
}

export interface ClientFetchResult {
  client: ClientName;
  status: 'success' | 'error' | 'empty';
  message?: string;
  rowCount: number;
}

export interface FetchAllSheetsDataActionResult {
  allMergedData: MergedSheetData[];
  clientResults: ClientFetchResult[];
}

const clientConfigs: Record<ClientName, ClientSheetConfig> = {
  Blinkit: {
    url: 'https://docs.google.com/spreadsheets/d/16wAvZeJxMJBY2uzlisQYNPVeEWcOD1eKohQatPKvD8U/gviz/tq?tqx=out:csv',
    idField: (row, index, client) => row['Store id']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Area', // Blinkit seems to have a dedicated 'Area' column
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
    // Based on sample: Store,City,Morning_FT Demand,Morning_PT Demand,Evening_FT Demand,Evening_PT Demand
    idField: (row, index, client) => row['Store']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Store', // Using 'Store' as the most granular area identifier from the sample
    demandScoreField: (row) => {
      const morningFT = parseInt(row['Morning_FT Demand'], 10) || 0;
      const morningPT = parseInt(row['Morning_PT Demand'], 10) || 0;
      const eveningFT = parseInt(row['Evening_FT Demand'], 10) || 0;
      const eveningPT = parseInt(row['Evening_PT Demand'], 10) || 0;
      return morningFT + morningPT + eveningFT + eveningPT;
    },
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0] && !!row['Store']?.trim(), // Ensure 'Store' column is not empty
  },
};

function parseCSV(csvText: string): { headers: string[], data: Record<string, string>[] } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], data: [] };

  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let currentMatch: RegExpExecArray | null;
    // Regex to handle fields quoted with double quotes, including escaped double quotes ("") inside.
    const regex = /(?:"([^"]*(?:""[^"]*)*)"|([^",]+))(?=,|$)/g;
    
    while ((currentMatch = regex.exec(line)) !== null) {
      // If group 1 (quoted field) is captured, use it and unescape double quotes.
      // Otherwise, use group 2 (unquoted field).
      const value = currentMatch[1] !== undefined ? currentMatch[1].replace(/""/g, '"') : currentMatch[2];
      values.push(value.trim());
    }
    return values;
  };
  
  const rawHeaders = parseLine(lines[0]);
  // Clean headers: trim and remove any empty strings that might result from trailing commas.
  const headers = rawHeaders.map(h => h.trim()).filter(Boolean);

  if (headers.length === 0) return { headers: [], data: [] };

  const dataRows = lines.slice(1);
  const data = dataRows
    .map(line => {
      if (line.trim() === '') return null; // Skip empty lines
      const values = parseLine(line);
      // If a line results in no values but isn't empty (e.g. line of only commas), treat as invalid.
      if (values.length === 0 && line.length > 0) { 
        // console.warn(`Skipping malformed CSV line: ${line}`); // Optional: for debugging
        return null;
      }
      const rowObject: Record<string, string> = {};
      headers.forEach((header, index) => {
        // Assign value if available, otherwise empty string, to prevent 'undefined' issues.
        rowObject[header] = values[index] !== undefined ? values[index] : '';
      });
      return rowObject;
    })
    .filter(Boolean) as Record<string, string>[]; // Filter out nulls (empty/malformed lines)

  return { headers, data };
}

async function fetchSheetDataForClient(client: ClientName): Promise<{ data: MergedSheetData[], result: ClientFetchResult }> {
  console.log(`Fetching real sheet data for ${client}...`);
  const config = clientConfigs[client];
  if (!config) {
    const errorMsg = `No configuration found for client: ${client}`;
    console.error(errorMsg);
    return { data: [], result: { client, status: 'error', message: errorMsg, rowCount: 0 }};
  }

  try {
    const response = await fetch(config.url, { cache: 'no-store' }); // no-store to fetch fresh data
    if (!response.ok) {
      const errorBody = await response.text(); // Attempt to get more details from error body
      const errorMsg = `Failed to fetch sheet for ${client} from ${config.url}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0,500)}`; // Limit body length
      console.error(errorMsg);
      return { data: [], result: { client, status: 'error', message: `HTTP error ${response.status}: ${response.statusText}`, rowCount: 0 }};
    }
    const csvText = await response.text();
    if (!csvText || csvText.trim() === '') {
        // This case means the sheet was fetched but it's empty or only whitespace.
        const msg = `Fetched empty CSV for ${client}.`;
        console.warn(msg + ` URL: ${config.url}`);
        return { data: [], result: { client, status: 'empty', message: msg, rowCount: 0 }};
    }
    
    const { headers: parsedHeaders, data: parsedRows } = parseCSV(csvText);

    // If there are no data rows AFTER parsing, but the original CSV text had more than just a header line,
    // it might indicate a parsing issue or a sheet with only headers and empty/malformed data lines.
    if (parsedRows.length === 0 && csvText.trim().split(/\r?\n/).length > 1) { // Check if original CSV had more than 1 line
        const msg = `No data rows parsed for ${client}, though headers might exist. Check CSV format or content.`;
        console.warn(msg + ` Headers found: ${parsedHeaders.join(', ')}`);
        return { data: [], result: { client, status: 'empty', message: msg, rowCount: 0 }};
    }

    const currentTime = new Date().toISOString();
    const filteredRows = config.rowFilter ? parsedRows.filter(row => config.rowFilter!(row, parsedHeaders)) : parsedRows;

    const clientData = filteredRows.map((row, index) => {
      const id = typeof config.idField === 'function' 
        ? config.idField(row, index, client) 
        : row[config.idField]?.trim() || `${client.toLowerCase()}-gen-${index}-${Date.now()}`; // Fallback ID
      
      const city = row[config.cityField]?.trim() || '';
      const area = row[config.areaField]?.trim() || '';
      
      let demandScore: number;
      if (typeof config.demandScoreField === 'function') {
        demandScore = config.demandScoreField(row);
      } else {
        demandScore = parseInt(row[config.demandScoreField], 10);
      }
      if (isNaN(demandScore)) demandScore = 0; // Default to 0 if demandScore is not a number

      // Basic validation: skip row if essential fields like city or area are missing
      if (!city || !area) {
          // console.warn(`Skipping row for client ${client} due to missing city or area. Row: ${JSON.stringify(row)}`);
          return null; // This will be filtered out later
      }

      return {
        id,
        client,
        city,
        area,
        demandScore,
        timestamp: currentTime,
      };
    }).filter(item => item !== null) as MergedSheetData[]; // Remove null items from mapping

    if (clientData.length === 0 && filteredRows.length > 0) {
      // This means all valid rows were filtered out (e.g. due to missing city/area post initial filter)
      return { data: [], result: { client, status: 'empty', message: 'All valid rows were filtered out (e.g., missing city/area).', rowCount: 0}};
    }
    if (clientData.length === 0 && filteredRows.length === 0) { // No rows after initial filter
      return { data: [], result: { client, status: 'empty', message: 'No data rows found after initial parsing and filtering.', rowCount: 0}};
    }

    return { data: clientData, result: { client, status: 'success', rowCount: clientData.length }};

  } catch (error) {
    // Catch any other unexpected errors during fetch or processing
    const errorMsg = `Error processing sheet for client ${client}: ${error instanceof Error ? error.message : 'An unknown error occurred'}`;
    console.error(errorMsg, error); // Log the full error for server-side debugging
    return { data: [], result: { client, status: 'error', message: errorMsg, rowCount: 0 }};
  }
}

// This function iterates through all configured clients and fetches their data.
export async function fetchAllSheetsData(): Promise<FetchAllSheetsDataActionResult> {
  const clients: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM']; // Ensure this matches your ClientName type and clientConfigs keys
  let allMergedData: MergedSheetData[] = [];
  const clientResults: ClientFetchResult[] = [];

  for (const client of clients) {
    const { data: clientSheetData, result: clientFetchResult } = await fetchSheetDataForClient(client);
    clientResults.push(clientFetchResult); // Store result for each client
    if (clientSheetData && clientSheetData.length > 0) {
      allMergedData = allMergedData.concat(clientSheetData);
    }
  }
  
  // Log summary of fetch operation
  console.log(`Total records fetched and merged from all sheets: ${allMergedData.length}.`);
  clientResults.forEach(res => console.log(`Client: ${res.client}, Status: ${res.status}, Rows: ${res.rowCount}, Message: ${res.message || ''}`));
  return { allMergedData, clientResults };
}

// Placeholder for saving data, not directly used by fetchAllSheetsData but could be by an action.
export async function saveProcessedDemandData(data: MergedSheetData[]): Promise<{ success: boolean; message: string }> {
  // This function would typically interact with a database service (like your Firestore service)
  console.log('Simulating save of processed demand data to Firestore:', data.length, 'records');
  // Example: const result = await saveToFirestore(data); return result;
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulate async operation
  return { success: true, message: `${data.length} records "saved" successfully.` };
}
