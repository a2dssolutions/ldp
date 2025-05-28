
'use client';

import type { ChangeEvent } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClientName } from '@/lib/types';
import { FileSpreadsheet, Palette, UserCog, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SettingsClientProps {
  sheetConfigs: Record<ClientName, string>;
}

const LOCAL_STORAGE_KEYS = {
  THEME: 'app-theme',
  DEFAULT_DATE_RANGE: 'app-default-date-range',
};

export function SettingsClient({ sheetConfigs: initialSheetConfigs }: SettingsClientProps) {
  const [sheetUrls, setSheetUrls] = useState<Record<ClientName, string>>(initialSheetConfigs);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [defaultDateRange, setDefaultDateRange] = useState('today');
  const [hasChanges, setHasChanges] = useState(false); // For data source URLs
  const { toast } = useToast();

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(LOCAL_STORAGE_KEYS.THEME);
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }

    const savedDateRange = localStorage.getItem(LOCAL_STORAGE_KEYS.DEFAULT_DATE_RANGE);
    if (savedDateRange) {
      setDefaultDateRange(savedDateRange);
    }
  }, []);

  const handleUrlChange = (client: ClientName, value: string) => {
    setSheetUrls(prev => ({ ...prev, [client]: value }));
    setHasChanges(true);
  };

  const handleSaveSheetUrls = () => {
    // Placeholder for actual saving logic (e.g., API call to update server config or Firestore)
    console.log('Saving sheet URLs (placeholder):', sheetUrls);
    toast({
      title: 'Data Source URLs Updated (Placeholder)',
      description: 'In a real app, these URLs would be saved to the backend.',
    });
    setHasChanges(false);
    // For now, we're not actually persisting these beyond component state for this iteration.
    // To make them persist on the client temporarily, you could use localStorage here too,
    // but ideally, these are server-side settings.
  };

  const handleDarkModeToggle = (checked: boolean) => {
    setIsDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, 'dark');
      toast({ title: 'Appearance Updated', description: 'Dark mode enabled.' });
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(LOCAL_STORAGE_KEYS.THEME, 'light');
      toast({ title: 'Appearance Updated', description: 'Light mode enabled.' });
    }
  };

  const handleDefaultDateRangeChange = (value: string) => {
    setDefaultDateRange(value);
    localStorage.setItem(LOCAL_STORAGE_KEYS.DEFAULT_DATE_RANGE, value);
    toast({ title: 'User Preference Updated', description: `Default dashboard date set to: ${value}` });
  };


  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Data Source Configuration
          </CardTitle>
          <CardDescription>
            Manage the Google Sheet URLs for each data source.
            <span className="block mt-1 text-xs text-amber-600 dark:text-amber-400">
              Note: Saving URL changes here is a UI placeholder for now. Actual persistence requires backend setup.
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(sheetUrls).map(([client, url]) => (
            <div key={client} className="space-y-1">
              <Label htmlFor={`sheet-url-${client}`} className="font-semibold">{client as ClientName}</Label>
              <Input
                id={`sheet-url-${client}`}
                value={url}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleUrlChange(client as ClientName, e.target.value)}
                className="bg-background focus:border-primary"
              />
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveSheetUrls} disabled={!hasChanges}>
            <Save className="mr-2 h-4 w-4" />
            Save Source URLs (Placeholder)
          </Button>
        </CardFooter>
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
          <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg bg-background/50">
            <Label htmlFor="dark-mode-switch" className="flex flex-col space-y-1">
              <span>Dark Mode</span>
              <span className="font-normal leading-snug text-muted-foreground text-xs">
                Enable or disable dark theme.
              </span>
            </Label>
            <Switch
              id="dark-mode-switch"
              checked={isDarkMode}
              onCheckedChange={handleDarkModeToggle}
            />
          </div>
          {/* <Button variant="outline" className="w-full" disabled>More Appearance Settings (Coming Soon)</Button> */}
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
          <div className="space-y-2 p-3 border rounded-lg bg-background/50">
            <Label htmlFor="default-date-range">Default Dashboard Date</Label>
            <Select
              value={defaultDateRange}
              onValueChange={handleDefaultDateRangeChange}
            >
              <SelectTrigger id="default-date-range">
                <SelectValue placeholder="Select default range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                {/* Add more relevant options if needed, e.g., Last 7 days */}
              </SelectContent>
            </Select>
             <p className="text-xs text-muted-foreground">
               This preference will be used on your next visit. (Note: Dashboard doesn't dynamically use this yet)
            </p>
          </div>
          {/* <Button variant="outline" className="w-full" disabled>Save All Preferences (Coming Soon)</Button> */}
        </CardContent>
      </Card>
    </div>
  );
}
