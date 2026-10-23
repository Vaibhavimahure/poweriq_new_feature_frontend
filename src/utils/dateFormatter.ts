/**
 * dateFormatter.ts — PowerIQ Canonical Date/Time Formatter
 * ----------------------------------------------------------------------------
 * Enforces DD-MM-YY formatting across all user-facing Alert UI:
 *  - AlertCard: "03-09-26 • 17:43"
 *  - AlertDetailModal: "03-09-26 17:43:00"
 *  - Custom date ranges: "01-09-26 to 03-09-26"
 *  - Leading zeros guaranteed on days and months.
 * ----------------------------------------------------------------------------
 */

import { format, parseISO } from "date-fns";

function safeDate(input?: string | Date | number | null): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  try {
    const str = String(input).trim();

    // 1. YYYY-MM-DD
    const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (ymd) {
      return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    }

    // 2. DD-MM-YYYY or DD-MM-YY
    const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (dmy) {
      let y = parseInt(dmy[3], 10);
      if (y < 100) y += 2000;
      return new Date(y, parseInt(dmy[2], 10) - 1, parseInt(dmy[1], 10));
    }

    // 3. DD-MM-YYYY HH:mm:ss or DD-MM-YY HH:mm:ss
    const dmyTime = str.match(
      /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/
    );
    if (dmyTime) {
      let y = parseInt(dmyTime[3], 10);
      if (y < 100) y += 2000;
      const h = parseInt(dmyTime[4], 10);
      const m = parseInt(dmyTime[5], 10);
      const s = dmyTime[6] ? parseInt(dmyTime[6], 10) : 0;
      return new Date(y, parseInt(dmyTime[2], 10) - 1, parseInt(dmyTime[1], 10), h, m, s);
    }

    // Normalize "YYYY-MM-DD HH:mm:ss" to "YYYY-MM-DDTHH:mm:ss" for bulletproof parsing
    const isoLike = str.includes(" ") && !str.includes("T") ? str.replace(" ", "T") : str;
    const parsed = isoLike.includes("T") ? parseISO(isoLike) : new Date(str);
    if (!isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? null : fallback;
  } catch {
    return null;
  }
}

export { safeDate };

/**
 * Formats a timestamp for Discussion chat system status events (e.g. "10:57 AM")
 */
export function formatDiscussionSystemTime(input?: string | Date | number | null): string {
  if (!input) return "";
  const d = safeDate(input);
  if (d && !isNaN(d.getTime())) {
    try {
      return format(d, "h:mm a");
    } catch {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
    }
  }

  // Direct fallback parsing for time components (e.g. "22-09-26 10:57:32")
  if (typeof input === "string") {
    const parts = input.trim().split(" ");
    if (parts.length >= 2) {
      const timePart = parts[1];
      const tParts = timePart.split(":");
      if (tParts.length >= 2) {
        let hour = parseInt(tParts[0], 10);
        const min = tParts[1];
        if (!isNaN(hour)) {
          const ampm = hour >= 12 ? "PM" : "AM";
          hour = hour % 12 || 12;
          return `${hour}:${min} ${ampm}`;
        }
      }
    }
  }

  return "";
}

/**
 * Formats an alert timestamp for AlertCard.
 * Output: "03-09-26 • 17:43"
 */
export function formatAlertCardDate(input?: string | Date | number | null): string {
  const d = safeDate(input);
  if (!d) return "";
  try {
    return format(d, "dd-MM-yy • HH:mm");
  } catch {
    return "";
  }
}

/**
 * Formats an alert timestamp for AlertDetailModal table.
 * Output: "03-09-26 17:43:00"
 */
export function formatAlertDetailDate(input?: string | Date | number | null): string {
  const d = safeDate(input);
  if (!d) return "Not specified";
  try {
    return format(d, "dd-MM-yy HH:mm:ss");
  } catch {
    return "Not specified";
  }
}

/**
 * Formats a calendar date as DD-MM-YY.
 * Output: "03-09-26"
 */
export function formatUserFacingDate(input?: string | Date | number | null): string {
  const d = safeDate(input);
  if (!d) return "";
  try {
    return format(d, "dd-MM-yy");
  } catch {
    return "";
  }
}

/**
 * Formats a custom date range for chips and triggers.
 * Output: "01-09-26 to 03-09-26"
 */
export function formatCustomDateRangeLabel(
  startDate?: string | null,
  endDate?: string | null
): string {
  const startStr = formatUserFacingDate(startDate);
  const endStr = formatUserFacingDate(endDate);

  if (startStr && endStr) {
    return `${startStr} to ${endStr}`;
  }
  if (startStr) {
    return `From ${startStr}`;
  }
  if (endStr) {
    return `Until ${endStr}`;
  }
  return "Select Dates";
}

/**
 * Formats a date range for display matching Web Dashboard (DD-MM-YYYY to DD-MM-YYYY)
 */
export function formatDisplayDateRange(
  startDate?: string | null,
  endDate?: string | null
): string {
  const formatSingle = (val?: string | null) => {
    if (!val) return "";
    const d = safeDate(val);
    if (!d) return val;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const s = formatSingle(startDate);
  const e = formatSingle(endDate);

  if (s && e) {
    return `${s} to ${e}`;
  }
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return "Select Dates";
}

/**
 * Formats a date range for display in the Select Dates input box (DD/MM/YYYY – DD/MM/YYYY).
 * Matches the Web Dashboard Select Dates input box shown in the reference image.
 */
export function formatSelectDatesInput(
  startDate?: string | null,
  endDate?: string | null
): string {
  const formatSingle = (val?: string | null) => {
    if (!val) return "";
    const d = safeDate(val);
    if (!d) return val;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const s = formatSingle(startDate);
  const e = formatSingle(endDate);

  if (s && e) {
    return `${s} – ${e}`;
  }
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return "Select Dates";
}

/**
 * Parses user input date string (DD-MM-YY, DD-MM-YYYY, or YYYY-MM-DD)
 * to an ISO string for backend query.
 */
export function parseDateInputToIso(
  input?: string | null,
  isEndOfDay: boolean = false
): string | undefined {
  if (!input || !input.trim()) return undefined;
  const s = input.trim();

  let year: number;
  let month: number;
  let day: number;

  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10) - 1;
    year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
  } else if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10) - 1;
    day = parseInt(ymdMatch[3], 10);
  } else {
    try {
      const d = new Date(s);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    } catch {
      return undefined;
    }
  }

  // Calculate IST Date (UTC+5:30)
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const hour = isEndOfDay ? 23 : 0;
  const min = isEndOfDay ? 59 : 0;
  const sec = isEndOfDay ? 59 : 0;
  const ms = isEndOfDay ? 999 : 0;

  const utcMs = Date.UTC(year, month, day, hour, min, sec, ms) - IST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

/**
 * Parses user input date string (DD-MM-YYYY, DD/MM/YYYY, DD-MM-YY, or YYYY-MM-DD)
 * to a local naive ISO string ("YYYY-MM-DDTHH:mm:ss.sss") matching Web Dashboard's DatePackage2.
 */
export function parseDateInputToNaiveIso(
  input?: string | null,
  isEndOfDay: boolean = false
): string {
  const fallback = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return isEndOfDay ? `${y}-${m}-${d}T23:59:59.999` : `${y}-${m}-${d}T00:00:00.000`;
  };

  if (!input || !input.trim()) return fallback();
  const s = input.trim();

  let year: number;
  let month: number;
  let day: number;

  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (dmyMatch) {
    day = parseInt(dmyMatch[1], 10);
    month = parseInt(dmyMatch[2], 10);
    year = parseInt(dmyMatch[3], 10);
    if (year < 100) year += 2000;
  } else if (ymdMatch) {
    year = parseInt(ymdMatch[1], 10);
    month = parseInt(ymdMatch[2], 10);
    day = parseInt(ymdMatch[3], 10);
  } else {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      year = d.getFullYear();
      month = d.getMonth() + 1;
      day = d.getDate();
    } else {
      return fallback();
    }
  }

  const yStr = String(year);
  const mStr = String(month).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");

  return isEndOfDay ? `${yStr}-${mStr}-${dStr}T23:59:59.999` : `${yStr}-${mStr}-${dStr}T00:00:00.000`;
}

