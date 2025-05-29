
import { CityAnalysisClient } from '@/components/features/city-analysis/city-analysis-client';
import { format } from 'date-fns';

export default function CityAnalysisPage() {
  // Determine initial date on the server to ensure consistency
  const todayISOString = new Date().toISOString();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">City Client Activity Analysis</h1>
        <p className="text-sm text-muted-foreground">
          Analyze client presence and top demand areas by city for a selected date.
        </p>
      </header>
      <CityAnalysisClient initialSelectedDate={todayISOString} />
    </div>
  );
}
