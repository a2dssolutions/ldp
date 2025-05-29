
import { AdminPanelClient } from '@/components/features/admin-panel/admin-panel-client';
import { getAppSettingsAction } from '@/lib/actions';
import type { AppSettings } from '@/lib/services/config-service';

export default async function AdminPanelPage() {
  const appSettings: AppSettings = await getAppSettingsAction();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Manage system settings, trigger manual operations, and view logs.
        </p>
      </header>
      <AdminPanelClient initialSettings={appSettings} />
    </div>
  );
}
