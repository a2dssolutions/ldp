
'use server';

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { ClientName } from '@/lib/types';

const CONFIG_COLLECTION = 'jps_config';
const APP_SETTINGS_DOC_ID = 'appSettings';

export interface AppSettings {
  sheetUrls: Record<ClientName, string>;
  theme: 'light' | 'dark';
  defaultDateRange: string; // e.g., 'today', 'yesterday'
  blacklistedCities: string[];
  cityMappings: Record<string, string>; // FromName: ToName
}

// Define default settings, especially sheet URLs which might be initially hardcoded
// These defaults will be used if no settings are found in Firestore.
const DEFAULT_SHEET_URLS: Record<ClientName, string> = {
  Blinkit: 'https://docs.google.com/spreadsheets/d/16wAvZeJxMJBY2uzlisQYNPVeEWcOD1eKohQatPKvD8U/gviz/tq?tqx=out:csv',
  SwiggyFood: 'https://docs.google.com/spreadsheets/d/160jz7oIaRpXyIbGdzY3yH5EzEPizrxQ0GUhdylJuAV4/gviz/tq?tqx=out:csv',
  SwiggyIM: 'https://docs.google.com/spreadsheets/d/1__vqRu9WBTnv8Ptp1vlRUVBDvKCIfrR-Rq-eU5iKEa4/gviz/tq?tqx=out:csv',
  Zepto: 'https://docs.google.com/spreadsheets/d/1VrHYofM707-7lC7cglbGzArKsJVYqjZN303weUEmGo8/gviz/tq?tqx=out:csv',
};

const DEFAULT_SETTINGS: AppSettings = {
  sheetUrls: DEFAULT_SHEET_URLS,
  theme: 'light',
  defaultDateRange: 'today',
  blacklistedCities: [],
  cityMappings: {}, // Initialize as empty object
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const docRef = doc(db, CONFIG_COLLECTION, APP_SETTINGS_DOC_ID);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as Partial<AppSettings>;
      // Merge with defaults to ensure all fields are present
      return {
        sheetUrls: { ...DEFAULT_SHEET_URLS, ...data.sheetUrls },
        theme: data.theme || DEFAULT_SETTINGS.theme,
        defaultDateRange: data.defaultDateRange || DEFAULT_SETTINGS.defaultDateRange,
        blacklistedCities: Array.isArray(data.blacklistedCities) ? data.blacklistedCities : DEFAULT_SETTINGS.blacklistedCities,
        cityMappings: typeof data.cityMappings === 'object' && data.cityMappings !== null ? data.cityMappings : DEFAULT_SETTINGS.cityMappings,
      };
    } else {
      console.log('No app settings found in Firestore, returning default settings and attempting to save them.');
      await setDoc(docRef, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    }
  } catch (error) {
    console.error("Error fetching app settings from Firestore:", error);
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(settings: Partial<AppSettings>): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = doc(db, CONFIG_COLLECTION, APP_SETTINGS_DOC_ID);
    const currentSettings = await getAppSettings(); 
    // Ensure cityMappings is always an object, even if `settings.cityMappings` is not provided or null
    const newCityMappings = settings.cityMappings ?? currentSettings.cityMappings;
    const newSettings = { 
        ...currentSettings, 
        ...settings,
        cityMappings: typeof newCityMappings === 'object' && newCityMappings !== null ? newCityMappings : {},
    };

    await setDoc(docRef, newSettings, { merge: true }); 
    return { success: true, message: 'Application settings saved successfully.' };
  } catch (error) {
    console.error("Error saving app settings to Firestore:", error);
    return { success: false, message: `Failed to save settings: ${error instanceof Error ? error.message : String(error)}` };
  }
}
