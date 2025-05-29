
import { DemandHistoryClient } from '@/components/features/demand-history/demand-history-client';
import { subDays } from 'date-fns';

export default function DemandHistoryPage() {
  const today = new Date();
  const initialFrom = subDays(today, 7);

  // Pass ISO strings to the client component
  const initialFromDateISO = initialFrom.toISOString();
  const initialToDateISO = today.toISOString();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Demand History</h1>
        <p className="text-sm text-muted-foreground">
          Explore historical demand data, view trends, and analyze past performance.
        </p>
      </header>
      <DemandHistoryClient 
        initialFromDate={initialFromDateISO}
        initialToDate={initialToDateISO}
      />
    </div>
  );
}
