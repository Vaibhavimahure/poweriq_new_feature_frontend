import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from "react-native";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar as CalendarIcon,
  RotateCcw,
  Check,
} from "lucide-react-native";

interface CalendarRangePickerProps {
  startDate: string; // "YYYY-MM-DD" or "DD-MM-YYYY" or "DD-MM-YY"
  endDate: string;
  onChange: (start: string, end: string) => void;
  onDone?: () => void;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/**
 * Standardizes any input date string (YYYY-MM-DD, DD-MM-YYYY, DD-MM-YY)
 * into a Date object at local midnight.
 */
function parseDateSafely(val?: string | null): Date | null {
  if (!val || !val.trim()) return null;
  const s = val.trim();

  // YYYY-MM-DD
  const ymd = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10) - 1;
    const d = parseInt(ymd[3], 10);
    return new Date(y, m, d);
  }

  // DD-MM-YYYY or DD-MM-YY
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, m, d);
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Formats Date to YYYY-MM-DD (matches Web Dashboard).
 */
function toYmdString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Formats Date to DD-MM-YYYY (user friendly).
 */
function toDmyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${d}-${m}-${y}`;
}

export const CalendarRangePicker: React.FC<CalendarRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  onDone,
}) => {
  const parsedStart = useMemo(() => parseDateSafely(startDate), [startDate]);
  const parsedEnd = useMemo(() => parseDateSafely(endDate), [endDate]);

  // Initial view month is parsedStart, parsedEnd, or today
  const [viewDate, setViewDate] = useState<Date>(() => {
    return parsedEnd || parsedStart || new Date();
  });

  // Track which box is actively being set ("start" | "end" | "auto")
  const [activeTarget, setActiveTarget] = useState<"start" | "end">("start");

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  // Navigation handlers
  const handlePrevYear = () => setViewDate(new Date(viewYear - 1, viewMonth, 1));
  const handleNextYear = () => setViewDate(new Date(viewYear + 1, viewMonth, 1));
  const handlePrevMonth = () => setViewDate(new Date(viewYear, viewMonth - 1, 1));
  const handleNextMonth = () => setViewDate(new Date(viewYear, viewMonth + 1, 1));

  // Calendar days computation
  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sunday
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: {
      day: number;
      date: Date;
      isCurrentMonth: boolean;
      key: string;
    }[] = [];

    // Empty lead cells
    for (let i = 0; i < firstDayOfWeek; i++) {
      const prevDate = new Date(viewYear, viewMonth, 0 - (firstDayOfWeek - 1 - i));
      cells.push({
        day: prevDate.getDate(),
        date: prevDate,
        isCurrentMonth: false,
        key: `prev-${prevDate.getTime()}`,
      });
    }

    // Days in current month
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curDate = new Date(viewYear, viewMonth, d);
      cells.push({
        day: d,
        date: curDate,
        isCurrentMonth: true,
        key: `cur-${d}`,
      });
    }

    // Trailing cells to fill full 7 columns in last row
    const remainder = cells.length % 7;
    if (remainder !== 0) {
      const needed = 7 - remainder;
      for (let n = 1; n <= needed; n++) {
        const nextDate = new Date(viewYear, viewMonth + 1, n);
        cells.push({
          day: n,
          date: nextDate,
          isCurrentMonth: false,
          key: `next-${n}`,
        });
      }
    }

    return cells;
  }, [viewYear, viewMonth]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Check if a date equals parsedStart / parsedEnd
  const isStartDate = (date: Date) => {
    if (!parsedStart) return false;
    return (
      date.getFullYear() === parsedStart.getFullYear() &&
      date.getMonth() === parsedStart.getMonth() &&
      date.getDate() === parsedStart.getDate()
    );
  };

  const isEndDate = (date: Date) => {
    if (!parsedEnd) return false;
    return (
      date.getFullYear() === parsedEnd.getFullYear() &&
      date.getMonth() === parsedEnd.getMonth() &&
      date.getDate() === parsedEnd.getDate()
    );
  };

  const isInRange = (date: Date) => {
    if (!parsedStart || !parsedEnd) return false;
    const t = date.getTime();
    const s = new Date(
      parsedStart.getFullYear(),
      parsedStart.getMonth(),
      parsedStart.getDate()
    ).getTime();
    const e = new Date(
      parsedEnd.getFullYear(),
      parsedEnd.getMonth(),
      parsedEnd.getDate()
    ).getTime();
    return t > s && t < e;
  };

  const isTodayDate = (date: Date) => {
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  // Indian plant data begins 10-09-2025 on Web Dashboard
  const MIN_SELECTABLE_DATE = useMemo(() => new Date(2025, 8, 10, 0, 0, 0, 0), []);
  const MAX_SELECTABLE_DATE = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999), [today]);

  const isDateSelectable = (date: Date) => {
    const t = date.getTime();
    return t >= MIN_SELECTABLE_DATE.getTime() && t <= MAX_SELECTABLE_DATE.getTime();
  };

  // Day selection logic
  const handleSelectDay = (cellDate: Date) => {
    if (!isDateSelectable(cellDate)) return;

    const formatted = toYmdString(cellDate);

    if (activeTarget === "start") {
      // User tapped while focusing start date
      if (parsedEnd && cellDate.getTime() > parsedEnd.getTime()) {
        // Start is after end: push end forward to match
        onChange(formatted, formatted);
      } else {
        onChange(formatted, parsedEnd ? toYmdString(parsedEnd) : formatted);
      }
      setActiveTarget("end");
    } else {
      // User tapped while focusing end date
      if (parsedStart && cellDate.getTime() < parsedStart.getTime()) {
        // End is before start: reset start to this date
        onChange(formatted, formatted);
        setActiveTarget("end");
      } else {
        onChange(parsedStart ? toYmdString(parsedStart) : formatted, formatted);
        setActiveTarget("start");
      }
    }
  };

  const handleQuickToday = () => {
    const todayStr = toYmdString(today);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    onChange(todayStr, todayStr);
    setActiveTarget("start");
  };

  const handleClear = () => {
    onChange("", "");
    setActiveTarget("start");
  };

  return (
    <View style={styles.container}>
      {/* 1. From & To Input Boxes (Identical to Web Dashboard) */}
      <View style={styles.inputsRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTarget("start")}
          style={[
            styles.dateBox,
            activeTarget === "start" && styles.dateBoxActive,
          ]}
        >
          <Text style={styles.boxLabel}>From</Text>
          <TextInput
            style={styles.boxInput}
            value={startDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            onChangeText={(txt) => onChange(txt, endDate)}
            onFocus={() => setActiveTarget("start")}
          />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTarget("end")}
          style={[
            styles.dateBox,
            activeTarget === "end" && styles.dateBoxActive,
          ]}
        >
          <Text style={styles.boxLabel}>To</Text>
          <TextInput
            style={styles.boxInput}
            value={endDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            onChangeText={(txt) => onChange(startDate, txt)}
            onFocus={() => setActiveTarget("end")}
          />
        </TouchableOpacity>
      </View>

      {/* 2. Calendar Header (Navigation) */}
      <View style={styles.calendarCard}>
        <View style={styles.navRow}>
          <View style={styles.navGroup}>
            <TouchableOpacity
              onPress={handlePrevYear}
              style={styles.navBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronsLeft size={18} color="#2563EB" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePrevMonth}
              style={styles.navBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft size={18} color="#2563EB" />
            </TouchableOpacity>
          </View>

          <Text style={styles.monthTitle}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>

          <View style={styles.navGroup}>
            <TouchableOpacity
              onPress={handleNextMonth}
              style={styles.navBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronRight size={18} color="#2563EB" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleNextYear}
              style={styles.navBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronsRight size={18} color="#2563EB" />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. Weekday Labels */}
        <View style={styles.weekRow}>
          {WEEK_DAYS.map((wd) => (
            <View key={wd} style={styles.weekCol}>
              <Text style={styles.weekText}>{wd}</Text>
            </View>
          ))}
        </View>

        {/* 4. Days Grid */}
        <View style={styles.daysGrid}>
          {calendarCells.map((cell) => {
            const isStart = isStartDate(cell.date);
            const isEnd = isEndDate(cell.date);
            const inRange = isInRange(cell.date);
            const isToday = isTodayDate(cell.date);
            const selectable = isDateSelectable(cell.date);

            return (
              <TouchableOpacity
                key={cell.key}
                activeOpacity={selectable ? 0.7 : 1}
                disabled={!selectable}
                onPress={() => handleSelectDay(cell.date)}
                style={[
                  styles.dayCol,
                  inRange && styles.dayInRange,
                  isStart && styles.dayRangeStart,
                  isEnd && styles.dayRangeEnd,
                  !selectable && { opacity: 0.25 },
                ]}
              >
                <View
                  style={[
                    styles.dayBubble,
                    (isStart || isEnd) && styles.dayBubbleSelected,
                    isToday && !(isStart || isEnd) && styles.dayBubbleToday,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      (!cell.isCurrentMonth || !selectable) && styles.dayTextMuted,
                      (isStart || isEnd) && styles.dayTextSelected,
                      inRange && styles.dayTextInRange,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 5. Quick Helpers (Today / Clear / Done) */}
        <View style={styles.quickBar}>
          <View style={styles.quickBarLeft}>
            <TouchableOpacity onPress={handleQuickToday} style={styles.quickBtn}>
              <CalendarIcon size={13} color="#2563EB" />
              <Text style={styles.quickBtnText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClear} style={styles.quickBtnSecondary}>
              <RotateCcw size={13} color="#64748B" />
              <Text style={styles.quickBtnSecondaryText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {onDone && (
            <TouchableOpacity onPress={onDone} style={styles.quickBtnDone}>
              <Check size={13} color="#FFFFFF" />
              <Text style={styles.quickBtnDoneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
  },
  inputsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  dateBox: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateBoxActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  boxInput: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
    padding: 0,
  },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  navBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
  },
  monthTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 6,
  },
  weekCol: {
    flex: 1,
    alignItems: "center",
  },
  weekText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCol: {
    width: "14.285%", // 7 columns
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 1,
  },
  dayInRange: {
    backgroundColor: "#DBEAFE",
  },
  dayRangeStart: {
    borderTopLeftRadius: 19,
    borderBottomLeftRadius: 19,
    backgroundColor: "#DBEAFE",
  },
  dayRangeEnd: {
    borderTopRightRadius: 19,
    borderBottomRightRadius: 19,
    backgroundColor: "#DBEAFE",
  },
  dayBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleSelected: {
    backgroundColor: "#2563EB",
  },
  dayBubbleToday: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },
  dayText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  dayTextMuted: {
    color: "#CBD5E1",
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  dayTextInRange: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  quickBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  quickBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
  },
  quickBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  quickBtnSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 6,
  },
  quickBtnSecondaryText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  quickBtnDone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: "#2563EB",
    borderRadius: 6,
  },
  quickBtnDoneText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
