import { DataIngestionClient } from '@/components/features/data-ingestion/data-ingestion-client';

export default function DataIngestionPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Data Ingestion</h1>
        <p className="text-muted-foreground">
          Fetch data from Google Sheets, preview it, and upload to the system.
        </p>
      </header>
      <DataIngestionClient />
    </div>
  );
}
