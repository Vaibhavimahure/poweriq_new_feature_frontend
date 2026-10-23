/**
 * dashboardWindowUtils.ts
 * ----------------------------------------------------------------------------
 * Timezone-stable (IST) date window calculation utilities ported directly from
 * the PowerIQ web dashboard (src/utils/dashboardWindowUtils.js & billingWindowUtils.js).
 * ----------------------------------------------------------------------------
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const val = n % 100;
  return `${n}${suffixes[(val - 20) % 10] || suffixes[val] || suffixes[0]}`;
}

export function isValidDate(value: any): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function formatVerboseDate(date: Date | null): string {
  if (!date || !isValidDate(date)) return "—";
  return `${ordinal(date.getDate())} ${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatShortDate(date: Date | null): string {
  if (!date || !isValidDate(date)) return "—";
  return `${ordinal(date.getDate())} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function shiftLocalMonth(value: Date | number, amount: number): Date {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number" && value < 1e11
      ? value * 1000
      : Number(value);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return new Date();
  const day = date.getDate();
  const shifted = new Date(date.getTime());
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + amount);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
}

export function parseBillingStartDay(billingCycle: any, fallback = 1): number {
  if (typeof billingCycle === "number" && Number.isFinite(billingCycle)) {
    return Math.min(31, Math.max(1, Math.floor(billingCycle)));
  }
  if (typeof billingCycle === "string") {
    const m = billingCycle.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return Math.min(31, Math.max(1, n));
    }
  }
  return fallback;
}

export function toEpochSec(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export interface BillingWindowResult {
  startDate: Date;
  inclusiveEndDate: Date;
  effectiveEndDate: Date;
  fromSec: number;
  toSec: number;
  prevStartDate: Date;
  prevToDate: Date;
  prevFromSec: number;
  prevToSec: number;
  windowText: string;
  progressText: string;
  billingStartDay: number;
  selectedMonth: number;
  selectedYear: number;
  isCurrentCycle: boolean;
}

export function calculateBillingWindow(
  selectedYear: number,
  selectedMonth: number,
  billingStartDay: any,
  currentDate = new Date()
): BillingWindowResult {
  const startDay = parseBillingStartDay(billingStartDay, 1);
  const currentDay = currentDate.getDate();

  let adjustedYear = selectedYear;
  let adjustedMonth = selectedMonth;

  if (currentDay < startDay) {
    adjustedMonth = selectedMonth - 1;
    if (adjustedMonth < 0) {
      adjustedMonth = 11;
      adjustedYear = selectedYear - 1;
    }
  }

  const startDayThisMonth = Math.min(startDay, daysInMonth(adjustedYear, adjustedMonth));
  const startDate = new Date(adjustedYear, adjustedMonth, startDayThisMonth);
  startDate.setHours(0, 0, 0, 0);

  const nextMonth = (adjustedMonth + 1) % 12;
  const nextYear = adjustedMonth === 11 ? adjustedYear + 1 : adjustedYear;
  const startDayNextMonth = Math.min(startDay, daysInMonth(nextYear, nextMonth));
  const nextStartDate = new Date(nextYear, nextMonth, startDayNextMonth);
  nextStartDate.setHours(0, 0, 0, 0);

  const inclusiveEndDate = new Date(nextStartDate);
  inclusiveEndDate.setDate(inclusiveEndDate.getDate() - 1);
  inclusiveEndDate.setHours(23, 59, 59, 999);

  const isCurrentCycle =
    currentDate >= startDate && currentDate <= inclusiveEndDate;

  const effectiveEndDate = isCurrentCycle ? currentDate : inclusiveEndDate;

  const fromSec = Math.floor(startDate.getTime() / 1000);
  const toSec = Math.floor(effectiveEndDate.getTime() / 1000);

  // Previous billing cycle (1 month prior)
  let prevAdjustedMonth = adjustedMonth - 1;
  let prevAdjustedYear = adjustedYear;
  if (prevAdjustedMonth < 0) {
    prevAdjustedMonth = 11;
    prevAdjustedYear = adjustedYear - 1;
  }

  // Previous comparison window: exact same calendar day of last month (e.g. 28/09 -> 28/08)
  const prevStartDate = shiftLocalMonth(startDate, -1);
  const prevToDate = shiftLocalMonth(effectiveEndDate, -1);

  const prevFromSec = Math.floor(prevStartDate.getTime() / 1000);
  const prevToSec = Math.floor(prevToDate.getTime() / 1000);

  const windowText = `${formatShortDate(startDate)} — ${formatShortDate(inclusiveEndDate)}`;
  const progressText = `${formatShortDate(startDate)} — ${formatShortDate(effectiveEndDate)}`;

  return {
    startDate,
    inclusiveEndDate,
    effectiveEndDate,
    fromSec,
    toSec,
    prevStartDate,
    prevToDate,
    prevFromSec,
    prevToSec,
    windowText,
    progressText,
    billingStartDay: startDay,
    selectedMonth: adjustedMonth,
    selectedYear: adjustedYear,
    isCurrentCycle,
  };
}

export const DEPLOYMENT_YEAR = 2026;

export interface TodayWindowOptions {
  basis?: "calendar" | "production";
  shiftStart?: string;
}

export interface TodayWindowResult {
  fromSec: number;
  toSec: number;
  prevFromSec: number;
  prevToSec: number;
  label: string;
  subLabel: string;
  displayModeName: string;
  basis: "calendar" | "production";
  shiftStart: string;
  isProduction: boolean;
}

export function getProductionTodayWindow(
  options: TodayWindowOptions = {}
): TodayWindowResult {
  const basis = options.basis ?? "production";
  const shiftStart = options.shiftStart || "06:00";
  const isProduction = basis === "production";

  const now = new Date();
  const istOffsetMs = IST_OFFSET_MS;
  const nowIst = new Date(now.getTime() + istOffsetMs);

  const y = nowIst.getUTCFullYear();
  const m = nowIst.getUTCMonth();
  const d = nowIst.getUTCDate();

  let [sHours, sMins] = shiftStart.split(":").map(Number);
  if (!Number.isFinite(sHours)) sHours = 6;
  if (!Number.isFinite(sMins)) sMins = 0;

  const boundaryHours = isProduction ? sHours : 0;
  const boundaryMins = isProduction ? sMins : 0;

  let startUtcMs = Date.UTC(y, m, d, boundaryHours, boundaryMins, 0, 0) - istOffsetMs;
  let startDate = new Date(startUtcMs);

  // If in production mode and current time is before shift start (e.g. 3 AM), shift belongs to yesterday!
  if (isProduction && now.getTime() < startDate.getTime()) {
    startDate = new Date(startDate.getTime() - DAY_MS);
  }

  const endDate = new Date(now);
  const fromSec = Math.floor(startDate.getTime() / 1000);
  const toSec = Math.floor(endDate.getTime() / 1000);

  // Previous comparison range: exact same calendar day of last month (e.g. 28/09 -> 28/08)
  const prevStartDate = shiftLocalMonth(startDate, -1);
  const prevEndDate = shiftLocalMonth(endDate, -1);
  const prevFromSec = Math.floor(prevStartDate.getTime() / 1000);
  const prevToSec = Math.floor(prevEndDate.getTime() / 1000);

  const startIst = new Date(startDate.getTime() + istOffsetMs);
  const endIst = new Date(endDate.getTime() + istOffsetMs);

  const startD = startIst.getUTCDate();
  const startM = startIst.getUTCMonth();
  const startY = startIst.getUTCFullYear();

  const endD = endIst.getUTCDate();
  const endM = endIst.getUTCMonth();
  const endY = endIst.getUTCFullYear();

  const formatTime12h = (istDate: Date) => {
    let hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? "0" + minutes : minutes;
    return `${hours}:${strMinutes} ${ampm}`;
  };

  const dStartStr = `${startD} ${MONTHS_SHORT[startM]} ${startY}`;
  const dEndStr = `${endD} ${MONTHS_SHORT[endM]} ${endY}`;

  const label = isProduction
    ? `${dStartStr} → ${dEndStr} Production`
    : `${dStartStr} → ${dEndStr}`;

  const subLabel = `${ordinal(startD)} ${MONTHS_FULL[startM]} ${startY}, ${formatTime12h(startIst)} — ${ordinal(endD)} ${MONTHS_FULL[endM]} ${endY}, ${formatTime12h(endIst)}`;

  return {
    fromSec,
    toSec,
    prevFromSec,
    prevToSec,
    label,
    subLabel,
    displayModeName: "Today",
    basis,
    shiftStart,
    isProduction,
  };
}

export function getTodayRange(): { fromSec: number; toSec: number; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return {
    fromSec: Math.floor(start.getTime() / 1000),
    toSec: Math.floor(now.getTime() / 1000),
    label: "Today",
  };
}

export function getMonthRange(year: number, monthIndex: number): {
  fromSec: number;
  toSec: number;
  label: string;
} {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return {
    fromSec: Math.floor(start.getTime() / 1000),
    toSec: Math.floor(end.getTime() / 1000),
    label: `${MONTHS_SHORT[monthIndex]} ${year}`,
  };
}

