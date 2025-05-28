import { AreaSuggestionsClient } from '@/components/features/area-suggestions/area-suggestions-client';

export default function AreaSuggestionsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Area Suggestions</h1>
        <p className="text-sm text-muted-foreground">
          Get AI-powered suggestions for top areas to post jobs based on current demand data.
        </p>
      </header>
      <AreaSuggestionsClient />
    </div>
  );
}
