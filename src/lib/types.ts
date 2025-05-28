
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
  // any additional processed fields can be added here
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
  city: string; // It's useful to know the city for an area
  totalDemand: number;
  clients: ClientName[]; // List of clients contributing to this area's demand
}

export interface MultiClientHotspotCity {
  city: string;
  activeClients: ClientName[];
  totalDemand: number;
  clientCount: number;
}

export interface CityWithSingleClient {
  city: string;
  client: ClientName;
}

export interface PostingSuggestions {
  commonCities: string[];
  singleClientCities: CityWithSingleClient[];
}
