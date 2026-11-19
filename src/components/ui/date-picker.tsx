"use client";

import * as React from "react";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Calendar } from "./calendar";

export interface DatePickerProps {
  id?: string;
  value?: string | Date;
  onChange?: (val: string) => void;
  showTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

function parseDateValue(value?: string | Date): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(date: Date | null, showTime: boolean, placeholder: string): string {
  if (!date) return placeholder;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = date.getDate().toString().padStart(2, "0");
  const m = months[date.getMonth()];
  const y = date.getFullYear();

  if (!showTime) {
    return `${m} ${d}, ${y}`;
  }

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hStr = hours.toString().padStart(2, "0");

  return `${m} ${d}, ${y}, ${hStr}:${minutes} ${ampm}`;
}

export function toLocalDatetimeString(date: Date, showTime: boolean): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  if (!showTime) {
    return `${y}-${m}-${d}`;
  }
  const h = date.getHours().toString().padStart(2, "0");
  const min = date.getMinutes().toString().padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function DatePicker({
  id,
  value,
  onChange,
  showTime = false,
  placeholder = showTime ? "Pick date & time" : "Pick a date",
  disabled = false,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = parseDateValue(value);

  // Time state
  const hours = selectedDate ? selectedDate.getHours() : 12;
  const minutes = selectedDate ? selectedDate.getMinutes() : 0;
  const isPM = hours >= 12;
  const displayHours = hours % 12 || 12;

  const [hoursInput, setHoursInput] = React.useState(
    displayHours.toString().padStart(2, "0")
  );
  const [minsInput, setMinsInput] = React.useState(
    minutes.toString().padStart(2, "0")
  );

  React.useEffect(() => {
    if (selectedDate) {
      const h = selectedDate.getHours() % 12 || 12;
      const m = selectedDate.getMinutes();
      setHoursInput(h.toString().padStart(2, "0"));
      setMinsInput(m.toString().padStart(2, "0"));
    }
  }, [value]);

  const handleSelectDay = (day: Date) => {
    const newDate = new Date(day);
    if (selectedDate && showTime) {
      newDate.setHours(selectedDate.getHours());
      newDate.setMinutes(selectedDate.getMinutes());
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
    } else if (showTime) {
      const now = new Date();
      newDate.setHours(now.getHours());
      newDate.setMinutes(now.getMinutes());
      newDate.setSeconds(0);
      newDate.setMilliseconds(0);
    }
    onChange?.(toLocalDatetimeString(newDate, showTime));
    if (!showTime) {
      setOpen(false);
    }
  };

  const updateTime = (newH: number, newM: number, newIsPM: boolean) => {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    let finalH = newH % 12;
    if (newIsPM) finalH += 12;
    base.setHours(finalH);
    base.setMinutes(newM);
    base.setSeconds(0);
    base.setMilliseconds(0);
    onChange?.(toLocalDatetimeString(base, true));
  };

  const handleHoursChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 2);
    setHoursInput(clean);
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
      updateTime(parsed, parseInt(minsInput, 10) || 0, isPM);
    }
  };

  const handleHoursBlur = () => {
    let parsed = parseInt(hoursInput, 10);
    if (isNaN(parsed) || parsed < 1) parsed = 12;
    if (parsed > 12) parsed = 12;
    const formatted = parsed.toString().padStart(2, "0");
    setHoursInput(formatted);
    updateTime(parsed, parseInt(minsInput, 10) || 0, isPM);
  };

  const handleMinsChange = (raw: string) => {
    const clean = raw.replace(/\D/g, "").slice(0, 2);
    setMinsInput(clean);
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 59) {
      updateTime(parseInt(hoursInput, 10) || 12, parsed, isPM);
    }
  };

  const handleMinsBlur = () => {
    let parsed = parseInt(minsInput, 10);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    if (parsed > 59) parsed = 59;
    const formatted = parsed.toString().padStart(2, "0");
    setMinsInput(formatted);
    updateTime(parseInt(hoursInput, 10) || 12, parsed, isPM);
  };

  const handleAmPmToggle = (targetIsPM: boolean) => {
    updateTime(parseInt(hoursInput, 10) || 12, parseInt(minsInput, 10) || 0, targetIsPM);
  };

  const setPreset = (offsetMinutes: number) => {
    const d = new Date(Date.now() - offsetMinutes * 60 * 1000);
    onChange?.(toLocalDatetimeString(d, showTime));
  };

  return (
    <div className="relative flex items-center w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            className={cn(
              "flex h-8 w-full items-center justify-between rounded-md border border-border bg-input px-3 text-xs font-sans text-foreground shadow-2xs transition-colors hover:bg-secondary/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer text-left",
              value && "pr-8",
              !selectedDate && "text-muted-foreground",
              className
            )}
          >
            <div className="flex items-center gap-2 truncate">
              <CalendarIcon className="h-3.5 w-3.5 text-primary/80 shrink-0" />
              <span className="truncate font-medium">
                {formatDisplay(selectedDate, showTime, placeholder)}
              </span>
            </div>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0 z-50" align="start">
          <div className="flex flex-col">
            <Calendar
              selected={selectedDate}
              onSelect={handleSelectDay}
              minDate={minDate}
              maxDate={maxDate}
            />

            {showTime && (
              <div className="border-t border-border px-3 py-2.5 bg-secondary/15 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-primary" /> Time
                  </span>

                  {/* Digital inputs and AM/PM segmented pills */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-md border border-border bg-background px-2 py-0.5 shadow-2xs">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={hoursInput}
                        onChange={(e) => handleHoursChange(e.target.value)}
                        onBlur={handleHoursBlur}
                        aria-label="Hours"
                        className="w-5 text-center text-xs font-semibold bg-transparent text-foreground focus:outline-none focus:text-primary"
                      />
                      <span className="text-xs font-bold text-muted-foreground/60 select-none px-0.5">
                        :
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={minsInput}
                        onChange={(e) => handleMinsChange(e.target.value)}
                        onBlur={handleMinsBlur}
                        aria-label="Minutes"
                        className="w-5 text-center text-xs font-semibold bg-transparent text-foreground focus:outline-none focus:text-primary"
                      />
                    </div>

                    <div className="flex rounded-md border border-border bg-background p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => handleAmPmToggle(false)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-semibold rounded transition-all cursor-pointer",
                          !isPM
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAmPmToggle(true)}
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-semibold rounded transition-all cursor-pointer",
                          isPM
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Presets & Done */}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreset(0)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border border-border/70 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                    >
                      Now
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset(60)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border border-border/70 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                    >
                      -1 hr
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreset(1440)}
                      className="text-[10px] font-medium px-2 py-0.5 rounded border border-border/70 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shadow-2xs"
                    >
                      -1 day
                    </button>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setOpen(false)}
                    className="h-6 px-2.5 text-[11px] font-medium cursor-pointer"
                  >
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {value && !disabled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange?.("");
          }}
          className="absolute right-2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-xs p-0.5 z-10"
          title="Clear timestamp"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function DateTimePicker(props: Omit<DatePickerProps, "showTime">) {
  return <DatePicker {...props} showTime={true} />;
}
