
'use server';

import type { RawSheetData, MergedSheetData, ClientName } from '@/lib/types';

interface ClientSheetConfig {
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
  allMergedData: MergedSheetData[]; // Contains data only for successfully fetched clients
  clientResults: ClientFetchResult[]; // Contains status for ALL clients attempted
}

// Client-specific parsing configurations
const clientConfigs: Record<ClientName, Omit<ClientSheetConfig, 'url'>> = {
  Blinkit: {
    idField: (row, index, client) => row['Store id']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Area',
    demandScoreField: 'Daily demand',
     rowFilter: (row) => {
      return !!row['Store id']?.trim() &&
             !!row['City']?.trim() &&
             row['Daily demand'] !== undefined && row['Daily demand']?.trim() !== '' &&
             !!row['Area']?.trim();
    },
  },
  SwiggyFood: {
    idField: (row, index, client) => `${client.toLowerCase()}-${row['City Name']?.trim()}-${row['Area']?.trim()}-${index}`.replace(/\s+/g, '_') || `${client.toLowerCase()}-gen-${index}-${Date.now()}`,
    cityField: 'City Name',
    areaField: 'Area',
    demandScoreField: 'Food',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0] && !!row['City Name']?.trim() && !!row['Area']?.trim() && row['Food'] !== undefined,
  },
  SwiggyIM: {
    idField: (row, index, client) => `${client.toLowerCase()}-${row['City Name']?.trim()}-${row['Area']?.trim()}-${index}`.replace(/\s+/g, '_') || `${client.toLowerCase()}-gen-${index}-${Date.now()}`,
    cityField: 'City Name',
    areaField: 'Area',
    demandScoreField: 'Instamart',
    rowFilter: (row, headers) => !!row[headers[0]] && row[headers[0]] !== headers[0] && !!row['City Name']?.trim() && !!row['Area']?.trim() && row['Instamart'] !== undefined,
  },
  Zepto: {
    idField: (row, index, client) => row['Store']?.trim() || `${client.toLowerCase()}-${index}-${Date.now()}`,
    cityField: 'City',
    areaField: 'Store', // Using 'Store' as area for Zepto as per sample
    demandScoreField: (row) => {
      const morningFT = parseInt(row['Morning_FT Demand'], 10) || 0;
      const morningPT = parseInt(row['Morning_PT Demand'], 10) || 0;
      const eveningFT = parseInt(row['Evening_FT Demand'], 10) || 0;
      const eveningPT = parseInt(row['Evening_PT Demand'], 10) || 0;
      return morningFT + morningPT + eveningFT + eveningPT;
    },
    rowFilter: (row) => !!row['Store']?.trim() && !!row['City']?.trim(),
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
      if (values.length === 0 && line.length > 0 && values.length < headers.length) { 
        console.warn(`Skipping malformed CSV line (fewer values than headers): "${line.substring(0,100)}"`);
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

async function fetchSheetDataForClient(client: ClientName, sheetUrl: string): Promise<{ data: MergedSheetData[], result: ClientFetchResult }> {
  console.log(`Fetching sheet data for ${client} from URL: ${sheetUrl}`);
  const config = clientConfigs[client];
  if (!config) {
    const errorMsg = `No parsing configuration found for client: ${client}`;
    console.error(errorMsg);
    return { data: [], result: { client, status: 'error', message: errorMsg, rowCount: 0 }};
  }
  if (!sheetUrl || sheetUrl.trim() === '') {
    const errorMsg = `No URL configured for client: ${client}`;
    console.error(errorMsg);
    return { data: [], result: { client, status: 'error', message: errorMsg, rowCount: 0 }};
  }

  try {
    const response = await fetch(sheetUrl, { cache: 'no-store' }); 
    if (!response.ok) {
      const errorBody = await response.text();
      const errorMsg = `Failed to fetch sheet for ${client} from ${sheetUrl}: ${response.status} ${response.statusText}. Body: ${errorBody.substring(0,500)}`;
      console.error(errorMsg);
      return { data: [], result: { client, status: 'error', message: `HTTP error ${response.status}`, rowCount: 0 }};
    }
    const csvText = await response.text();
    if (!csvText || csvText.trim() === '') {
        const msg = `Fetched empty CSV for ${client}.`;
        console.warn(msg + ` URL: ${sheetUrl}`);
        return { data: [], result: { client, status: 'empty', message: msg, rowCount: 0 }};
    }
    
    const { headers: parsedHeaders, data: parsedRows } = parseCSV(csvText);

    if (parsedHeaders.length === 0 && parsedRows.length === 0 && csvText.trim().split(/\r?\n/).length <=1) {
         const msg = `Fetched CSV for ${client} appears to be completely empty or just a header.`;
        console.warn(msg + ` URL: ${sheetUrl}`);
        return { data: [], result: { client, status: 'empty', message: msg, rowCount: 0 }};
    }
    
    // Header validation
    const requiredStringHeaders: string[] = [];
    if (typeof config.cityField === 'string') requiredStringHeaders.push(config.cityField);
    if (typeof config.areaField === 'string') requiredStringHeaders.push(config.areaField);
    if (typeof config.demandScoreField === 'string') requiredStringHeaders.push(config.demandScoreField);
    // ID field is trickier as it can be a function

    for (const headerName of requiredStringHeaders) {
        if (!parsedHeaders.includes(headerName)) {
            const errorMsg = `Missing required header "${headerName}" in sheet for client: ${client}. Available headers: ${parsedHeaders.join(', ')}`;
            console.error(errorMsg);
            return { data: [], result: { client, status: 'error', message: `Missing header: ${headerName}`, rowCount: 0 }};
        }
    }

    if (parsedRows.length === 0 && csvText.trim().split(/\r?\n/).length > 1) { 
        const msg = `No data rows parsed for ${client}, though headers might exist. Check CSV format or content.`;
        console.warn(msg + ` Headers found: ${parsedHeaders.join(', ')}`);
        return { data: [], result: { client, status: 'empty', message: msg, rowCount: 0 }};
    }

    const currentTime = new Date().toISOString();
    const filteredRows = config.rowFilter ? parsedRows.filter(row => config.rowFilter!(row, parsedHeaders)) : parsedRows;

    const clientData = filteredRows.map((row, index) => {
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

       if (!city && typeof config.cityField === 'string' && config.cityField !== '') { 
            console.warn(`Skipping row for client ${client} due to missing city based on config. Row: ${JSON.stringify(row).substring(0,100)}`);
            return null;
       }
       if (!area && typeof config.areaField === 'string' && config.areaField !== '') {
           console.warn(`Skipping row for client ${client} due to missing area based on config. Row: ${JSON.stringify(row).substring(0,100)}`);
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

    if (clientData.length === 0 && filteredRows.length > 0) {
      return { data: [], result: { client, status: 'empty', message: 'Valid rows filtered out (e.g., missing city/area).', rowCount: 0}};
    }
    if (clientData.length === 0 && filteredRows.length === 0 && parsedRows.length === 0) { 
      return { data: [], result: { client, status: 'empty', message: 'No data rows found after initial parsing.', rowCount: 0}};
    }

    return { data: clientData, result: { client, status: 'success', rowCount: clientData.length }};

  } catch (error) {
    const errorMsg = `Error processing sheet for client ${client}: ${error instanceof Error ? error.message : 'An unknown error occurred'}`;
    console.error(errorMsg, error); 
    return { data: [], result: { client, status: 'error', message: errorMsg.substring(0, 200), rowCount: 0 }}; // Truncate long messages
  }
}


export async function fetchAllSheetsData(
    sheetUrlsByName: Record<ClientName, string>, 
    clientsToFetch?: ClientName[]
): Promise<FetchAllSheetsDataActionResult> {
  
  const clientsToProcess = clientsToFetch && clientsToFetch.length > 0 
    ? clientsToFetch 
    : Object.keys(sheetUrlsByName) as ClientName[];

  let allMergedData: MergedSheetData[] = [];
  const clientResults: ClientFetchResult[] = [];

  for (const client of clientsToProcess) {
    const urlForClient = sheetUrlsByName[client]; 
    if (!urlForClient) {
      console.warn(`URL not found for client ${client} in app settings. Skipping.`);
      clientResults.push({ client, status: 'error', message: `URL not configured for ${client}.`, rowCount: 0 });
      continue;
    }
    const { data: clientSheetData, result: clientFetchResult } = await fetchSheetDataForClient(client, urlForClient);
    clientResults.push(clientFetchResult); 
    if (clientSheetData && clientSheetData.length > 0) {
      allMergedData = allMergedData.concat(clientSheetData);
    }
  }
  
  console.log(`Total records fetched and merged from selected/all sheets: ${allMergedData.length}.`);
  clientResults.forEach(res => console.log(`Client: ${res.client}, Status: ${res.status}, Rows: ${res.rowCount}, Message: ${res.message || ''}`));
  return { allMergedData, clientResults };
}

    