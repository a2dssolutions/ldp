
import { DemandForecastingClient } from '@/components/features/demand-forecasting/demand-forecasting-client';

export default function DemandForecastingPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Demand Forecasting</h1>
        <p className="text-muted-foreground">
          Use historical data and AI to predict future job posting needs.
        </p>
      </header>
      <DemandForecastingClient />
    </div>
  );
}
