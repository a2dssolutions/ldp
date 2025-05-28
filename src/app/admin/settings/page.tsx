
import { SettingsClient } from '@/components/features/settings/settings-client';
import { getAppSettingsAction } from '@/lib/actions';

export default async function SettingsPage() {
  const appSettings = await getAppSettingsAction();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Application Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage application configurations and user preferences. Settings are persisted in Firestore.
        </p>
      </header>
      <SettingsClient initialSettings={appSettings} />
    </div>
  );
}
