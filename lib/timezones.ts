export type TimezoneOption = {
  value: string;
  label: string;
  group: string;
};

export const DEFAULT_TIMEZONE = "America/New_York";
export const HOST_TIMEZONE = "America/New_York";

export const COMMON_TIMEZONES: TimezoneOption[] = [
  // US & Canada
  { value: "America/New_York", label: "Eastern Time - US & Canada (ET)", group: "US & Canada" },
  { value: "America/Chicago", label: "Central Time - US & Canada (CT)", group: "US & Canada" },
  { value: "America/Denver", label: "Mountain Time - US & Canada (MT)", group: "US & Canada" },
  { value: "America/Los_Angeles", label: "Pacific Time - US & Canada (PT)", group: "US & Canada" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)", group: "US & Canada" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)", group: "US & Canada" },
  
  // Asia & Pacific
  { value: "Asia/Kolkata", label: "India Standard Time (IST - UTC+5:30)", group: "Asia & Pacific" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST - Dubai)", group: "Asia & Pacific" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT)", group: "Asia & Pacific" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST)", group: "Asia & Pacific" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AEST)", group: "Asia & Pacific" },
  
  // Europe & UK
  { value: "Europe/London", label: "UK / London (GMT/BST)", group: "Europe" },
  { value: "Europe/Paris", label: "Central European Time (CET/CEST - Paris)", group: "Europe" },
  { value: "Europe/Berlin", label: "Central European Time (Berlin)", group: "Europe" },
  
  // UTC
  { value: "UTC", label: "UTC (Coordinated Universal Time)", group: "Other" },
];

/**
 * Returns YYYY-MM-DD in the given timezone
 */
export function getDateKeyInTimezone(isoOrDate: string | Date, timeZone: string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Format time (e.g. "8:30 PM") in the given timezone
 */
export function formatTimeInTimezone(isoOrDate: string | Date, timeZone: string): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/**
 * Friendly label for current timezone abbreviation / offset
 */
export function getTimezoneSummary(timeZone: string): string {
  try {
    const common = COMMON_TIMEZONES.find((t) => t.value === timeZone);
    if (common) return common.label;
    return timeZone.replace(/_/g, " ");
  } catch {
    return timeZone;
  }
}
