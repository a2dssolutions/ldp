import { AdminPanelClient } from '@/components/features/admin-panel/admin-panel-client';

export default function AdminPanelPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Manage system settings, trigger manual operations, and view logs.
        </p>
      </header>
      <AdminPanelClient />
    </div>
  );
}
