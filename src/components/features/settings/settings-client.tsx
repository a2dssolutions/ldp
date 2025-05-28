
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
import { FileSpreadsheet, Palette, UserCog, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { AppSettings } from '@/lib/services/config-service';
import { saveAppSettingsAction } from '@/lib/actions';


interface SettingsClientProps {
  initialSettings: AppSettings;
}

export function SettingsClient({ initialSettings }: SettingsClientProps) {
  const [sheetUrls, setSheetUrls] = useState<Record<ClientName, string>>(initialSettings.sheetUrls);
  const [theme, setTheme] = useState<'light' | 'dark'>(initialSettings.theme);
  const [defaultDateRange, setDefaultDateRange] = useState<string>(initialSettings.defaultDateRange);
  
  const [isSaving, setIsSaving] = useState(false);
  const [hasSheetUrlChanges, setHasSheetUrlChanges] = useState(false);
  const { toast } = useToast();

  // Apply theme on initial load and when theme state changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleSettingChangeAndSave = async (changedSettings: Partial<AppSettings>) => {
    setIsSaving(true);
    const newSettings = { // Construct the full settings object to save
      sheetUrls: changedSettings.sheetUrls || sheetUrls,
      theme: changedSettings.theme || theme,
      defaultDateRange: changedSettings.defaultDateRange || defaultDateRange,
    };
    const result = await saveAppSettingsAction(newSettings);
    if (result.success) {
      toast({ title: 'Settings Updated', description: result.message });
      // Update local state if a specific part was changed, e.g. for direct UI feedback
      if (changedSettings.sheetUrls) setSheetUrls(changedSettings.sheetUrls);
      if (changedSettings.theme) setTheme(changedSettings.theme);
      if (changedSettings.defaultDateRange) setDefaultDateRange(changedSettings.defaultDateRange);

    } else {
      toast({ title: 'Error Updating Settings', description: result.message, variant: 'destructive' });
    }
    setIsSaving(false);
  };
  
  const handleUrlChange = (client: ClientName, value: string) => {
    setSheetUrls(prev => ({ ...prev, [client]: value }));
    setHasSheetUrlChanges(true);
  };

  const handleSaveSheetUrls = () => {
    handleSettingChangeAndSave({ sheetUrls });
    setHasSheetUrlChanges(false);
  };

  const handleThemeToggle = (checked: boolean) => {
    const newTheme = checked ? 'dark' : 'light';
    setTheme(newTheme); // Local state update for immediate UI change
    handleSettingChangeAndSave({ theme: newTheme });
  };

  const handleDefaultDateRangeChange = (value: string) => {
    setDefaultDateRange(value); // Local state update
    handleSettingChangeAndSave({ defaultDateRange: value });
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
            Manage the Google Sheet URLs for each data source. Changes are saved to Firestore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(sheetUrls) as ClientName[]).map((client) => (
            <div key={client} className="space-y-1">
              <Label htmlFor={`sheet-url-${client}`} className="font-semibold">{client}</Label>
              <Input
                id={`sheet-url-${client}`}
                value={sheetUrls[client]}
                onChange={(e: ChangeEvent<HTMLInputElement>) => handleUrlChange(client, e.target.value)}
                className="bg-background focus:border-primary"
                disabled={isSaving}
              />
            </div>
          ))}
        </CardContent>
        <CardFooter>
          <Button onClick={handleSaveSheetUrls} disabled={isSaving || !hasSheetUrlChanges}>
            {isSaving && hasSheetUrlChanges ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Source URLs
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
              checked={theme === 'dark'}
              onCheckedChange={handleThemeToggle}
              disabled={isSaving}
            />
          </div>
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
              disabled={isSaving}
            >
              <SelectTrigger id="default-date-range">
                <SelectValue placeholder="Select default range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
              </SelectContent>
            </Select>
             <p className="text-xs text-muted-foreground">
               Saved to Firestore. Dashboard uses this for its default date selection.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
