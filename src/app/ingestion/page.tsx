import { DataIngestionClient } from '@/components/features/data-ingestion/data-ingestion-client';

export default function DataIngestionPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Data Ingestion</h1>
        <p className="text-sm text-muted-foreground">
          Fetch data from Google Sheets, preview it, and upload to the system.
        </p>
      </header>
      <DataIngestionClient />
    </div>
  );
}
