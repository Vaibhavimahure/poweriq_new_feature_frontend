/**
 * DateRangeSelector.tsx
 * ----------------------------------------------------------------------------
 * Universal PowerIQ date range, day & billing period selector.
 * Matches design shown in user screenshots:
 * - 3 Segmented Tabs: [ Day ] | [ Range ] | [ Billing Cycle ]
 * - In Range mode:
 *   - "From Date" and "To Date" target cards
 *   - Month navigation (< Month Year >)
 *   - Day grid with endpoint (solid blue #2563EB) & range (#DBEAFE) highlights
 *   - "Apply Range" primary action button
 * - In Day mode:
 *   - Single day selection with "Apply Day" button
 * - In Billing Cycle mode:
 *   - Month / Year selection
 * ----------------------------------------------------------------------------
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Switch,
} from "react-native";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Repeat,
  Check,
} from "lucide-react-native";
import { CONFIG } from "../../config/constants";
import {
  MONTHS_FULL,
  MONTHS_SHORT,
  calculateBillingWindow,
  BillingWindowResult,
  getProductionTodayWindow,
  DEPLOYMENT_YEAR,
  shiftLocalMonth,
} from "../../utils/dashboardWindowUtils";

export interface CustomDateRange {
  mode: "today" | "billing_cycle" | "custom";
  fromSec: number;
  toSec: number;
  prevFromSec?: number;
  prevToSec?: number;
  label: string;
  subLabel: string;
  selectedDate?: string; // YYYY-MM-DD
  startDate?: string;    // YYYY-MM-DD
  endDate?: string;      // YYYY-MM-DD
  displayModeName?: string;
  basis?: "calendar" | "production";
}

interface DateRangeSelectorProps {
  billingWindow: BillingWindowResult;
  onPeriodChange: (year: number, month: number) => void;
  onCustomRangeChange?: (range: CustomDateRange) => void;
  customRange?: CustomDateRange | null;
  showComparisonSubtitle?: boolean;
  shiftStart?: string;
  isProductionTime?: boolean;
  onProductionTimeToggle?: (enabled: boolean) => void;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  billingWindow,
  onPeriodChange,
  onCustomRangeChange,
  customRange,
  showComparisonSubtitle = true,
  shiftStart = "06:00",
  isProductionTime: propIsProdTime,
  onProductionTimeToggle,
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [timeWindowMenuVisible, setTimeWindowMenuVisible] = useState(false);
  const [tabMode, setTabMode] = useState<"day" | "range" | "billing">("range");

  const [internalProdTime, setInternalProdTime] = useState(false);
  const isProdTime = propIsProdTime !== undefined ? propIsProdTime : internalProdTime;

  // Calendar navigator state
  const [calYear, setCalYear] = useState(billingWindow.selectedYear || new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(billingWindow.selectedMonth || new Date().getMonth());

  // Range Picker State
  const [rangeFromDate, setRangeFromDate] = useState<string>("");
  const [rangeToDate, setRangeToDate] = useState<string>("");
  const [activeRangeTarget, setActiveRangeTarget] = useState<"from" | "to">("from");

  // Day Picker State
  const [selectedSingleDay, setSelectedSingleDay] = useState<string>("");

  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(() => {
    const years: number[] = [];
    for (let y = DEPLOYMENT_YEAR; y <= currentYear; y++) {
      years.push(y);
    }
    return years.length ? years : [DEPLOYMENT_YEAR];
  }, [currentYear]);

  // Sync internal range state when modal opens or customRange changes
  useEffect(() => {
    if (customRange?.startDate && customRange?.endDate) {
      setRangeFromDate(customRange.startDate);
      setRangeToDate(customRange.endDate);
      const parts = customRange.startDate.split("-").map(Number);
      if (parts.length === 3) {
        setCalYear(parts[0]);
        setCalMonth(parts[1] - 1);
      }
    } else if (customRange?.selectedDate) {
      setRangeFromDate(customRange.selectedDate);
      setRangeToDate(customRange.selectedDate);
      setSelectedSingleDay(customRange.selectedDate);
      const parts = customRange.selectedDate.split("-").map(Number);
      if (parts.length === 3) {
        setCalYear(parts[0]);
        setCalMonth(parts[1] - 1);
      }
    }
  }, [customRange, modalVisible]);

  const isCustom = customRange && customRange.mode === "custom";
  const isTodayActive = customRange ? customRange.displayModeName === "Today" : false;
  const isBillingCycleActive = !customRange || customRange.mode === "billing_cycle";
  const isCustomActive = isCustom && !isTodayActive;

  const handleToggleProdTime = (val: boolean) => {
    setInternalProdTime(val);
    onProductionTimeToggle?.(val);

    if (isTodayActive || !customRange) {
      selectToday(val);
    } else if (onCustomRangeChange && customRange) {
      if (customRange.startDate && customRange.endDate) {
        applyRangeSelection(customRange.startDate, customRange.endDate, val);
      } else if (customRange.selectedDate) {
        const parts = customRange.selectedDate.split("-").map(Number);
        if (parts.length === 3) {
          selectSingleDay(parts[0], parts[1] - 1, parts[2], val);
        }
      }
    }
  };

  const selectToday = (useProduction = isProdTime) => {
    const win = getProductionTodayWindow({
      basis: useProduction ? "production" : "calendar",
      shiftStart,
    });

    if (onCustomRangeChange) {
      onCustomRangeChange({
        mode: "today",
        fromSec: win.fromSec,
        toSec: win.toSec,
        prevFromSec: win.prevFromSec,
        prevToSec: win.prevToSec,
        label: win.label,
        subLabel: win.subLabel,
        displayModeName: "Today",
        basis: win.basis,
      });
    }
    setTimeWindowMenuVisible(false);
  };

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "Select";
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return "Select";
    const [y, m, d] = parts;
    return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
  };

  const applyRangeSelection = (
    fromYmd: string,
    toYmd: string,
    overrideProdTime?: boolean
  ) => {
    if (!fromYmd || !toYmd) return;
    const effectiveProdTime = overrideProdTime !== undefined ? overrideProdTime : isProdTime;
    const sParts = fromYmd.split("-").map(Number);
    const eParts = toYmd.split("-").map(Number);

    let start: Date;
    let end: Date;

    if (effectiveProdTime) {
      let [sH, sM] = (shiftStart || "06:00").split(":").map(Number);
      if (!Number.isFinite(sH)) sH = 6;
      if (!Number.isFinite(sM)) sM = 0;

      start = new Date(sParts[0], sParts[1] - 1, sParts[2], sH, sM, 0, 0);
      end = new Date(eParts[0], eParts[1] - 1, eParts[2] + 1, sH, sM, 0, 0);
    } else {
      start = new Date(sParts[0], sParts[1] - 1, sParts[2], 0, 0, 0, 0);
      end = new Date(eParts[0], eParts[1] - 1, eParts[2], 23, 59, 59, 999);
    }

    const dStartStr = `${sParts[2]} ${MONTHS_SHORT[sParts[1] - 1]} ${sParts[0]}`;
    const dEndStr = `${eParts[2]} ${MONTHS_SHORT[eParts[1] - 1]} ${eParts[0]}`;
    const label = `${dStartStr} → ${dEndStr}`;
    const subLabel = `${getOrdinal(sParts[2])} ${MONTHS_FULL[sParts[1] - 1]} ${sParts[0]} – ${getOrdinal(eParts[2])} ${MONTHS_FULL[eParts[1] - 1]} ${eParts[0]}`;

    onCustomRangeChange?.({
      mode: "custom",
      fromSec: Math.floor(start.getTime() / 1000),
      toSec: Math.floor(end.getTime() / 1000),
      startDate: fromYmd,
      endDate: toYmd,
      label,
      subLabel,
      displayModeName: `${sParts[2]} ${MONTHS_SHORT[sParts[1] - 1]} - ${eParts[2]} ${MONTHS_SHORT[eParts[1] - 1]}`,
      basis: effectiveProdTime ? "production" : "calendar",
    });
    setModalVisible(false);
  };

  const selectSingleDay = (
    year: number,
    month: number,
    day: number,
    overrideProdTime?: boolean
  ) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const isoDate = `${year}-${pad(month + 1)}-${pad(day)}`;
    setSelectedSingleDay(isoDate);
    applyRangeSelection(isoDate, isoDate, overrideProdTime);
  };

  const selectBillingCycle = (yr: number, mIdx: number) => {
    if (onCustomRangeChange) {
      onCustomRangeChange({
        mode: "billing_cycle",
        fromSec: billingWindow.fromSec,
        toSec: billingWindow.toSec,
        prevFromSec: billingWindow.prevFromSec,
        prevToSec: billingWindow.prevToSec,
        label: billingWindow.progressText,
        subLabel: `Billing Cycle (${MONTHS_SHORT[mIdx]} ${yr})`,
        displayModeName: "Billing Cycle",
        basis: isProdTime ? "production" : "calendar",
      });
    }
    onPeriodChange(yr, mIdx);
    setModalVisible(false);
  };

  // Weeks generator: chunks month days into strict 7-day rows [[d, d, d, d, d, d, d], ...]
  const getWeeksGrid = (yr: number, mo: number): (number | null)[][] => {
    const firstDayIndex = new Date(yr, mo, 1).getDay(); // 0 is Sun, 6 is Sat
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    // Pad to complete the final 7-day week
    while (days.length % 7 !== 0) {
      days.push(null);
    }
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
    }
    return weeks;
  };

  const weeksGrid = useMemo(() => getWeeksGrid(calYear, calMonth), [calYear, calMonth]);
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Handle Day tap in Range Tab
  const handleDayTapInRange = (d: number) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;

    if (activeRangeTarget === "from") {
      setRangeFromDate(dateStr);
      if (rangeToDate && dateStr > rangeToDate) {
        setRangeToDate("");
      }
      setActiveRangeTarget("to");
    } else {
      if (rangeFromDate && dateStr < rangeFromDate) {
        // Reset or flip
        setRangeFromDate(dateStr);
        setRangeToDate("");
        setActiveRangeTarget("to");
      } else {
        setRangeToDate(dateStr);
      }
    }
  };

  const handleApplyRangeBtn = () => {
    if (rangeFromDate && rangeToDate) {
      applyRangeSelection(rangeFromDate, rangeToDate);
    }
  };

  const handleApplyDayBtn = () => {
    if (selectedSingleDay) {
      applyRangeSelection(selectedSingleDay, selectedSingleDay);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.selectorBar}>
        {/* Left Dropdown Pill: Today ▾ / Billing Cycle ▾ / Custom ▾ */}
        <TouchableOpacity
          style={styles.modeDropdownPill}
          onPress={() => setTimeWindowMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.modeDropdownText}>
            {customRange ? (customRange.displayModeName || "Custom") : "Billing Cycle"}
          </Text>
          <ChevronDown size={14} color="#2563EB" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        {/* Right Date Card (Opens Calendar Modal Directly) */}
        <TouchableOpacity
          style={styles.rangeDisplayCard}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.rangeRow}>
            <View style={styles.calendarIconBox}>
              <Calendar size={15} color="#475569" />
            </View>
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={styles.rangeText} numberOfLines={1}>
                {customRange ? customRange.label : billingWindow.progressText}
              </Text>
              <Text style={styles.rangeSubText} numberOfLines={1}>
                {customRange
                  ? customRange.subLabel
                  : `Billing Cycle (${MONTHS_SHORT[billingWindow.selectedMonth]} ${billingWindow.selectedYear})`}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Time Window Dropdown Quick Menu */}
      <Modal
        visible={timeWindowMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimeWindowMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setTimeWindowMenuVisible(false)}
        >
          <View style={styles.timeWindowMenuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.timeWindowHeaderTitle}>Time Window</Text>

            {/* Today */}
            <TouchableOpacity
              style={[styles.timeWindowRow, isTodayActive && styles.timeWindowRowSelected]}
              onPress={() => selectToday(isProdTime)}
            >
              <View style={styles.timeWindowLeft}>
                <Clock size={16} color={isTodayActive ? "#2563EB" : "#64748B"} />
                <Text style={[styles.timeWindowOptionText, isTodayActive && styles.timeWindowOptionTextActive]}>
                  Today
                </Text>
              </View>
              <View style={styles.timeWindowRight}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>Now</Text>
                </View>
                {isTodayActive && <Check size={16} color="#2563EB" style={{ marginLeft: 6 }} />}
              </View>
            </TouchableOpacity>

            {/* Billing Cycle */}
            <TouchableOpacity
              style={[styles.timeWindowRow, isBillingCycleActive && styles.timeWindowRowSelected]}
              onPress={() => {
                selectBillingCycle(billingWindow.selectedYear, billingWindow.selectedMonth);
                setTimeWindowMenuVisible(false);
              }}
            >
              <View style={styles.timeWindowLeft}>
                <Repeat size={16} color={isBillingCycleActive ? "#2563EB" : "#64748B"} />
                <Text style={[styles.timeWindowOptionText, isBillingCycleActive && styles.timeWindowOptionTextActive]}>
                  Billing Cycle
                </Text>
              </View>
              <View style={styles.timeWindowRight}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>Current</Text>
                </View>
                {isBillingCycleActive && <Check size={16} color="#2563EB" style={{ marginLeft: 6 }} />}
              </View>
            </TouchableOpacity>

            {/* Custom Range */}
            <TouchableOpacity
              style={[styles.timeWindowRow, isCustomActive && styles.timeWindowRowSelected]}
              onPress={() => {
                setTimeWindowMenuVisible(false);
                setTabMode("range");
                setModalVisible(true);
              }}
            >
              <View style={styles.timeWindowLeft}>
                <Calendar size={16} color={isCustomActive ? "#2563EB" : "#64748B"} />
                <Text style={[styles.timeWindowOptionText, isCustomActive && styles.timeWindowOptionTextActive]}>
                  Custom Range
                </Text>
              </View>
              <View style={styles.timeWindowRight}>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>Manual</Text>
                </View>
                {isCustomActive && <Check size={16} color="#2563EB" style={{ marginLeft: 6 }} />}
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            {/* Production Time Toggle */}
            <View style={styles.productionTimeBox}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.productionTimeTitle}>Production Time</Text>
                <Text style={styles.productionTimeSub}>
                  Align windows to plant shift start ({shiftStart})
                </Text>
              </View>
              <Switch
                value={isProdTime}
                onValueChange={(val) => handleToggleProdTime(val)}
                trackColor={{ false: "#CBD5E1", true: "#3B82F6" }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Main Calendar Modal (Matching Images 2 & 3) */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            {/* 3 Tabs: Day | Range | Billing Cycle */}
            <View style={styles.tabHeader}>
              <TouchableOpacity
                style={[styles.tabBtn, tabMode === "day" && styles.tabBtnActive]}
                onPress={() => setTabMode("day")}
              >
                <Text style={[styles.tabText, tabMode === "day" && styles.tabTextActive]}>
                  Day
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, tabMode === "range" && styles.tabBtnActive]}
                onPress={() => setTabMode("range")}
              >
                <Text style={[styles.tabText, tabMode === "range" && styles.tabTextActive]}>
                  Range
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, tabMode === "billing" && styles.tabBtnActive]}
                onPress={() => setTabMode("billing")}
              >
                <Text style={[styles.tabText, tabMode === "billing" && styles.tabTextActive]}>
                  Billing Cycle
                </Text>
              </TouchableOpacity>
            </View>

            {/* TAB 1: RANGE (Matching Images 2 & 3) */}
            {tabMode === "range" && (
              <View style={styles.rangeTabContainer}>
                {/* Two side-by-side date selector cards */}
                <View style={styles.rangeBoxesRow}>
                  <TouchableOpacity
                    style={[
                      styles.dateBox,
                      activeRangeTarget === "from" && styles.dateBoxActive,
                    ]}
                    onPress={() => setActiveRangeTarget("from")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dateBoxLabel}>From Date</Text>
                    <Text style={styles.dateBoxValue}>
                      {formatDateDisplay(rangeFromDate)}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.dateBox,
                      activeRangeTarget === "to" && styles.dateBoxActive,
                    ]}
                    onPress={() => setActiveRangeTarget("to")}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.dateBoxLabel}>To Date</Text>
                    <Text style={styles.dateBoxValue}>
                      {formatDateDisplay(rangeToDate)}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Month navigation row: < September 2026 > */}
                <View style={styles.calNavRow}>
                  <TouchableOpacity
                    onPress={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear(calYear - 1);
                      } else {
                        setCalMonth(calMonth - 1);
                      }
                    }}
                    style={styles.calNavCircularBtn}
                  >
                    <ChevronLeft size={20} color="#1E293B" />
                  </TouchableOpacity>

                  <Text style={styles.calMonthTitle}>
                    {MONTHS_FULL[calMonth]} {calYear}
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      const now = new Date();
                      if (
                        calYear > now.getFullYear() ||
                        (calYear === now.getFullYear() && calMonth >= now.getMonth())
                      ) {
                        return;
                      }
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear(calYear + 1);
                      } else {
                        setCalMonth(calMonth + 1);
                      }
                    }}
                    style={styles.calNavCircularBtn}
                  >
                    <ChevronRight size={20} color="#1E293B" />
                  </TouchableOpacity>
                </View>

                {/* Weekdays header */}
                <View style={styles.weekdayRow}>
                  {weekdays.map((w) => (
                    <View key={w} style={styles.dayCol}>
                      <Text style={styles.weekdayText}>{w}</Text>
                    </View>
                  ))}
                </View>

                {/* Day numbers grid with range highlight (strict 7-day rows) */}
                <View style={styles.calendarBody}>
                  {weeksGrid.map((week, wIdx) => (
                    <View key={`range-week-${wIdx}`} style={styles.weekRow}>
                      {week.map((d, colIdx) => {
                        if (d === null) {
                          return <View key={`empty-${wIdx}-${colIdx}`} style={styles.dayCol} />;
                        }
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;

                        const isStart = rangeFromDate === dateStr;
                        const isEnd = rangeToDate === dateStr;
                        const isBetween =
                          Boolean(rangeFromDate && rangeToDate) &&
                          dateStr > rangeFromDate &&
                          dateStr < rangeToDate;

                        const now = new Date();
                        const isFuture =
                          calYear > now.getFullYear() ||
                          (calYear === now.getFullYear() && calMonth > now.getMonth()) ||
                          (calYear === now.getFullYear() &&
                            calMonth === now.getMonth() &&
                            d > now.getDate());

                        return (
                          <View key={`range-col-${d}`} style={styles.dayCol}>
                            <TouchableOpacity
                              style={[
                                styles.dayCell,
                                (isStart || isEnd) && styles.dayCellEndpoint,
                                isBetween && styles.dayCellBetween,
                                isFuture && styles.dayCellDisabled,
                              ]}
                              disabled={isFuture}
                              onPress={() => handleDayTapInRange(d)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dayNumberText,
                                  (isStart || isEnd) && styles.dayNumberTextEndpoint,
                                  isBetween && styles.dayNumberTextBetween,
                                  isFuture && styles.dayNumberTextDisabled,
                                ]}
                              >
                                {d}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Apply Range Button */}
                <TouchableOpacity
                  style={[
                    styles.applyRangeBtn,
                    (!rangeFromDate || !rangeToDate) && styles.applyRangeBtnDisabled,
                  ]}
                  disabled={!rangeFromDate || !rangeToDate}
                  onPress={handleApplyRangeBtn}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.applyRangeBtnText,
                      (!rangeFromDate || !rangeToDate) && styles.applyRangeBtnTextDisabled,
                    ]}
                  >
                    Apply Range
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 2: DAY (Single Date Selection) */}
            {tabMode === "day" && (
              <View style={styles.rangeTabContainer}>
                {/* Month navigation row: < Month Year > */}
                <View style={styles.calNavRow}>
                  <TouchableOpacity
                    onPress={() => {
                      if (calMonth === 0) {
                        setCalMonth(11);
                        setCalYear(calYear - 1);
                      } else {
                        setCalMonth(calMonth - 1);
                      }
                    }}
                    style={styles.calNavCircularBtn}
                  >
                    <ChevronLeft size={20} color="#1E293B" />
                  </TouchableOpacity>

                  <Text style={styles.calMonthTitle}>
                    {MONTHS_FULL[calMonth]} {calYear}
                  </Text>

                  <TouchableOpacity
                    onPress={() => {
                      const now = new Date();
                      if (
                        calYear > now.getFullYear() ||
                        (calYear === now.getFullYear() && calMonth >= now.getMonth())
                      ) {
                        return;
                      }
                      if (calMonth === 11) {
                        setCalMonth(0);
                        setCalYear(calYear + 1);
                      } else {
                        setCalMonth(calMonth + 1);
                      }
                    }}
                    style={styles.calNavCircularBtn}
                  >
                    <ChevronRight size={20} color="#1E293B" />
                  </TouchableOpacity>
                </View>

                {/* Weekday headers */}
                <View style={styles.weekdayRow}>
                  {weekdays.map((w) => (
                    <View key={w} style={styles.dayCol}>
                      <Text style={styles.weekdayText}>{w}</Text>
                    </View>
                  ))}
                </View>

                {/* Day numbers grid (strict 7-day rows) */}
                <View style={styles.calendarBody}>
                  {weeksGrid.map((week, wIdx) => (
                    <View key={`day-week-${wIdx}`} style={styles.weekRow}>
                      {week.map((d, colIdx) => {
                        if (d === null) {
                          return <View key={`empty-day-${wIdx}-${colIdx}`} style={styles.dayCol} />;
                        }
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const dateStr = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
                        const isSelected = selectedSingleDay === dateStr;

                        const now = new Date();
                        const isFuture =
                          calYear > now.getFullYear() ||
                          (calYear === now.getFullYear() && calMonth > now.getMonth()) ||
                          (calYear === now.getFullYear() &&
                            calMonth === now.getMonth() &&
                            d > now.getDate());

                        return (
                          <View key={`day-col-${d}`} style={styles.dayCol}>
                            <TouchableOpacity
                              style={[
                                styles.dayCell,
                                isSelected && styles.dayCellEndpoint,
                                isFuture && styles.dayCellDisabled,
                              ]}
                              disabled={isFuture}
                              onPress={() => setSelectedSingleDay(dateStr)}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dayNumberText,
                                  isSelected && styles.dayNumberTextEndpoint,
                                  isFuture && styles.dayNumberTextDisabled,
                                ]}
                              >
                                {d}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* Apply Day Button */}
                <TouchableOpacity
                  style={[
                    styles.applyRangeBtn,
                    !selectedSingleDay && styles.applyRangeBtnDisabled,
                  ]}
                  disabled={!selectedSingleDay}
                  onPress={handleApplyDayBtn}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.applyRangeBtnText,
                      !selectedSingleDay && styles.applyRangeBtnTextDisabled,
                    ]}
                  >
                    Apply Day
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* TAB 3: BILLING CYCLE */}
            {tabMode === "billing" && (
              <ScrollView style={{ maxHeight: 340 }}>
                {availableYears.map((yr) => (
                  <View key={yr} style={styles.yearSection}>
                    <Text style={styles.yearLabel}>{yr}</Text>
                    <View style={styles.monthGrid}>
                      {MONTHS_SHORT.map((mName, mIdx) => {
                        const now = new Date();
                        const isFuture =
                          yr > now.getFullYear() ||
                          (yr === now.getFullYear() && mIdx > now.getMonth());
                        const isSelected =
                          !isCustom &&
                          yr === billingWindow.selectedYear &&
                          mIdx === billingWindow.selectedMonth;

                        return (
                          <TouchableOpacity
                            key={mName}
                            style={[
                              styles.monthCell,
                              isSelected && styles.selectedMonthCell,
                              isFuture && styles.disabledMonthCell,
                            ]}
                            disabled={isFuture}
                            onPress={() => selectBillingCycle(yr, mIdx)}
                          >
                            <Text
                              style={[
                                styles.monthText,
                                isSelected && styles.selectedMonthText,
                                isFuture && styles.disabledMonthText,
                              ]}
                            >
                              {mName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CONFIG.THEME.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  selectorBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeDropdownPill: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  modeDropdownText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
    lineHeight: 18,
    includeFontPadding: false,
  },
  rangeDisplayCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: "center",
    minHeight: 48,
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  calendarIconBox: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 7,
    padding: 5,
    marginRight: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  rangeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 18,
    includeFontPadding: false,
  },
  rangeSubText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 14,
    marginTop: 2,
    includeFontPadding: false,
  },
  // Modal Backdrop
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalContent: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  // 3 Tabs Header: Day | Range | Billing Cycle
  tabHeader: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  tabTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  // Range Tab Elements
  rangeTabContainer: {
    width: "100%",
  },
  rangeBoxesRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  dateBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateBoxActive: {
    borderColor: "#3B82F6",
    borderWidth: 1.5,
    backgroundColor: "#EFF6FF",
  },
  dateBoxLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    marginBottom: 4,
  },
  dateBoxValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  // Month Navigation Row
  calNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 6,
  },
  calNavCircularBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  calMonthTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  // Weekday Row (Strict 7-day columns)
  weekdayRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  weekdayText: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "700",
    color: "#64748B",
  },
  // Calendar Body & Week Rows (Guaranteed 7-day alignment)
  calendarBody: {
    width: "100%",
  },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 38,
  },
  dayCell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  dayCellEndpoint: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
  },
  dayCellBetween: {
    backgroundColor: "#DBEAFE",
    borderRadius: 6,
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayNumberText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  dayNumberTextEndpoint: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  dayNumberTextBetween: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  dayNumberTextDisabled: {
    color: "#94A3B8",
  },
  // Apply Range Button
  applyRangeBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  applyRangeBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  applyRangeBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  applyRangeBtnTextDisabled: {
    color: "#FFFFFF",
  },
  // Time Window Menu Styles
  timeWindowMenuCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    ...CONFIG.THEME.shadowCard,
  },
  timeWindowHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  timeWindowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  timeWindowRowSelected: {
    backgroundColor: "#EFF6FF",
  },
  timeWindowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  timeWindowOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
    marginLeft: 10,
  },
  timeWindowOptionTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  timeWindowRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  badgePill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 10,
  },
  productionTimeBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  productionTimeTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0F172A",
  },
  productionTimeSub: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  // Billing cycle month grid
  yearSection: {
    marginBottom: 14,
  },
  yearLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    marginBottom: 8,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  monthCell: {
    width: "22%",
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedMonthCell: {
    backgroundColor: "#2563EB",
  },
  disabledMonthCell: {
    opacity: 0.35,
  },
  monthText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },
  selectedMonthText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  disabledMonthText: {
    color: "#94A3B8",
  },
});
