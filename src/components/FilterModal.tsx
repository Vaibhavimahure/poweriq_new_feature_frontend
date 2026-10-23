/**
 * FilterModal.tsx — PowerIQ Filter Bottom Sheet / Modal (Light Mode)
 * ----------------------------------------------------------------------------
 * Industrial filter modal supporting:
 *  - Date Range Presets (Today, All Time, Yesterday, Last 7 Days, Last 30 Days, Custom Range)
 *  - Alert Messages (All Messages, Critical, Warning, Returned to Normal)
 *  - Users (All Users, list of users)
 *  - Panels (All Panels, list of panels / equipments e.g. Flat Drip Kabra Panel)
 *  - Performance Metrics (All Metrics, list of metrics)
 *  - Counter (All Counters, 0, 1, 2, 3, 4, 5+)
 *  - Timer / Duration (All Durations, < 15m, 15m - 1h, 1h - 4h, > 4h)
 *  - Acknowledgement (All, Acknowledged, Unacknowledged)
 *  - Resolution (All, Solved, Unsolved)
 *  - Rows (10, 20, 30, 50)
 *  - Clear all & Apply action buttons
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from "react-native";
import { CONFIG } from "../config/constants";
import { DatePreset } from "../types/alert";
import { FilterState, getTodayYmd } from "../context/AlertContext";
import { CalendarRangePicker } from "./CalendarRangePicker";
import { formatSelectDatesInput } from "../utils/dateFormatter";
import {
  X,
  Calendar,
  RotateCcw,
  Check,
  ChevronDown,
  Layers,
  Filter,
  User as UserIcon,
  Activity,
  Hash,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ListFilter,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  availablePanels: string[];
  availableUsers?: string[];
  availableMetrics?: string[];
  currentFilters: FilterState;
  totalCount: number;
  onApply: (newFilters: FilterState) => void;
  onReset: () => void;
}

export const FilterModal: React.FC<FilterModalProps> = ({
  visible,
  onClose,
  availablePanels,
  availableUsers = [],
  availableMetrics = [
    "Current Imbalance %",
    "LL Voltage Imbalance %",
    "Power Factor",
    "THD – Current %",
  ],
  currentFilters,
  totalCount,
  onApply,
  onReset,
}) => {
  const insets = useSafeAreaInsets();

  const [datePreset, setDatePreset] = useState<DatePreset>(currentFilters.datePreset || "custom");
  const [customStart, setCustomStart] = useState(currentFilters.customStartDate || getTodayYmd());
  const [customEnd, setCustomEnd] = useState(currentFilters.customEndDate || getTodayYmd());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [messageKey, setMessageKey] = useState(currentFilters.messageKey || "ALL");
  const [user, setUser] = useState(currentFilters.user || "ALL");
  const [panel, setPanel] = useState(currentFilters.panel || "");
  const [metric, setMetric] = useState(currentFilters.tag || "");
  const [counter, setCounter] = useState(currentFilters.counter || "ALL");
  const [timer, setTimer] = useState(currentFilters.timer || "ALL");
  const [status, setStatus] = useState(currentFilters.status || "ALL");
  const [resolution, setResolution] = useState(currentFilters.resolution || "ALL");
  const [pageSize, setPageSize] = useState<number>(currentFilters.pageSize || 20);

  // Active accordion dropdown: 'message' | 'user' | 'panel' | 'metric' | 'counter' | 'timer' | 'ack' | 'resolution' | 'rows' | null
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Sync state when modal opens
  useEffect(() => {
    if (visible) {
      const nowYmd = getTodayYmd();
      setDatePreset(currentFilters.datePreset || "custom");
      setCustomStart(currentFilters.customStartDate || nowYmd);
      setCustomEnd(currentFilters.customEndDate || nowYmd);
      setIsCalendarOpen(false); // Calendar is collapsed by default!
      setMessageKey(currentFilters.messageKey || "ALL");
      setUser(currentFilters.user || "ALL");
      setPanel(currentFilters.panel || "");
      setMetric(currentFilters.tag || "");
      setCounter(currentFilters.counter || "ALL");
      setTimer(currentFilters.timer || "ALL");
      setStatus(currentFilters.status || "ALL");
      setResolution(currentFilters.resolution || "ALL");
      setPageSize(currentFilters.pageSize || 20);
      setOpenDropdown(null);
    }
  }, [visible, currentFilters]);

  const toggleDropdown = (key: string) => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  const handleApply = () => {
    const fallback = getTodayYmd();
    onApply({
      severity: currentFilters.severity,
      status,
      resolution,
      datePreset: "custom",
      customStartDate: customStart.trim() || fallback,
      customEndDate: customEnd.trim() || fallback,
      panel,
      tag: metric,
      user,
      counter,
      timer,
      messageKey,
      pageSize,
    });
    onClose();
  };

  const handleReset = () => {
    const nowYmd = getTodayYmd();
    setDatePreset("custom");
    setCustomStart(nowYmd);
    setCustomEnd(nowYmd);
    setIsCalendarOpen(false);
    setMessageKey("ALL");
    setUser("ALL");
    setPanel("");
    setMetric("");
    setCounter("ALL");
    setTimer("ALL");
    setStatus("ALL");
    setResolution("ALL");
    setPageSize(20);
    setOpenDropdown(null);
    onReset();
    onClose();
  };

  const datePresets: { id: DatePreset; label: string }[] = [
    { id: "today", label: "Today" },
    { id: "all", label: "All Time" },
    { id: "yesterday", label: "Yesterday" },
    { id: "week", label: "Last 7 Days" },
    { id: "month", label: "Last 30 Days" },
    { id: "custom", label: "Custom Range" },
  ];

  const messageOptions = [
    { id: "ALL", label: "All Messages" },
    { id: "WARNING", label: "Warning" },
    { id: "CRITICAL", label: "Critical" },
    { id: "NORMAL", label: "Returned to Normal" },
  ];

  const counterOptions = [
    { id: "ALL", label: "All Counters" },
    { id: "Under 5", label: "Under 5" },
    { id: "5+", label: "5+" },
    { id: "10+", label: "10+" },
    { id: "15+", label: "15+" },
  ];

  const timerOptions = [
    { id: "ALL", label: "All Durations" },
    { id: "Under 1 Hr", label: "Under 1 Hr" },
    { id: "More than 1 Hr", label: "More than 1 Hr" },
    { id: "More than 5 Hr", label: "More than 5 Hr" },
    { id: "More than 10 Hr", label: "More than 10 Hr" },
    { id: "More than 24 Hr", label: "More than 24 Hr" },
  ];

  const ackOptions = [
    { id: "ALL", label: "All" },
    { id: "acknowledged", label: "Acknowledged" },
    { id: "open", label: "Unacknowledged" },
  ];

  const resolutionOptions = [
    { id: "ALL", label: "All" },
    { id: "solved", label: "Solved" },
    { id: "unsolved", label: "Unsolved" },
  ];

  const rowsOptions = [10, 20, 30, 50];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Filters</Text>
              <Text style={styles.subtitle}>Select one or more filters and apply</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollBody}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            {/* 1. Select Dates Field (Matching Web Dashboard Reference Image) */}
            <View style={styles.datePickerSection}>
              <View style={styles.dateInputWrapper}>
                {/* Outlined Notch Label */}
                <View style={styles.notchLabelContainer}>
                  <Text style={[styles.notchLabelText, isCalendarOpen && styles.notchLabelTextActive]}>
                    Select Dates
                  </Text>
                </View>

                {/* Clickable Date Range Box */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsCalendarOpen((prev) => !prev)}
                  style={[
                    styles.dateTriggerBox,
                    isCalendarOpen && styles.dateTriggerBoxActive,
                  ]}
                >
                  <Text style={styles.dateTriggerText}>
                    {formatSelectDatesInput(customStart, customEnd)}
                  </Text>
                  <Calendar size={20} color={isCalendarOpen ? "#2563EB" : "#64748B"} />
                </TouchableOpacity>
              </View>

              {/* Expandable Calendar Picker */}
              {isCalendarOpen && (
                <View style={styles.calendarDropdownContainer}>
                  <CalendarRangePicker
                    startDate={customStart}
                    endDate={customEnd}
                    onChange={(s, e) => {
                      setCustomStart(s);
                      setCustomEnd(e);
                    }}
                    onDone={() => setIsCalendarOpen(false)}
                  />
                </View>
              )}
            </View>

            {/* 2. Alert Messages */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Alert Messages</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("message")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "message" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {messageOptions.find((m) => m.id === messageKey)?.label || "All Messages"}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "message" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {messageOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        setMessageKey(opt.id);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        messageKey === opt.id && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          messageKey === opt.id && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {messageKey === opt.id && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 3. Users */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Users</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("user")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "user" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {user === "ALL" ? "All Users" : user}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "user" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    onPress={() => {
                      setUser("ALL");
                      setOpenDropdown(null);
                    }}
                    style={[
                      styles.dropdownOption,
                      user === "ALL" && styles.dropdownOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        user === "ALL" && styles.dropdownOptionTextActive,
                      ]}
                    >
                      All Users
                    </Text>
                    {user === "ALL" && <Check size={16} color="#2563EB" />}
                  </TouchableOpacity>

                  {availableUsers.map((u) => (
                    <TouchableOpacity
                      key={u}
                      onPress={() => {
                        setUser(u);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        user === u && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          user === u && styles.dropdownOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {u}
                      </Text>
                      {user === u && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 4. Panels */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Panels</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("panel")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "panel" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {panel || "All Panels"}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "panel" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    onPress={() => {
                      setPanel("");
                      setOpenDropdown(null);
                    }}
                    style={[
                      styles.dropdownOption,
                      !panel && styles.dropdownOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        !panel && styles.dropdownOptionTextActive,
                      ]}
                    >
                      All Panels
                    </Text>
                    {!panel && <Check size={16} color="#2563EB" />}
                  </TouchableOpacity>

                  {availablePanels.map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => {
                        setPanel(p);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        panel === p && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          panel === p && styles.dropdownOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {p}
                      </Text>
                      {panel === p && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 5. Performance Metrics */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Performance Metrics</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("metric")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "metric" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {metric || "All Metrics"}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "metric" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  <TouchableOpacity
                    onPress={() => {
                      setMetric("");
                      setOpenDropdown(null);
                    }}
                    style={[
                      styles.dropdownOption,
                      !metric && styles.dropdownOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        !metric && styles.dropdownOptionTextActive,
                      ]}
                    >
                      All Metrics
                    </Text>
                    {!metric && <Check size={16} color="#2563EB" />}
                  </TouchableOpacity>

                  {availableMetrics.map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => {
                        setMetric(m);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        metric === m && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          metric === m && styles.dropdownOptionTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {m}
                      </Text>
                      {metric === m && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 6. Counter */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Counter</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("counter")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "counter" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {counter === "ALL" ? "All Counters" : counter}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "counter" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {counterOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        setCounter(opt.id);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        counter === opt.id && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          counter === opt.id && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {counter === opt.id && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 7. Timer */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Timer</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("timer")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "timer" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {timer === "ALL" ? "All Durations" : timer}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "timer" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {timerOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        setTimer(opt.id);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        timer === opt.id && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          timer === opt.id && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {timer === opt.id && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 8. Acknowledgement */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Acknowledgement</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("ack")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "ack" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {ackOptions.find((a) => a.id === status)?.label || "All"}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "ack" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {ackOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        setStatus(opt.id);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        status === opt.id && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          status === opt.id && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {status === opt.id && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* 9. Resolution */}
            <View style={styles.dropdownSection}>
              <Text style={styles.dropdownLabel}>Resolution</Text>
              <TouchableOpacity
                onPress={() => toggleDropdown("resolution")}
                style={[
                  styles.dropdownTrigger,
                  openDropdown === "resolution" && styles.dropdownTriggerActive,
                ]}
              >
                <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                  {resolutionOptions.find((r) => r.id === resolution)?.label || "All"}
                </Text>
                <ChevronDown size={16} color="#64748B" />
              </TouchableOpacity>

              {openDropdown === "resolution" && (
                <ScrollView style={styles.dropdownList} nestedScrollEnabled={true} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled">
                  {resolutionOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => {
                        setResolution(opt.id);
                        setOpenDropdown(null);
                      }}
                      style={[
                        styles.dropdownOption,
                        resolution === opt.id && styles.dropdownOptionActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          resolution === opt.id && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      {resolution === opt.id && <Check size={16} color="#2563EB" />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={handleReset}
              style={styles.clearAllBtn}
              activeOpacity={0.7}
            >
              <Text style={styles.clearAllBtnText}>Clear all</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleApply}
              style={styles.applyBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    paddingTop: 16,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  scrollBody: {
    paddingVertical: 14,
  },
  datePickerSection: {
    marginBottom: 16,
    marginTop: 6,
  },
  dateInputWrapper: {
    position: "relative",
  },
  notchLabelContainer: {
    position: "absolute",
    top: -8,
    left: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    zIndex: 2,
  },
  notchLabelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    letterSpacing: 0.2,
  },
  notchLabelTextActive: {
    color: "#2563EB",
  },
  dateTriggerBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "#FFFFFF",
  },
  dateTriggerBoxActive: {
    borderColor: "#2563EB",
    backgroundColor: "#F8FAFC",
  },
  dateTriggerText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  calendarDropdownContainer: {
    marginTop: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownSection: {
    marginBottom: 14,
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 5,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  dropdownTriggerActive: {
    borderColor: "#2563EB",
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownTriggerText: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  dropdownList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#CBD5E1",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: "#FFFFFF",
    maxHeight: 220,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 6,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  dropdownOptionActive: {
    backgroundColor: "#F0F7FF",
  },
  dropdownOptionText: {
    fontSize: 13,
    color: "#334155",
    flex: 1,
    marginRight: 8,
  },
  dropdownOptionTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  clearAllBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  clearAllBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
