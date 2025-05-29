
"use client"

import * as React from "react"
import { format, isValid } from "date-fns" // Added isValid
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  id?: string;
  date?: Date;
  onDateChange: (date: Date | undefined) => void;
  className?: string;
  disabled?: boolean; // Added disabled prop
}

export function DatePicker({ id, date, onDateChange, className, disabled }: DatePickerProps) {
  // Ensure date is a valid Date object or undefined before formatting
  const displayDate = date && isValid(date) ? format(date, "PPP") : <span>Pick a date</span>;
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant={"outline"}
          disabled={disabled} // Apply disabled prop
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayDate}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          initialFocus
          disabled={disabled} // Pass disabled to Calendar
        />
      </PopoverContent>
    </Popover>
  )
}
