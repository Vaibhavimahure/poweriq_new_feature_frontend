import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  AlertItem,
  AlertCounters,
  AlertStatus,
  DatePreset,
  ApplyScope,
  isAlertAcknowledged,
  ListAlertsQuery,
  isAlertSolved,
  isAlertSolvedBySystem,
  getLifecycleDisplayState,
  getAlertDeduplicationKey,
  getUniqueAlertId,
} from "../types/alert";
import { alertApi } from "../api/alertApi";
import {
  applyLifecycleAction,
  syncLifecycleAck,
  ensureAlertLifecycle,
  decorateAlertsWithLifecycle,
  getLifecycleAlertId,
  fetchLifecycleSummary,
} from "../api/lifecycleApi";
import { getAlertBaseUrl } from "../api/alertClient";
import { socketService, ConnectionStatus } from "../services/socketService";
import { soundService } from "../services/soundService";
import { useAuth } from "./AuthContext";
import {
  getSeveritySoundPreference,
  notifyForRealtimeAlert,
  normalizeSeverity,
  getOwnerNotificationsEnabled,
  isMdAlert,
} from "../config/notifications";
import { isNotificationEligibleRole, isOwnerRole, normalizeRole, logPowerIQRoleDebug } from "../utils/role";
import {
  setupPushNotificationListeners,
  markAlertProcessed,
  isAlertProcessed,
} from "../services/pushNotificationService";
import { CONFIG } from "../config/constants";
import { storage } from "../services/storage";
import { parseDateInputToIso, parseDateInputToNaiveIso } from "../utils/dateFormatter";

import { getPerformanceMetricName } from "../utils/metrics";

export interface FilterState {
  severity: string; // "ALL" | "critical" | "warning" | "info"
  status: string; // "ALL" | "open" | "acknowledged" | "unsolved" | "solved"
  resolution: string; // "ALL" | "solved" | "unsolved"
  datePreset?: DatePreset;
  customStartDate: string | null;
  customEndDate: string | null;
  panel: string; // "" | "ALL" | specific panel_name / panel_id / device_id
  tag: string; // "" | "ALL" | specific metric / tag name
  user: string; // "ALL" | specific user name
  counter: string; // "ALL" | "0" | "1" | "2" | "3" | "4" | "5+"
  timer: string; // "ALL" | "< 15m" | "15m - 1h" | "1h - 4h" | "> 4h"
  messageKey: string; // "ALL" | "CRITICAL" | "WARNING" | "NORMAL"
  pageSize?: number;
}

export function matchesActiveFilters(
  alert: AlertItem,
  filters: FilterState,
  searchQuery: string
): boolean {
  if (!alert) return false;

  // 1. Severity filter
  if (filters.severity && filters.severity !== "ALL") {
    const alertSev = (alert.severity || "").toLowerCase();
    if (alertSev !== filters.severity.toLowerCase()) {
      return false;
    }
  }

  // 2. Alert Message Key filter (Critical, Warning, Returned to Normal)
  if (filters.messageKey && filters.messageKey !== "ALL") {
    const msgKey = filters.messageKey.toUpperCase();
    const alertMsg = (alert.message || "").toLowerCase();
    const alertSev = (alert.severity || "").toLowerCase();
    if (msgKey === "CRITICAL") {
      if (!alertMsg.includes("crit") && alertSev !== "critical") return false;
    } else if (msgKey === "WARNING") {
      if (!alertMsg.includes("warn") && alertSev !== "warning") return false;
    } else if (msgKey === "NORMAL") {
      if (!alertMsg.includes("normal") && !alertMsg.includes("returned")) return false;
    }
  }

  // 3. Status filter (acknowledgement & lifecycle state)
  if (filters.status && filters.status !== "ALL") {
    const targetStatus = filters.status.toLowerCase();

    if (targetStatus === "open" || targetStatus === "unacknowledged") {
      if (isAlertAcknowledged(alert)) return false;
      if (filters.resolution !== "solved" && isAlertSolved(alert)) return false;
    } else if (targetStatus === "acknowledged") {
      if (!isAlertAcknowledged(alert)) return false;
      if (filters.resolution !== "solved" && isAlertSolved(alert)) return false;
    } else if (targetStatus === "unsolved") {
      if (isAlertSolved(alert)) return false;
    } else if (targetStatus === "cleared" || targetStatus === "solved") {
      if (!isAlertSolved(alert)) return false;
    } else if (targetStatus === "solved_by_system") {
      if (!isAlertSolvedBySystem(alert)) return false;
    }
  }

  // 4. Resolution filter (Solved / Unsolved)
  if (filters.resolution && filters.resolution !== "ALL") {
    const targetRes = filters.resolution.toLowerCase();
    const isSolved = isAlertSolved(alert);
    if (targetRes === "solved" && !isSolved) return false;
    if (targetRes === "unsolved" && isSolved) return false;
  }

  // 5. Panel / Equipment filter (CRITICAL FIX: case-insensitive, name, ID, location, or device_id match)
  if (filters.panel && filters.panel !== "ALL" && filters.panel.trim() !== "") {
    const target = filters.panel.trim().toLowerCase();
    const pName = (alert.panel_name || "").trim().toLowerCase();
    const pId = (alert.panel_id || "").trim().toLowerCase();
    const dId = (alert.device_id || (alert as any).did || "").trim().toLowerCase();
    const location = (alert.panel_location || "").trim().toLowerCase();

    if (
      pName !== target &&
      pId !== target &&
      dId !== target &&
      location !== target &&
      !pName.includes(target)
    ) {
      return false;
    }
  }

  // 6. User filter (matches ack_user, solved_user, clear_user)
  if (filters.user && filters.user !== "ALL" && filters.user.trim() !== "") {
    const targetUser = filters.user.trim().toLowerCase();
    const alertUsers = [
      alert.ack_user,
      alert.ack_user_name,
      alert.ack_user_email,
      alert.clear_user,
      alert.solved_user,
      alert.solved_user_name,
      alert.solved_user_email,
      (alert as any).user,
    ]
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean);

    if (!alertUsers.some((u) => u === targetUser || u.includes(targetUser))) {
      return false;
    }
  }

  // 7. Performance Metric / Tag filter
  if (filters.tag && filters.tag !== "ALL" && filters.tag.trim() !== "") {
    const targetTag = filters.tag.trim().toLowerCase();
    const tag = (alert.tag_name || "").trim().toLowerCase();
    const metricKey = (alert.metric_key || "").trim().toLowerCase();
    const humanName = getPerformanceMetricName(alert.tag_name).trim().toLowerCase();

    if (
      tag !== targetTag &&
      metricKey !== targetTag &&
      humanName !== targetTag &&
      !humanName.includes(targetTag)
    ) {
      return false;
    }
  }

  // 8. Occurrence Counter filter
  if (filters.counter && filters.counter !== "ALL" && filters.counter.trim() !== "") {
    const c = Number(alert.occurrence_counter ?? 0);
    if (filters.counter === "Under 5" && c >= 5) return false;
    if (filters.counter === "5+" && c < 5) return false;
    if (filters.counter === "10+" && c < 10) return false;
    if (filters.counter === "15+" && c < 15) return false;
  }

  // 9. Duration / Timer filter (active_accumulated_ms in milliseconds)
  if (filters.timer && filters.timer !== "ALL" && filters.timer.trim() !== "") {
    const ms = Number(alert.active_accumulated_ms ?? 0);
    const hours = ms / (1000 * 60 * 60);
    if (filters.timer === "Under 1 Hr" && hours >= 1) return false;
    if (filters.timer === "More than 1 Hr" && hours < 1) return false;
    if (filters.timer === "More than 5 Hr" && hours < 5) return false;
    if (filters.timer === "More than 10 Hr" && hours < 10) return false;
    if (filters.timer === "More than 24 Hr" && hours < 24) return false;
  }

  // 10. Search query filter (matches panel, tag, metric, device, message, user, severity)
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    const searchable = [
      alert.panel_name,
      alert.panel_location,
      alert.panel_id,
      alert.tag_name,
      alert.metric_key,
      getPerformanceMetricName(alert.tag_name),
      alert.device_id,
      (alert as any).did,
      alert.message,
      alert.severity,
      alert.ack_user,
      alert.ack_user_name,
      alert.ack_user_email,
      alert.clear_user,
      alert.solved_user,
      alert.solved_user_name,
      alert.solved_user_email,
      (alert as any).user,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!searchable.includes(q)) {
      return false;
    }
  }

  return true;
}

/**
 * Scopes alert rows for Summary Counters (Total Alerts, Pending Critical, Pending Warning, Total Solved, Solved By System).
 * Evaluates active filter modal parameters (Panel, User, Metric/Tag, MessageKey, Counter, Timer, Resolution, Acknowledgement).
 * Matches the Web Dashboard AlertLogPage.jsx totalsView calculation.
 */
export function matchesSummaryFilters(
  alert: AlertItem,
  filters: FilterState
): boolean {
  if (!alert) return false;

  // 1. Panel / Equipment filter (case-insensitive match on name, id, device_id, location)
  if (filters.panel && filters.panel !== "ALL" && filters.panel.trim() !== "") {
    const target = filters.panel.trim().toLowerCase();
    const pName = (alert.panel_name || "").trim().toLowerCase();
    const pId = (alert.panel_id || "").trim().toLowerCase();
    const dId = (alert.device_id || (alert as any).did || "").trim().toLowerCase();
    const location = (alert.panel_location || "").trim().toLowerCase();

    if (
      pName !== target &&
      pId !== target &&
      dId !== target &&
      location !== target &&
      !pName.includes(target)
    ) {
      return false;
    }
  }

  // 2. User filter (matches ack_user, solved_user, clear_user, user)
  if (filters.user && filters.user !== "ALL" && filters.user.trim() !== "") {
    const targetUser = filters.user.trim().toLowerCase();
    const alertUsers = [
      alert.ack_user,
      alert.ack_user_name,
      alert.ack_user_email,
      alert.clear_user,
      alert.solved_user,
      alert.solved_user_name,
      alert.solved_user_email,
      (alert as any).user,
    ]
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean);

    if (!alertUsers.some((u) => u === targetUser || u.includes(targetUser))) {
      return false;
    }
  }

  // 3. Performance Metric / Tag filter
  if (filters.tag && filters.tag !== "ALL" && filters.tag.trim() !== "") {
    const targetTag = filters.tag.trim().toLowerCase();
    const tag = (alert.tag_name || "").trim().toLowerCase();
    const metricKey = (alert.metric_key || "").trim().toLowerCase();
    const humanName = getPerformanceMetricName(alert.tag_name).trim().toLowerCase();

    if (
      tag !== targetTag &&
      metricKey !== targetTag &&
      humanName !== targetTag &&
      !humanName.includes(targetTag)
    ) {
      return false;
    }
  }

  // 4. Alert Message Key filter (Critical, Warning, Returned to Normal)
  if (filters.messageKey && filters.messageKey !== "ALL" && filters.messageKey.trim() !== "") {
    const msgKey = filters.messageKey.toUpperCase();
    const alertMsg = (alert.message || "").toLowerCase();
    const alertSev = (alert.severity || "").toLowerCase();
    if (msgKey === "CRITICAL") {
      if (!alertMsg.includes("crit") && alertSev !== "critical") return false;
    } else if (msgKey === "WARNING") {
      if (!alertMsg.includes("warn") && alertSev !== "warning") return false;
    } else if (msgKey === "NORMAL") {
      if (!alertMsg.includes("normal") && !alertMsg.includes("returned")) return false;
    }
  }

  // 5. Occurrence Counter filter
  if (filters.counter && filters.counter !== "ALL" && filters.counter.trim() !== "") {
    const c = Number(alert.occurrence_counter ?? 0);
    if (filters.counter === "Under 5" && c >= 5) return false;
    if (filters.counter === "5+" && c < 5) return false;
    if (filters.counter === "10+" && c < 10) return false;
    if (filters.counter === "15+" && c < 15) return false;
  }

  // 6. Duration / Timer filter (active_accumulated_ms in milliseconds)
  if (filters.timer && filters.timer !== "ALL" && filters.timer.trim() !== "") {
    const ms = Number(alert.active_accumulated_ms ?? 0);
    const hours = ms / (1000 * 60 * 60);
    if (filters.timer === "Under 1 Hr" && hours >= 1) return false;
    if (filters.timer === "More than 1 Hr" && hours < 1) return false;
    if (filters.timer === "More than 5 Hr" && hours < 5) return false;
    if (filters.timer === "More than 10 Hr" && hours < 10) return false;
    if (filters.timer === "More than 24 Hr" && hours < 24) return false;
  }

  // Note: Status, Resolution, and Severity filters are applied to the alert feed list,
  // NOT to the overall summary KPI counters. The KPI counters themselves count:
  // Pending Critical, Pending Warning, Total Solved, and Solved by System across the selected scope.
  return true;
}


interface AlertContextType {
  alerts: AlertItem[];
  counters: AlertCounters;
  totalAlertsCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  hasMore: boolean;
  connectionStatus: ConnectionStatus;
  connectionDetail?: string;
  searchQuery: string;
  filters: FilterState;
  activeFilterCount: number;
  latestIncomingAlert: AlertItem | null;
  fetchError: string | null;

  // Actions
  fetchAlerts: (refresh?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  acknowledgeAlert: (id: string, note?: string) => Promise<void>;
  unacknowledgeAlert: (id: string) => Promise<void>;
  acknowledgeAlertWithScope: (
    id: string,
    scope: ApplyScope,
    note?: string,
    alert?: AlertItem
  ) => Promise<any>;
  unacknowledgeAlertWithScope: (
    id: string,
    scope: ApplyScope,
    reason: string,
    alert?: AlertItem
  ) => Promise<any>;
  resolveAlertWithScope: (
    id: string,
    scope: ApplyScope,
    resolutionNote: string,
    alert?: AlertItem
  ) => Promise<any>;
  unsolveAlertWithScope: (
    id: string,
    scope: ApplyScope,
    reason: string,
    alert?: AlertItem
  ) => Promise<any>;
  setSearchQuery: (search: string) => void;
  setFilters: (updater: Partial<FilterState> | ((prev: FilterState) => FilterState)) => void;
  resetFilters: () => void;
  dismissToast: () => void;
}

const DEFAULT_COUNTERS: AlertCounters = {
  pending_critical: 0,
  pending_warning: 0,
  ack_critical: 0,
  ack_warning: 0,
  unsolved_critical: 0,
  unsolved_warning: 0,
  all_solved: 0,
  solved_by_system: 0,
  acknowledged: 0,
};

export const getTodayYmd = (): string => {
  const now = new Date();
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const nowIst = new Date(now.getTime() + IST_OFFSET_MS);
  const y = nowIst.getUTCFullYear();
  const m = String(nowIst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowIst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const DEFAULT_FILTERS: FilterState = {
  severity: "ALL",
  status: "ALL",
  resolution: "ALL",

  customStartDate: getTodayYmd(),
  customEndDate: getTodayYmd(),
  panel: "",
  tag: "",
  user: "ALL",
  counter: "ALL",
  timer: "ALL",
  messageKey: "ALL",
  pageSize: 20,
};

const AlertContext = createContext<AlertContextType | undefined>(undefined);

// Helper to calculate date range ISO strings for backend query (matches Web Dashboard)
export const getDateRangeIso = (
  customStart?: string | null,
  customEnd?: string | null
): { start?: string; end?: string } => {
  const today = getTodayYmd();
  const s = (customStart && customStart.trim()) || today;
  const e = (customEnd && customEnd.trim()) || today;

  return {
    start: parseDateInputToIso(s, false),
    end: parseDateInputToIso(e, true),
  };
};

// Single source of truth for alert date range
export const getEffectiveAlertRange = (
  filters: FilterState
): { start?: string; end?: string } => {

  return getDateRangeIso(
    filters.customStartDate,
    filters.customEndDate
  );

};
/**
 * Helper to calculate local naive ISO date strings (e.g. "2025-09-10T00:00:00.000")
 * Exactly matching Web Dashboard's DatePackage2 toLocalNaiveISO for telemetry alert-lifecycle/summary.
 */
export const getNaiveDateRangeIso = (
  customStart?: string | null,
  customEnd?: string | null
): { start: string; end: string } => {
  return {
    start: parseDateInputToNaiveIso(customStart, false),
    end: parseDateInputToNaiveIso(customEnd, true),
  };
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, accessToken, logout } = useAuth();

  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [counters, setCounters] = useState<AlertCounters>(DEFAULT_COUNTERS);
  const [totalAlertsCount, setTotalAlertsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filters, setFiltersState] = useState<FilterState>(DEFAULT_FILTERS);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionDetail, setConnectionDetail] = useState<string | undefined>(undefined);
  const [latestIncomingAlert, setLatestIncomingAlert] = useState<AlertItem | null>(null);

  const pageSize = 20;
  const isFetchingRef = useRef<boolean>(false);
  const pendingRefreshRef = useRef<boolean>(false);
  const summaryRequestIdRef = useRef<number>(0);
  const listRequestIdRef = useRef<number>(0);
  const backendCandidatePageRef = useRef<number>(1);
  const alertsRef = useRef<AlertItem[]>(alerts);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);

  // Deduplication cache for newly received real-time socket events (strictly local to this device)
  const processedAlertIdsRef = useRef<Set<string>>(new Set());

  // Keep track of current authenticated user role for real-time notification eligibility
  const rawUserRole = user?.role || (user as any)?.roleName || (user as any)?.role_name || "";
  const userRoleRef = useRef<string>(rawUserRole);
  useEffect(() => {
    const r = user?.role || (user as any)?.roleName || (user as any)?.role_name || "";
    userRoleRef.current = r;
  }, [user]);

  // Keep track of active filters & search query for real-time stream filtering
  const activeFiltersRef = useRef<FilterState>(filters);
  useEffect(() => {
    activeFiltersRef.current = filters;
  }, [filters]);

  const searchQueryRef = useRef<string>(searchQuery);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Count active non-default filters
  const todayYmd = getTodayYmd();
  const activeFilterCount =
    (filters.severity !== "ALL" ? 1 : 0) +
    (filters.status !== "ALL" ? 1 : 0) +
    (filters.resolution && filters.resolution !== "ALL" ? 1 : 0) +
    ((filters.customStartDate && filters.customStartDate !== todayYmd) || (filters.customEndDate && filters.customEndDate !== todayYmd) ? 1 : 0) +
    (filters.panel && filters.panel !== "ALL" && filters.panel.trim() !== "" ? 1 : 0) +
    (filters.tag && filters.tag !== "ALL" && filters.tag.trim() !== "" ? 1 : 0) +
    (filters.user && filters.user !== "ALL" && filters.user.trim() !== "" ? 1 : 0) +
    (filters.counter && filters.counter !== "ALL" && filters.counter.trim() !== "" ? 1 : 0) +
    (filters.timer && filters.timer !== "ALL" && filters.timer.trim() !== "" ? 1 : 0) +
    (filters.messageKey && filters.messageKey !== "ALL" && filters.messageKey.trim() !== "" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  // ---------------------------------------------------------------------------
  // User Switch / Logout Watcher: Completely wipe alerts on logout
  // ---------------------------------------------------------------------------
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = user?.id || null;

    if (!isAuthenticated || !currentUserId) {
      // WIPE EVERYTHING when logged out
      setAlerts([]);
      setCounters(DEFAULT_COUNTERS);
      setTotalAlertsCount(0);
      setFetchError(null);
      setPage(1);
      setHasMore(true);
      setFiltersState(DEFAULT_FILTERS);
      setSearchQuery("");
      setLatestIncomingAlert(null);
      processedAlertIdsRef.current.clear();
      prevUserIdRef.current = null;
      console.log("[AlertContext] Auth state cleared. Alert feed reset for new user.");
    } else if (prevUserIdRef.current && prevUserIdRef.current !== currentUserId) {
      // Different user logged in — reset feed and reload
      setAlerts([]);
      setCounters(DEFAULT_COUNTERS);
      setTotalAlertsCount(0);
      setFetchError(null);
      setPage(1);
      setFiltersState(DEFAULT_FILTERS);
      setSearchQuery("");
      processedAlertIdsRef.current.clear();
      prevUserIdRef.current = currentUserId;
      console.log("[AlertContext] User switched to:", currentUserId);
    } else {
      prevUserIdRef.current = currentUserId;
    }
  }, [isAuthenticated, user?.id]);

  // ---------------------------------------------------------------------------
  // Dedicated Date-Scoped Summary Fetch Function (Authoritative Server Totals)
  // ---------------------------------------------------------------------------
  // Exactly matching Web Dashboard AlertLogPage.jsx fetchAlertSummary & fetchLifecycleSolvedSummary
  const fetchSummary = useCallback(async () => {
    if (!isAuthenticated) return;
    const requestId = ++summaryRequestIdRef.current;

    try {
    const { start, end } = getEffectiveAlertRange(filters);
    console.log("[SUMMARY DATE RANGE]", {
  start,
  end,
  customStartDate: filters.customStartDate,
  customEndDate: filters.customEndDate,
});
   const naiveRange = getNaiveDateRangeIso(
  filters.customStartDate,
  filters.customEndDate
);
      // console.log("[WEB/MOBILE SUMMARY REQUEST]", {
      //   start,
      //   end,
      //   naiveRange,
      // });

      console.log(
  "[WEB/MOBILE SUMMARY REQUEST FULL]",
  JSON.stringify(
    {
      start,
      end,
      naiveRange,
      filters: {
        customStartDate: filters.customStartDate,
        customEndDate: filters.customEndDate,
      },
    },
    null,
    2
  )
);

      // 1. Fetch ALL alerts for selected date range
      const rawRows = await alertApi.fetchAllAlerts({
        start,
        end,
      });

      if (requestId !== summaryRequestIdRef.current) {
        return;
      }

      // 2. Decorate those alerts with lifecycle status
      const decoratedRows = await decorateAlertsWithLifecycle(rawRows);

      if (requestId !== summaryRequestIdRef.current) {
        return;
      }      // 3. Keep filteredRows only for displaying the alert list (if used)
      const filteredRows = decoratedRows.filter((alert) =>
        matchesSummaryFilters(alert, filters)
      );

      // 4. Create a separate summaryRows variable from the complete alerts array
      const summaryRows = decoratedRows;

      const isCritical = (a: AlertItem) => a.severity?.toLowerCase() === "critical";
      const isWarning = (a: AlertItem) => a.severity?.toLowerCase() === "warning";
      const isSolved = (a: AlertItem) => isAlertSolved(a);
      const isSystemSolved = (a: AlertItem) => isAlertSolvedBySystem(a);
      const isAck = (a: AlertItem) => isAlertAcknowledged(a);

      // Web Dashboard definition:
      // An alert stays in Pending (Critical / Warning) whether acknowledged or unacknowledged,
      // and is only removed from Pending once it is marked as solved.
      const pendingCritical = summaryRows.filter(
        (a) => isCritical(a) && !isSolved(a)
      ).length;

      // pendingWarning: warning && !isSolved(alert)
      const pendingWarning = summaryRows.filter(
        (a) => isWarning(a) && !isSolved(a)
      ).length;

      // totalSolved: isSolved(alert)
      const totalSolved = summaryRows.filter((a) => isSolved(a)).length;

      // solvedBySystem: isAlertSolvedBySystem(alert)
      const solvedBySystem = summaryRows.filter((a) => isSystemSolved(a)).length;

      const totalAlerts = Number(summaryRows.length);
      setTotalAlertsCount(totalAlerts);

      const ackCritical = summaryRows.filter(
        (a) => isCritical(a) && isAck(a) && !isSolved(a)
      ).length;

      const ackWarning = summaryRows.filter(
        (a) => isWarning(a) && isAck(a) && !isSolved(a)
      ).length;

      const totalAcknowledged = summaryRows.filter(
        (a) => isAck(a) && !isSolved(a)
      ).length;

      const unsolvedCritical = summaryRows.filter(
        (a) => isCritical(a) && !isSolved(a)
      ).length;

      const unsolvedWarning = summaryRows.filter(
        (a) => isWarning(a) && !isSolved(a)
      ).length;

      setCounters({
        pending_critical: pendingCritical,
        pending_warning: pendingWarning,
        ack_critical: ackCritical,
        ack_warning: ackWarning,
        all_solved: totalSolved,
        solved_by_system: solvedBySystem,
        acknowledged: totalAcknowledged,
        unsolved_critical: unsolvedCritical,
        unsolved_warning: unsolvedWarning,
      });

      console.log("SUMMARY DEBUG", {
        totalAlerts: summaryRows.length,
        pendingCritical,
        pendingWarning,
        solved: totalSolved,
      });
    } catch (err) {
      console.warn("[AlertContext] fetchSummary error:", err);
    }
  }, [isAuthenticated, filters]);

  // Refetch baseline summary on auth and when date scope changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchSummary();
    }
  }, [isAuthenticated, fetchSummary]);

  // ---------------------------------------------------------------------------
  // Core REST API Fetch Function for LIVE ALERT STREAM (Lifecycle Driven)
  // ---------------------------------------------------------------------------
  const fetchAlerts = useCallback(
    async (refresh: boolean = false) => {
      if (!isAuthenticated) return;

      // If another fetch is already running, queue refresh
      if (isFetchingRef.current) {
        if (refresh) {
          pendingRefreshRef.current = true;
          console.log(
            "[AlertContext] Refresh queued because another fetch is already running."
          );
        }
        return;
      }

      isFetchingRef.current = true;
      setFetchError(null);

      if (refresh) {
        setIsRefreshing(true);
      } else if (alerts.length === 0) {
        setIsLoading(true);
      }

      const targetPage = refresh ? 1 : page;
      const requestId = ++listRequestIdRef.current;

      if (refresh || targetPage === 1) {
        backendCandidatePageRef.current = 1;
      }

      try {
        const isSearchActive = Boolean(searchQuery && searchQuery.trim() !== "");
        const todayYmd = getTodayYmd();
        const isCustomDateExplicit = Boolean(
          (filters.customStartDate && filters.customStartDate !== todayYmd) ||
          (filters.customEndDate && filters.customEndDate !== todayYmd)
        );

        const { start, end } = getEffectiveAlertRange(filters);

        // When searching, do not restrict to today so user gets all matching alerts across history
        const queryStart = isSearchActive && !isCustomDateExplicit ? undefined : start;
        const queryEnd = isSearchActive && !isCustomDateExplicit ? undefined : end;

        const queryParams: ListAlertsQuery = {
          severity:
            filters.severity !== "ALL"
              ? filters.severity.toLowerCase()
              : undefined,

          // Status filtering is lifecycle-driven and applied on frontend
          // after lifecycle decoration. DO NOT send legacy status to backend.
          status: undefined,

          search:
            searchQuery.trim()
              ? searchQuery.trim()
              : undefined,

          // CRITICAL: DO NOT send panel name (e.g. "Flat Drip Kabra Panel") to backend panel_id!
          // MongoDB alerts store panel_id as null, and panel_name as the display name.
          // Sending panel_id causes backend to return 0 results.
          // Frontend candidate gathering handles panel, user, metrics, timer, counter, and lifecycle.
          panel_id: undefined,

          tag_name: undefined,

          start: queryStart,
          end: queryEnd,

          includeCleared: isSearchActive ? true : undefined,

          includeSummary: false,
        };

        const targetBatchSize = isSearchActive ? 50 : (filters.pageSize || pageSize); // 50 for search, 20 for standard feed
        const hasClientFilter = Boolean(
          (searchQuery && searchQuery.trim() !== "") ||
          (filters.status && filters.status !== "ALL") ||
          (filters.resolution && filters.resolution !== "ALL") ||
          (filters.panel && filters.panel !== "ALL" && filters.panel.trim() !== "") ||
          (filters.tag && filters.tag !== "ALL" && filters.tag.trim() !== "") ||
          (filters.user && filters.user !== "ALL" && filters.user.trim() !== "") ||
          (filters.counter && filters.counter !== "ALL" && filters.counter.trim() !== "") ||
          (filters.timer && filters.timer !== "ALL" && filters.timer.trim() !== "") ||
          (filters.messageKey && filters.messageKey !== "ALL" && filters.messageKey.trim() !== "")
        );

        const collectedFiltered: AlertItem[] = [];
        let backendPage = backendCandidatePageRef.current;
        let backendHasMore = true;

        const existingIds = new Set<string>(
          (refresh || targetPage === 1)
            ? []
            : alertsRef.current.map((a) => a._id || a.alert_id || (a as any)?.id)
        );

        // Fetch candidate pages sequentially until enough matching lifecycle rows are gathered
        // OR backend hasMore becomes false
        while (backendHasMore) {
          const res = await alertApi.listAlerts({
            ...queryParams,
            page: backendPage,
            pageSize: hasClientFilter ? 50 : targetBatchSize,
          });

          const rawRows: AlertItem[] = res?.rows || [];
          backendHasMore = Boolean(res?.hasMore ?? (rawRows.length === (hasClientFilter ? 50 : targetBatchSize)));
          backendPage++;

          if (rawRows.length > 0) {
            const decoratedRows = await decorateAlertsWithLifecycle(rawRows);
            const matching = decoratedRows.filter((alert) =>
              matchesActiveFilters(alert, filters, searchQuery)
            );

            for (const item of matching) {
              const id = item._id || item.alert_id || (item as any)?.id;
              if (id && !existingIds.has(id)) {
                existingIds.add(id);
                collectedFiltered.push(item);
              } else if (!id) {
                collectedFiltered.push(item);
              }
            }
          }

          // If no client filter is active, 1 candidate page satisfies 1 frontend page
          if (!hasClientFilter) {
            break;
          }

          // If client filter is active, stop once we've collected enough matching rows
          if (collectedFiltered.length >= targetBatchSize || !backendHasMore || rawRows.length === 0) {
            break;
          }

          // Safety guard: max 20 candidate pages per load batch
          if (backendPage > backendCandidatePageRef.current + 20) {
            break;
          }
        }

        // Drop response if a newer filter/refresh request was launched
        if (requestId !== listRequestIdRef.current) {
          return;
        }

        backendCandidatePageRef.current = backendPage;

        if (refresh || targetPage === 1) {
          setAlerts(collectedFiltered);
          setPage(1);
        } else {
          setAlerts((prev) => [...prev, ...collectedFiltered]);
        }

        setHasMore(backendHasMore);
        setFetchError(null);
      } catch (err: any) {
        if (requestId !== listRequestIdRef.current) {
          return;
        }
        const status = err?.response?.status;
        let userMessage: string;

        if (!err?.response) {
          if (err?.code === "ECONNABORTED") {
            userMessage = "Alert service request timed out. Please retry.";
          } else {
            userMessage = "Unable to connect to alert service. Check your connection.";
          }
        } else if (status === 401) {
          userMessage = "Session expired. Please sign in again.";
        } else if (status === 403) {
          userMessage = "Access restricted. Alert service could not resolve your company.";
        } else if (status === 404) {
          userMessage = "Alert API route not found.";
        } else {
          userMessage = `Alert service error (${status}).`;
        }

        console.log("[AlertContext] fetchAlerts error:", { status, message: userMessage });
        setFetchError(userMessage);
      } finally {
        if (requestId === listRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
        isFetchingRef.current = false;

        // If a lifecycle mutation requested a refresh while another fetch was running, execute that refresh now
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          console.log("[AlertContext] Running queued lifecycle refresh.");
          setTimeout(() => {
            fetchAlerts(true);
          }, 0);
        }
      }
    },
    [isAuthenticated, page, filters, searchQuery]
  );

  const fetchAlertsRef = useRef(fetchAlerts);
  useEffect(() => {
    fetchAlertsRef.current = fetchAlerts;
  }, [fetchAlerts]);

  const fetchSummaryRef = useRef(fetchSummary);
  useEffect(() => {
    fetchSummaryRef.current = fetchSummary;
  }, [fetchSummary]);

  // Refetch when page or filters change
  useEffect(() => {
    if (isAuthenticated) {
      fetchAlerts(page === 1);
    }
  }, [page, filters, searchQuery, isAuthenticated]);

  // Load next page
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || isRefreshing || isFetchingRef.current) return;
    setPage((prev) => prev + 1);
  }, [hasMore, isLoading, isRefreshing]);

  // Acknowledge single alert
const acknowledgeAlert = async (id: string, note?: string) => {
  if (!id) return;

  try {
    const payload: {
      action: "ack" | "unack";
      note?: string;
    } = {
      action: "ack",
    };

    if (note && note.trim()) {
      payload.note = note.trim();
    }

    console.log("[MOBILE ACK REQUEST]", {
      alertId: id,
      endpoint: `/api/v1/alerts/${id}/ack`,
      method: "PATCH",
      noteProvided: Boolean(note?.trim()),
      hasToken: Boolean(accessToken),
    });

    const res = await alertApi.acknowledgeAlert(
      id,
      payload
    );

    console.log("[MOBILE ACK RESPONSE]", {
      status: 200,
      keys:
        res && typeof res === "object"
          ? Object.keys(res)
          : [],
    });

    if (res?.data) {
      const updated = res.data;

      // IMPORTANT:
      // Do not filter after acknowledgement.
      // Acknowledged alerts are still active and should remain visible
      // until they are solved/cleared.
      setAlerts((prev) =>
        prev.map((item) => {
          const matchesId =
            String(item.alert_id || "") === String(id) ||
            String(item._id || "") === String(id);

          if (!matchesId) {
            return item;
          }

          return {
            ...item,
            ...updated,

            status: "acknowledged" as AlertStatus,
            lifecycle_acknowledged: true,
            acknowledged: true,
            bulk_ack_status: null,
          } as AlertItem;
        })
      );
    } else {
      await fetchAlerts(false);
    }

    // Preserve the real _id and alert_id separately.
    const currentObj = alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );

    const ackedItem = {
      ...(currentObj || {}),
      ...(res?.data || {}),

      _id:
        res?.data?._id ??
        currentObj?._id,

      alert_id:
        res?.data?.alert_id ??
        currentObj?.alert_id,

      status: "acknowledged",

      lifecycle_acknowledged: true,
      acknowledged: true,

      ack_user:
        res?.data?.ack_user ??
        currentObj?.ack_user,

      ack_user_id:
        res?.data?.ack_user_id ??
        currentObj?.ack_user_id,

      ack_user_name:
        res?.data?.ack_user_name ??
        currentObj?.ack_user_name,

      ack_user_email:
        res?.data?.ack_user_email ??
        currentObj?.ack_user_email,

      ack_ts:
        res?.data?.ack_ts ??
        currentObj?.ack_ts,

      ack_note:
        res?.data?.ack_note ??
        note?.trim() ??
        currentObj?.ack_note,

    } as AlertItem;


    await syncLifecycleAck(
      ackedItem,
      "ack",
      {
        note: note?.trim(),
      }
    ).catch(() => {});


    await ensureAlertLifecycle(
      ackedItem
    ).catch(() => {});


    await fetchSummary();

  } catch (err: any) {

    console.log("[MOBILE ACK ERROR]", {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
      url: err?.config?.url,
      method: err?.config?.method,
    });

    throw err;
  }
};
  // Unacknowledge single alert
 const unacknowledgeAlert = async (id: string) => {
  if (!id) return;

  try {
    console.log("[MOBILE UNACK REQUEST]", {
      alertId: id,
      endpoint: `/api/v1/alerts/${id}/ack`,
      method: "PATCH",
    });

    const res = await alertApi.unacknowledgeAlert(id);

    if (res?.data) {
      const updated = res.data;

      setAlerts((prev) =>
        prev.map((item) => {
          const matchesId =
            String(item.alert_id || "") === String(id) ||
            String(item._id || "") === String(id);

          if (!matchesId) {
            return item;
          }

          return {
            ...item,
            ...updated,

            status: "open" as AlertStatus,
            lifecycle_acknowledged: false,
            acknowledged: false,
            bulk_ack_status: null,

            ack_user: undefined,
            ack_user_id: undefined,
            ack_user_name: undefined,
            ack_user_email: undefined,
            ack_ts: undefined,
            ack_note: undefined,
          } as AlertItem;
        })
      );

    } else {
      await fetchAlerts(false);
    }


    const currentObj = alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );


    const unackedItem = {
      ...(currentObj || {}),
      ...(res?.data || {}),

      _id:
        res?.data?._id ??
        currentObj?._id,

      alert_id:
        res?.data?.alert_id ??
        currentObj?.alert_id,

      status: "open",

      lifecycle_acknowledged: false,
      acknowledged: false,

      ack_user: undefined,
      ack_user_id: undefined,
      ack_user_name: undefined,
      ack_user_email: undefined,
      ack_ts: undefined,
      ack_note: undefined,

    } as AlertItem;


    await syncLifecycleAck(
      unackedItem,
      "unack"
    ).catch(() => {});


    await ensureAlertLifecycle(
      unackedItem
    ).catch(() => {});


    await fetchSummary();

  } catch (err: any) {

    console.log("[MOBILE UNACK ERROR]", {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });

    throw err;
  }
};

  // Acknowledge with scope: "this" | "today" | "week" | "all_prev"
 const acknowledgeAlertWithScope = async (
  id: string,
  scope: ApplyScope,
  note?: string,
  alertObj?: AlertItem
) => {
  if (!id) return;

  const targetAlert =
    alertObj ||
    alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );

  if (!targetAlert) {
    throw new Error(
      "Unable to locate selected alert for lifecycle acknowledge action."
    );
  }

  const result = await applyLifecycleAction(
    targetAlert,
    "ack",
    scope,
    note || ""
  );

  setPage(1);
  await fetchAlerts(true);
  await fetchSummary();

  return result;
};

  // Unacknowledge with scope: "this" | "today" | "week" | "all_prev"
const unacknowledgeAlertWithScope = async (
  id: string,
  scope: ApplyScope,
  reason: string,
  alertObj?: AlertItem
) => {
  if (!id) return;

  const targetAlert =
    alertObj ||
    alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );

  if (!targetAlert) {
    throw new Error(
      "Unable to locate selected alert for lifecycle unacknowledge action."
    );
  }

  const result = await applyLifecycleAction(
    targetAlert,
    "unack",
    scope,
    reason || ""
  );

  setPage(1);
  await fetchAlerts(true);
  await fetchSummary();

  return result;
};
// Resolve with scope: "this" | "today" | "week" | "all_prev"
const resolveAlertWithScope = async (
  id: string,
  scope: ApplyScope,
  resolutionNote: string,
  alertObj?: AlertItem
) => {
  if (!id) return;

  // IMPORTANT:
  // Lifecycle operations may use alert_id while the Alerts API may use _id.
  // Check BOTH IDs independently instead of using (_id || alert_id).
  const targetAlert =
    alertObj ||
    alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );

  if (!targetAlert) {
    throw new Error(
      "Unable to locate selected alert for lifecycle solve action."
    );
  }

  // Always use the lifecycle API for:
  // This Alert / Today / Last 1 Week / All Previous.
  // Do NOT fall back to the legacy clearAlert API.
  const result = await applyLifecycleAction(
    targetAlert,
    "solve",
    scope,
    resolutionNote
  );

  // Restart list from page 1 after lifecycle mutation.
  setPage(1);

  // fetchAlerts() already decorates the returned rows
  // using lifecycle state.
  await fetchAlerts(true);

  // Refresh dashboard counters.
  await fetchSummary();

  return result;
};


// Reopen / Mark as Unsolved with scope:
// "this" | "today" | "week" | "all_prev"
const unsolveAlertWithScope = async (
  id: string,
  scope: ApplyScope,
  reason: string,
  alertObj?: AlertItem
) => {
  if (!id) return;

  // IMPORTANT:
  // Lifecycle operations may use alert_id while the Alerts API may use _id.
  // Check BOTH IDs independently instead of using (_id || alert_id).
  const targetAlert =
    alertObj ||
    alerts.find(
      (a) =>
        String(a.alert_id || "") === String(id) ||
        String(a._id || "") === String(id)
    );

  if (!targetAlert) {
    throw new Error(
      "Unable to locate selected alert for lifecycle unsolve action."
    );
  }

  // Always use lifecycle action for all scopes.
  // Do NOT fall back to legacy action: "unclear".
  const result = await applyLifecycleAction(
    targetAlert,
    "unsolve",
    scope,
    reason
  );

  // Restart list from page 1 after lifecycle mutation.
  setPage(1);

  // Reload and lifecycle-decorate the Dashboard rows.
  await fetchAlerts(true);

  // Refresh dashboard counters.
  await fetchSummary();

  return result;
};
  // ---------------------------------------------------------------------------
  // Real-Time Socket.IO Streaming Integration
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      // Clear per-device deduplication cache on logout so a newly logged-in user on this phone receives alerts
      processedAlertIdsRef.current.clear();
      return;
    }

    // Ensure socket is actively connected with CURRENT user's accessToken
    socketService.connect(accessToken).catch((e) =>
      console.warn("[AlertContext] Socket connect:", e?.message)
    );

    const unsubStatus = socketService.onStatusChange((status, detail) => {
      setConnectionStatus(status);
      setConnectionDetail(detail);
      if (status === "unauthorized") {
        console.warn("[AlertContext] Socket unauthorized (expired token) → auto logout");
        logout();
      }
    });

    // Handle genuinely NEW realtime alert from live stream
    const unsubAlertNew = socketService.onAlertNew(async (newAlert: AlertItem) => {
      if (!isAuthenticated || !accessToken) {
        return;
      }

      // Preferred unique alert ID order: 1. alert._id -> 2. alert.alert_id -> 3. alert.id
      const primaryAlertId = newAlert._id || newAlert.alert_id || (newAlert as any)?.id;
      const stableAlertId = primaryAlertId ? String(primaryAlertId).trim() : "";
      // Dedup key: uses unique alert ID, or composite key (DID + timestamp + metric + severity). NEVER DID alone.
      const dedupKey = getAlertDeduplicationKey(newAlert);
      const severity = normalizeSeverity(newAlert.severity as string);

      // Stage 1: Log Socket event arrival BEFORE any notification filtering or deduplication
      console.log("[PowerIQ Socket Alert Received]", {
        alertId: stableAlertId || dedupKey || "unknown",
        dedupKey: dedupKey || "unkeyed",
        severity,
        panel: newAlert.panel_name || "unknown",
        metric: newAlert.tag_name || (newAlert as any)?.tag || (newAlert as any)?.metric || (newAlert as any)?.parameter || "unknown",
      });

      // Deduplicate strictly using unique alert ID or composite key (NEVER DID alone)
      // If dedupKey is empty (no unique ID and insufficient metadata), do not suppress
      const isAlreadyHandled =
        (dedupKey && (processedAlertIdsRef.current.has(dedupKey) || isAlertProcessed(dedupKey))) ||
        (stableAlertId && isAlertProcessed(stableAlertId));

      if (isAlreadyHandled) {
        console.log("[AlertContext] Duplicate socket alert ignored on this device:", dedupKey || stableAlertId);
        return;
      }

      if (dedupKey) {
        processedAlertIdsRef.current.add(dedupKey);
        markAlertProcessed(dedupKey);
        if (stableAlertId) markAlertProcessed(stableAlertId);
        if (processedAlertIdsRef.current.size > 200) {
          const first = processedAlertIdsRef.current.values().next().value;
          if (first) processedAlertIdsRef.current.delete(first);
        }
      } else if (stableAlertId) {
        markAlertProcessed(stableAlertId);
      }

      // Canonical role filtering: admin, super admin, production, maintenance, engineer, and owner are eligible
      const currentRole = userRoleRef.current;
      const isEligible = isNotificationEligibleRole(currentRole);
      const isOwner = isOwnerRole(currentRole);

      logPowerIQRoleDebug(user?.name, currentRole);

      if (isEligible) {
        // If owner, check if owner notifications are enabled in settings
        if (isOwner) {
          const ownerEnabled = await getOwnerNotificationsEnabled();
          if (!ownerEnabled) {
            console.log("[AlertContext] Realtime alert received for Owner — notifications disabled in settings.");
            setLatestIncomingAlert(newAlert);
            return;
          }
        }

        // Stage 2: Role Eligible
        console.log("[PowerIQ Role Eligible]", {
          userRole: currentRole,
          canonicalRole: normalizeRole(currentRole),
          eligible: true,
          isOwner,
        });

        // Stage 3: System Notification Scheduling
        try {
          await notifyForRealtimeAlert(newAlert, currentRole);
        } catch (error: any) {
          console.warn("[AlertContext] Local notification failed:", error?.message);
        }

        // Stage 4 & 5: Sound Playback (Harsh siren ONLY for MD alerts when not owner; gentle chime for everything else)
        const severitySoundEnabled = await getSeveritySoundPreference(severity);
        const isMd = isMdAlert(newAlert);

        if (isMd && !isOwner) {
          console.log("[PowerIQ MD Siren Sound Starting]", { alertId: stableAlertId || dedupKey });
        } else if (severity === "critical" && !isOwner) {
          console.log("[PowerIQ Critical Chime Sound Starting]", { alertId: stableAlertId || dedupKey });
        }

        if (severitySoundEnabled || isOwner || isMd) {
          await soundService.playSoundForNotification(severity, "socket", isOwner, newAlert, currentRole);
          if (isMd && !isOwner) {
            console.log("[PowerIQ MD Siren Sound Started]", { alertId: stableAlertId || dedupKey });
          } else if (severity === "critical" && !isOwner) {
            console.log("[PowerIQ Critical Chime Sound Started]", { alertId: stableAlertId || dedupKey });
          }
        } else {
          console.log("[PowerIQ Sound Skipped by User Preference]", {
            severity,
            alertId: stableAlertId || dedupKey,
          });
        }

        // Show in-app banner toast
        setLatestIncomingAlert(newAlert);
      } else {
        console.log(
          `[AlertContext] Realtime alert ${stableAlertId || dedupKey} received for role "${currentRole}" — notification skipped.`
        );
      }

      // Single source of truth: refresh feed and summary via lifecycle decoration pipeline
      // without manually mutating counters or inserting undecorated items
      await fetchAlertsRef.current(true);
      await fetchSummaryRef.current();
    });

    // Handle alert update / ack broadcast as a refresh signal
    const unsubAlertUpdated = socketService.onAlertUpdated(async () => {
      try {
        await fetchAlertsRef.current(true);
        await fetchSummaryRef.current();
      } catch (err) {
        console.warn("[AlertContext] socket onAlertUpdated refresh error:", err);
      }
    });

    // Handle native push notifications (when app is in foreground/background)
    const unsubPush = setupPushNotificationListeners(
      async (pushAlert) => {
        setLatestIncomingAlert(pushAlert);
        await fetchAlertsRef.current(true);
        await fetchSummaryRef.current();
      }
    );

    return () => {
      unsubStatus();
      unsubAlertNew();
      unsubAlertUpdated();
      unsubPush();
    };
  }, [isAuthenticated, accessToken]);

  const dismissToast = () => setLatestIncomingAlert(null);

  const setFilters = (
    updater: Partial<FilterState> | ((prev: FilterState) => FilterState)
  ) => {
    setFiltersState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      return next;
    });
    setPage(1);
  };

  const resetFilters = () => {
    setFiltersState(DEFAULT_FILTERS);
    setSearchQuery("");
    setPage(1);
  };

  return (
    <AlertContext.Provider
      value={{
        alerts,
        counters,
        totalAlertsCount,
        isLoading,
        isRefreshing,
        hasMore,
        connectionStatus,
        connectionDetail,
        searchQuery,
        filters,
        activeFilterCount,
        latestIncomingAlert,
        fetchError,
        fetchAlerts: async () => {
          await Promise.all([fetchAlerts(true), fetchSummary()]);
        },
        loadMore,
        acknowledgeAlert,
        unacknowledgeAlert,
        acknowledgeAlertWithScope,
        unacknowledgeAlertWithScope,
        resolveAlertWithScope,
        unsolveAlertWithScope,
        setSearchQuery: (q) => {
          setSearchQuery(q);
          setPage(1);
        },
        setFilters,
        resetFilters,
        dismissToast,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
};

export const useAlerts = (): AlertContextType => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useAlerts must be used within an AlertProvider");
  return context;
};
