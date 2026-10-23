/**
 * shiftUtils.ts
 * ----------------------------------------------------------------------------
 * Helpers for auto-detecting current work shift based on local time.
 * Standard Industrial Shifts:
 *   - Morning Shift: 06:00 to 14:00
 *   - Evening Shift: 14:00 to 22:00
 *   - Night Shift:   22:00 to 06:00
 * ----------------------------------------------------------------------------
 */

export interface ShiftDefinition {
  name: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  badgeColor: string;
}

export const STANDARD_SHIFTS: ShiftDefinition[] = [
  {
    name: "Morning Shift",
    startHour: 6,
    startMin: 0,
    endHour: 14,
    endMin: 0,
    badgeColor: "#2563EB", // Blue
  },
  {
    name: "Evening Shift",
    startHour: 14,
    startMin: 0,
    endHour: 22,
    endMin: 0,
    badgeColor: "#D97706", // Amber
  },
  {
    name: "Night Shift",
    startHour: 22,
    startMin: 0,
    endHour: 6,
    endMin: 0,
    badgeColor: "#7C3AED", // Purple
  },
];

/**
 * Returns the active shift name based on current or provided date/time.
 */
export function getCurrentShiftName(date: Date = new Date()): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Morning: 06:00 (360) -> 14:00 (840)
  if (totalMinutes >= 360 && totalMinutes < 840) {
    return "Morning Shift";
  }
  // Evening: 14:00 (840) -> 22:00 (1320)
  if (totalMinutes >= 840 && totalMinutes < 1320) {
    return "Evening Shift";
  }
  // Night: 22:00 (1320) -> 06:00 (360)
  return "Night Shift";
}

/**
 * Formats a date into YYYY-MM-DD
 */
export function formatDateYMD(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
