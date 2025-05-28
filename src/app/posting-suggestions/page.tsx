
import { PostingSuggestionsClient } from '@/components/features/posting-suggestions/posting-suggestions-client';
import { ALL_CLIENT_NAMES } from '@/lib/types';

export default async function PostingSuggestionsPage() {
  const initialDate = new Date(); // Server-rendered date
  // For simplicity, we pass all known client names.
  // The client component will manage selection, and the server action will filter based on actual data.
  const initialClients = ALL_CLIENT_NAMES;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Posting Suggestions</h1>
        <p className="text-sm text-muted-foreground">
          Discover cities with shared client demand or unique client presence based on daily data.
        </p>
      </header>
      <PostingSuggestionsClient
        initialSelectedDate={initialDate}
        allAvailableClients={initialClients}
      />
    </div>
  );
}
