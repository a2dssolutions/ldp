
import Dexie, { type Table } from 'dexie';
import type { DemandData } from './types';

export interface LocalSyncMeta {
  id: string; // e.g., 'lastSyncStatus'
  timestamp: number | null; // Store as number (Date.getTime())
}

export interface LocalDemandRecord extends DemandData {
  localId?: number; // Dexie adds this if it's an auto-incrementing primary key
}

export class LocalDexieDB extends Dexie {
  demandRecords!: Table<LocalDemandRecord, number>; // Primary key is number (localId)
  meta!: Table<LocalSyncMeta, string>; // Primary key is string (id of meta record)

  constructor() {
    super('DemandInsightsDB');
    this.version(2).stores({
      demandRecords: '++localId, id, date, client, city, area, demandScore', // localId auto-incrementing, id is original, date for querying
      meta: 'id', // 'lastSyncStatus'
    });
    // Schema v1 for initial setup with just demandRecords and meta
    this.version(1).stores({
      demandRecords: 'id, date, client, city, area, demandScore', // 'id' is the primary key from DemandData
      meta: 'id', // For storing 'lastSyncStatus'
    }).upgrade(tx => {
      // Potential future upgrade logic if needed
      // For v2, we changed primary key handling for demandRecords, so this might involve data migration in real scenario
      // For simplicity here, we are just defining v2 to potentially use auto-incrementing primary key if 'id' from DemandData is problematic.
      // If upgrading from a version where demandRecords primary key was 'id', and 'id' is not unique, this needs careful handling.
      // For now, assuming 'id' is intended to be the unique key from source.
      // The 'date' field will be indexed for efficient queries.
    });
     // Simpler v1 for initial setup, ensuring 'date' is indexed.
     // The 'id' field (from DemandData) will be the primary key.
     this.demandRecords.mapToClass(Object); // Keep as plain objects
     this.meta.mapToClass(Object);
  }
}

export const localDb = new LocalDexieDB();
