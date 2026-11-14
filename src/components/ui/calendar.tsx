"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CalendarProps {
  selected?: Date | null;
  onSelect?: (date: Date) => void;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function Calendar({
  selected,
  onSelect,
  className,
  minDate,
  maxDate,
}: CalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    return selected ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  React.useEffect(() => {
    if (selected && !isNaN(selected.getTime())) {
      setCurrentMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
  }, [selected]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];

  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({
      date: new Date(year, month - 1, daysInPrevMonth - i),
      isCurrentMonth: false,
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      date: new Date(year, month, d),
      isCurrentMonth: true,
    });
  }

  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({
      date: new Date(year, month + 1, d),
      isCurrentMonth: false,
    });
  }

  const isToday = (d: Date) => {
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const isSameDay = (d1?: Date | null, d2?: Date | null) => {
    if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
    return (
      d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear()
    );
  };

  return (
    <div className={cn("p-3 select-none w-[280px] font-sans", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 pt-0.5 px-0.5">
        <h4 className="text-sm font-semibold tracking-tight text-foreground">
          {MONTH_NAMES[month]} <span className="font-normal text-muted-foreground">{year}</span>
        </h4>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prevMonth}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/80 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shadow-2xs"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-border/80 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shadow-2xs"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-[11px] font-medium text-muted-foreground/70 h-7 flex items-center justify-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map(({ date, isCurrentMonth }, idx) => {
          const isSelected = isSameDay(selected, date);
          const today = isToday(date);
          const disabled =
            (minDate && date < minDate) || (maxDate && date > maxDate);

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => onSelect?.(date)}
              className={cn(
                "h-8 w-8 text-xs rounded-md flex items-center justify-center font-normal transition-all duration-150 cursor-pointer",
                !isCurrentMonth && "text-muted-foreground/30 opacity-40 pointer-events-none hover:bg-transparent",
                isCurrentMonth && !isSelected && "text-foreground hover:bg-secondary hover:text-foreground",
                today && !isSelected && "border border-primary/50 text-primary font-medium bg-primary/5",
                isSelected && "bg-primary text-primary-foreground font-semibold shadow-xs hover:bg-primary/95",
                disabled && "opacity-25 cursor-not-allowed pointer-events-none"
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
