
import { SettingsClient } from '@/components/features/settings/settings-client';

export default function SettingsPage() {
  // In a real app, you might fetch user-specific settings here if needed
  // or pass server-side configurations to the client component.

  // For now, we'll define the sheet URLs here and pass them.
  // Ideally, these would come from a centralized configuration or environment variables
  // accessible on the server. For simplicity in this step, they are hardcoded.
  const sheetConfigs = {
    Blinkit: 'https://docs.google.com/spreadsheets/d/16wAvZeJxMJBY2uzlisQYNPVeEWcOD1eKohQatPKvD8U/gviz/tq?tqx=out:csv',
    SwiggyFood: 'https://docs.google.com/spreadsheets/d/160jz7oIaRpXyIbGdzY3yH5EzEPizrxQ0GUhdylJuAV4/gviz/tq?tqx=out:csv',
    SwiggyIM: 'https://docs.google.com/spreadsheets/d/1__vqRu9WBTnv8Ptp1vlRUVBDvKCIfrR-Rq-eU5iKEa4/gviz/tq?tqx=out:csv',
    Zepto: 'https://docs.google.com/spreadsheets/d/1VrHYofM707-7lC7cglbGzArKsJVYqjZN303weUEmGo8/gviz/tq?tqx=out:csv',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Application Settings</h1>
        <p className="text-muted-foreground">
          Manage application configurations and user preferences.
        </p>
      </header>
      <SettingsClient sheetConfigs={sheetConfigs} />
    </div>
  );
}
