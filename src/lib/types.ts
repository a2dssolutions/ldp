export type ClientName = 'Zepto' | 'Blinkit' | 'SwiggyFood' | 'SwiggyIM';

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

export interface AreaSuggestion {
  area: string;
  reason?: string; // Optional reason for suggestion
}
