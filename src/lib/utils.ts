import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name?: string | null): string {
  if (!name || !name.trim()) return "U";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface FormatDateOptions {
  timezone?: string;
  dateFormat?: string;
  timeFormat?: "12h" | "24h";
  locale?: string;
}

function getUserLocalePreferences(): FormatDateOptions {
  if (typeof window === "undefined") {
    return {
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      locale: "en-US",
    };
  }

  try {
    const timezone = localStorage.getItem("chronos_timezone") || "UTC";
    const dateFormat = localStorage.getItem("chronos_date_format") || "YYYY-MM-DD";
    const timeFormat = (localStorage.getItem("chronos_time_format") as "12h" | "24h") || "24h";
    const lang = localStorage.getItem("chronos_language") || "en";

    const localeMap: Record<string, string> = {
      en: "en-US",
      es: "es-ES",
      de: "de-DE",
      fr: "fr-FR",
      ja: "ja-JP",
    };

    return {
      timezone,
      dateFormat,
      timeFormat,
      locale: localeMap[lang] || "en-US",
    };
  } catch {
    return {
      timezone: "UTC",
      dateFormat: "YYYY-MM-DD",
      timeFormat: "24h",
      locale: "en-US",
    };
  }
}

export function formatDate(
  date: string | Date | null | undefined,
  options?: FormatDateOptions
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  const userPrefs = getUserLocalePreferences();
  const timezone = options?.timezone || userPrefs.timezone || "UTC";
  const dateFormat = options?.dateFormat || userPrefs.dateFormat || "YYYY-MM-DD";
  const timeFormat = options?.timeFormat || userPrefs.timeFormat || "24h";
  const locale = options?.locale || userPrefs.locale || "en-US";

  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: timeFormat === "12h",
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");
    const dayPeriod = getPart("dayPeriod");

    let datePart = "";
    switch (dateFormat) {
      case "DD/MM/YYYY":
        datePart = `${day}/${month}/${year}`;
        break;
      case "MM/DD/YYYY":
        datePart = `${month}/${day}/${year}`;
        break;
      case "DD-MM-YYYY":
        datePart = `${day}-${month}-${year}`;
        break;
      case "YYYY-MM-DD":
      default:
        datePart = `${year}-${month}-${day}`;
        break;
    }

    let timePart = `${hour}:${minute}:${second}`;
    if (timeFormat === "12h" && dayPeriod) {
      timePart += ` ${dayPeriod.toUpperCase()}`;
    }

    return `${datePart} ${timePart}`;
  } catch {
    return d.toISOString();
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1) return "< 1 ms";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

