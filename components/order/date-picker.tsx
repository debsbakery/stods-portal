"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  date?: Date;
  onDateChange?: (date: Date | undefined) => void;
  disabled?: (date: Date) => boolean;
  className?: string;
}

export function DatePicker({ date, onDateChange, disabled, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const newDate = new Date(e.target.value + 'T00:00:00');
      onDateChange?.(newDate);
    } else {
      onDateChange?.(undefined);
    }
    setOpen(false);
  };

  const isDisabled = disabled && date ? disabled(date) : false;

  return (
    <div className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full justify-start text-left font-normal",
          !date && "text-muted-foreground"
        )}
        disabled={isDisabled}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {date ? format(date, "PPP") : <span>Pick a date</span>}
      </Button>

      {open && (
        <div className="absolute z-50 mt-2 bg-white border rounded-md shadow-lg p-4">
          <input
            type="date"
            value={date ? format(date, "yyyy-MM-dd") : ""}
            onChange={handleDateChange}
            min={new Date().toISOString().split('T')[0]}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-2 w-full px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}