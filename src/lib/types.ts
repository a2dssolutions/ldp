
export type ClientName = 'Zepto' | 'Blinkit' | 'SwiggyFood' | 'SwiggyIM';
export const ALL_CLIENT_NAMES: ClientName[] = ['Zepto', 'Blinkit', 'SwiggyFood', 'SwiggyIM'];

export interface RawSheetData {
  id: string;
  demandScore: number;
  area: string;
  city: string;
  timestamp: string; // ISO string for date
}

export interface MergedSheetData extends RawSheetData {
  client: ClientName;
}

export interface DemandData extends MergedSheetData {
  date: string; // YYYY-MM-DD format for easier filtering
}

export interface CityDemand {
  city: string;
  totalDemand: number;
}

export interface ClientDemand {
  client: ClientName;
  totalDemand: number;
}

export interface AreaDemand {
  area: string;
  city: string;
  totalDemand: number;
  clients: ClientName[];
}

export interface MultiClientHotspotCity {
  city: string;
  activeClients: ClientName[];
  totalDemand: number;
  clientCount: number;
}

// For Dexie local sync status
export interface LocalSyncMeta {
  id: string; // e.g., 'lastSyncStatus'
  timestamp: number | null; // Store as number (Date.getTime())
}

export interface CityClientMatrixRow {
  city: string;
  blinkit: boolean;
  zepto: boolean;
  swiggyFood: boolean;
  swiggyIM: boolean;
  highDemandAreas: string;
  activeSelectedClientCount: number;
}

export type HealthCheckStatus = 'success' | 'url_error' | 'header_mismatch' | 'empty_sheet' | 'not_configured' | 'parse_error' | 'pending' | 'initial';

export interface ClientHealthStatus {
  client: ClientName;
  status: HealthCheckStatus;
  message?: string;
  expectedHeaders?: string[];
  foundHeaders?: string[];
  url?: string;
}

export type DataSourceTestResult = ClientHealthStatus[];
