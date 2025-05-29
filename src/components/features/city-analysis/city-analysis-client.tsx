
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CityClientMatrixRow } from '@/lib/types';
import { getCityClientMatrixAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { format, isValid } from 'date-fns';
import { Loader2, Search, CheckCircle2, XCircle } from 'lucide-react';

interface CityAnalysisClientProps {
  initialSelectedDate: string;
}

export function CityAnalysisClient({ initialSelectedDate }: CityAnalysisClientProps) {
  const [selectedDate, setSelectedDate_] = useState<Date>(new Date(initialSelectedDate));
  const [reportData, setReportData] = useState<CityClientMatrixRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleDateChange = (date: Date | undefined) => {
    if (date && isValid(date)) {
      setSelectedDate_(date);
    } else {
      setSelectedDate_(new Date(initialSelectedDate)); 
      toast({ title: "Invalid Date", description: "Please select a valid date.", variant: "destructive" });
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedDate || !isValid(selectedDate)) {
      toast({ title: "Date Required", description: "Please select a valid date to generate the report.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    setReportData([]);
    try {
      const dateString = format(selectedDate, 'yyyy-MM-dd');
      const result = await getCityClientMatrixAction(dateString);
      setReportData(result);
      if (result.length === 0) {
        toast({ title: "No Data Found", description: `No demand data found for ${dateString} to generate the report.` });
      } else {
        toast({ title: "Report Generated", description: `Found ${result.length} cities for ${dateString}.` });
      }
    } catch (error) {
      console.error('Failed to generate city analysis report:', error);
      toast({ title: 'Error Generating Report', description: error instanceof Error ? error.message : 'Could not generate report.', variant: 'destructive' });
      setReportData([]);
    } finally {
      setIsLoading(false);
    }
  };

   useEffect(() => {
     if (selectedDate && isValid(selectedDate)) {
       handleGenerateReport();
     }
   // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [selectedDate]);


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Report Filters</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">Select a date to analyze.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="w-full sm:w-auto">
            <Label htmlFor="report-date">Date</Label>
            <DatePicker id="report-date" date={selectedDate} onDateChange={handleDateChange} disabled={isLoading} />
          </div>
          <Button onClick={handleGenerateReport} disabled={isLoading} className="w-full sm:w-auto">
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2 text-sm text-muted-foreground">Generating report...</p>
        </div>
      )}

      {!isLoading && reportData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">City Client Activity &amp; Top Demand Areas</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Report for {selectedDate && isValid(selectedDate) ? format(selectedDate, 'PPP') : 'selected date'}. Y/N indicates client presence. Top 3 areas by total demand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[600px] overflow-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                  <TableRow>
                    <TableHead>City</TableHead>
                    <TableHead className="text-center">Blinkit</TableHead>
                    <TableHead className="text-center">Zepto</TableHead>
                    <TableHead className="text-center">SwiggyFood</TableHead>
                    <TableHead className="text-center">SwiggyIM</TableHead>
                    <TableHead>High Demand Areas (Top 3)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData
                    .filter(row => row && typeof row === 'object' && row.city) 
                    .map((row) => {
                      return (
                        <TableRow key={row.city}>
                          <TableCell className="font-medium">{row.city ?? 'N/A'}</TableCell>
                          <TableCell className="text-center">
                            {row.blinkit ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.zepto ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.swiggyFood ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {row.swiggyIM ? <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-red-500 inline-block" />}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{row.highDemandAreas || 'N/A'}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {!isLoading && reportData.length === 0 && (
        <Card className="mt-6">
          <CardContent className="pt-6">
            <p className="text-center text-sm text-muted-foreground">
              No data to display. Select a date and click "Generate Report", or data for the selected date might not exist.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
