
'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClientName } from '@/lib/types';
import { FileSpreadsheet, Palette, UserCog } from 'lucide-react';

interface SettingsClientProps {
  sheetConfigs: Record<ClientName, string>;
}

export function SettingsClient({ sheetConfigs }: SettingsClientProps) {
  const [isDarkMode, setIsDarkMode] = useState(false); // Placeholder state
  const [defaultDateRange, setDefaultDateRange] = useState('today'); // Placeholder state

  // In a real app, these states would be loaded from localStorage or user profile
  // and handlers would save changes.

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Data Source Configuration
          </CardTitle>
          <CardDescription>
            View the configured Google Sheet URLs for each data source. These are currently read-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(sheetConfigs).map(([client, url]) => (
            <div key={client} className="space-y-1">
              <Label htmlFor={`sheet-url-${client}`} className="font-semibold">{client as ClientName}</Label>
              <Input
                id={`sheet-url-${client}`}
                value={url}
                readOnly
                className="bg-muted/50 cursor-not-allowed"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Appearance
          </CardTitle>
          <CardDescription>
            Customize the look and feel of the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between space-x-2 p-2 border rounded-lg">
            <Label htmlFor="dark-mode-switch" className="flex flex-col space-y-1">
              <span>Dark Mode</span>
              <span className="font-normal leading-snug text-muted-foreground">
                Enable or disable dark theme. (UI Placeholder)
              </span>
            </Label>
            <Switch
              id="dark-mode-switch"
              checked={isDarkMode}
              onCheckedChange={setIsDarkMode}
              disabled // Placeholder, actual implementation needed
            />
          </div>
          <Button variant="outline" className="w-full" disabled>More Appearance Settings (Coming Soon)</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            User Preferences
          </CardTitle>
          <CardDescription>
            Set your default preferences for the application.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="default-date-range">Default Dashboard Date</Label>
            <Select
              value={defaultDateRange}
              onValueChange={setDefaultDateRange}
              disabled // Placeholder
            >
              <SelectTrigger id="default-date-range">
                <SelectValue placeholder="Select default range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="last7days">Last 7 Days</SelectItem>
                <SelectItem value="last30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
             <p className="text-xs text-muted-foreground">
               Select the default date/range for the dashboard. (UI Placeholder)
            </p>
          </div>
          <Button variant="outline" className="w-full" disabled>Save Preferences (Coming Soon)</Button>
        </CardContent>
      </Card>
    </div>
  );
}
