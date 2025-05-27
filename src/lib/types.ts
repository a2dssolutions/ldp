
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

export interface AreaSuggestion {
  area: string;
  reason?: string; // Optional reason for suggestion
}

// For forecasting flow
export interface ForecastDemandInput {
  client?: ClientName;
  city?: string;
  area?: string;
  historicalDays?: number; // Number of past days data to consider
}

export interface ForecastDemandOutput {
  forecastPeriod: string; // e.g., "Next 7 days"
  predictedDemandTrend: string; // e.g., "Stable", "Increasing", "Decreasing"
  confidence?: string; // e.g., "High", "Medium", "Low"
  narrative: string; // Textual explanation
}
