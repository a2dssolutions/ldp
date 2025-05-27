import { AdminPanelClient } from '@/components/features/admin-panel/admin-panel-client';

export default function AdminPanelPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage system settings, trigger manual operations, and view logs.
        </p>
      </header>
      <AdminPanelClient />
    </div>
  );
}
