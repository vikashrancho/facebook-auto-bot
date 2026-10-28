/**
 * Timezone-aware date and scheduling utilities using native Intl.
 *
 * Supports robust timezone conversion, display formatting, and calendar calculations
 * with default timezone set to Asia/Kolkata.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const BRAND_NAME = "Facebook Page";

export function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24, // Intl can return "24" for midnight
  };
}

/** Start of "today" (in the given timezone) expressed as a UTC ISO instant. */
export function startOfTodayIso(timeZone: string = DEFAULT_TIMEZONE): string {
  const { dateKey } = localParts(new Date(), timeZone);
  return `${dateKey}T00:00:00.000Z`;
}

/**
 * Returns YYYY-MM-DD date key in the given timezone.
 */
export function getDateKeyInTimezone(date: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const { dateKey } = localParts(d, timeZone);
  return dateKey;
}

/**
 * Formats a Date or UTC ISO string into the target timezone.
 */
export function formatInTimezone(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  }
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(d);
}

/**
 * Formats time-only in target timezone, e.g. "10:30 AM".
 */
export function formatTimeOnly(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return formatInTimezone(date, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats date-only in target timezone, e.g. "Oct 25, 2026".
 */
export function formatDateOnly(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  return formatInTimezone(date, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Formats full datetime with timezone code in target timezone, e.g. "Oct 25, 2026, 10:30 AM (IST)".
 */
export function formatFullDateTime(
  date: Date | string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(d);

  return formatted;
}

/**
 * Converts a user's date string (YYYY-MM-DD) and time string (HH:mm) in a specific timezone
 * into a precision UTC ISO-8601 string suitable for database storage.
 */
export function toUtcIsoString(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-");
  const [hourStr, minStr] = timeStr.split(":");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minStr);

  if (!year || !month || !day || isNaN(hour) || isNaN(minute)) {
    throw new Error("Invalid date or time format. Expected YYYY-MM-DD and HH:mm");
  }

  // Construct naive UTC instant
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  // Determine timezone offset difference
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(naiveUtc);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const tzYear = Number(get("year"));
  const tzMonth = Number(get("month"));
  const tzDay = Number(get("day"));
  let tzHour = Number(get("hour"));
  if (tzHour === 24) tzHour = 0;
  const tzMin = Number(get("minute"));

  const tzEquivalentUtc = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin, 0, 0);
  const offsetMs = tzEquivalentUtc - naiveUtc.getTime();

  const actualUtcMs = naiveUtc.getTime() - offsetMs;
  return new Date(actualUtcMs).toISOString();
}

/**
 * Converts a UTC ISO string into target timezone date and time input values (YYYY-MM-DD and HH:mm).
 */
export function toTimezoneInputValue(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): { dateStr: string; timeStr: string; combined: string } {
  if (!iso) return { dateStr: "", timeStr: "", combined: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { dateStr: "", timeStr: "", combined: "" };

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const minute = get("minute");

  const dateStr = `${year}-${month}-${day}`;
  const timeStr = `${hour}:${minute}`;
  return {
    dateStr,
    timeStr,
    combined: `${dateStr}T${timeStr}`,
  };
}

/**
 * Checks if two dates/timestamps fall on the exact same calendar day in the given timezone.
 */
export function isSameDayInTimezone(
  d1: Date | string,
  d2: Date | string,
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  return getDateKeyInTimezone(d1, timeZone) === getDateKeyInTimezone(d2, timeZone);
}

const COMMON_TIMEZONE_ALIASES: Record<string, string> = {
  IST: "Asia/Kolkata",
  PKT: "Asia/Karachi",
  UTC: "UTC",
  GMT: "UTC",
  EST: "America/New_York",
  EDT: "America/New_York",
  CST: "America/Chicago",
  CDT: "America/Chicago",
  MST: "America/Denver",
  MDT: "America/Denver",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  BST: "Europe/London",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  JST: "Asia/Tokyo",
  AEST: "Australia/Sydney",
  AEDT: "Australia/Sydney",
  SGT: "Asia/Singapore",
  GST: "Asia/Dubai",
};

/**
 * Validates whether a timezone identifier is supported by Intl.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalizes user/ChatGPT-supplied timezone string (e.g. "IST", "Asia/Kolkata") into a valid IANA timezone.
 * Throws an Error if the timezone is invalid.
 */
export function normalizeTimezone(rawTz?: string | null, fallback = DEFAULT_TIMEZONE): string {
  if (!rawTz || !rawTz.trim()) return fallback;
  const trimmed = rawTz.trim();
  const aliasMatch = COMMON_TIMEZONE_ALIASES[trimmed.toUpperCase()];
  if (aliasMatch && isValidTimezone(aliasMatch)) {
    return aliasMatch;
  }
  if (isValidTimezone(trimmed)) {
    return trimmed;
  }
  throw new Error(
    `Invalid timezone: '${rawTz}'. Please supply a valid IANA timezone (e.g. 'Asia/Kolkata', 'UTC', 'America/New_York') or abbreviation (e.g. 'IST').`
  );
}

