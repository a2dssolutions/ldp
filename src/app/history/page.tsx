import { DemandHistoryClient } from '@/components/features/demand-history/demand-history-client';

export default function DemandHistoryPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Demand History</h1>
        <p className="text-muted-foreground">
          Explore historical demand data, view trends, and analyze past performance.
        </p>
      </header>
      <DemandHistoryClient />
    </div>
  );
}
