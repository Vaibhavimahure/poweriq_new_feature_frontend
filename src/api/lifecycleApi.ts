

import axios, { AxiosInstance } from "axios";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";
import { AlertItem, AlertStatus, ApplyScope, isAlertAcknowledged, isAlertSolved } from "../types/alert";
import { alertApi } from "./alertApi";

export const DEPLOYED_TELEMETRY_BASE_URL = "https://dev.esm.co.in/api/telemetry";

export const TELEMETRY_BASE_URL =
  process.env.EXPO_PUBLIC_TELEMETRY_API_BASE_URL?.trim() || DEPLOYED_TELEMETRY_BASE_URL;

export type WebLifecycleScope = "this_alert" | "today" | "one_week" | "all_previous";
export type LifecycleAction = "ack" | "unack" | "solve" | "unsolve" | "ack_solve";

export interface LifecycleActionPreviewResult {
  action: LifecycleAction;
  scope: WebLifecycleScope;
  matching_alerts: number;
  eligible_alerts: number;
  panel_name?: string;
  device_id?: string;
  tag_name?: string;
  metric_key?: string;
  severity?: string;
  blocked_unacknowledged?: number;
  affected_incidents?: number;
  previous_resolution_note?: string | null;
  previous_resolution_method?: string | null;
  previous_resolution_by?: string | null;
  previous_resolution_at?: string | null;
}

export interface LifecycleActionResult {
  updated_incidents: number;
  acknowledged_incidents?: number;
  solved_incidents?: number;
  selected_state?: any;
  failures?: any[];
}

export const telemetryClient: AxiosInstance = axios.create({
  baseURL: TELEMETRY_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

telemetryClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore storage read error
    }
    return config;
  },
  (err) => Promise.reject(err)
);

/**
 * Resolves lifecycle alert ID in the exact priority order of the working web dashboard:
 * alert.alert_id -> alert._id
 */
export function getLifecycleAlertId(alert: any): string {
  const lifecycleAlertId = String(
    alert?.alert_id ||
    alert?._id ||
    alert?.id ||
    ""
  ).trim();

  if (__DEV__) {
    console.log("[Lifecycle Alert ID]", {
      alert_id: alert?.alert_id,
      _id: alert?._id,
      lifecycleAlertId,
    });
  }

  return lifecycleAlertId;
}

export function toWebLifecycleScope(scope: ApplyScope): WebLifecycleScope {
  switch (scope) {
    case "this":
      return "this_alert";
    case "today":
      return "today";
    case "week":
      return "one_week";
    case "all_prev":
      return "all_previous";
    default:
      return "this_alert";
  }
}

/**
 * Builds lifecycle alert payload matching web's lifecycleAlertPayload
 */
export function buildLifecycleAlertPayload(alert: AlertItem, isBulk: boolean = false) {
  const acknowledged = isAlertAcknowledged(alert);
  const solved = isAlertSolved(alert);
  const status = solved ? "cleared" : acknowledged ? "acknowledged" : "open";
  const id = getLifecycleAlertId(alert);

  return {
    alert_id: id,
    company_id: alert.company_id || (alert as any)?.companyId || undefined,
    device_id: alert.device_id || (alert as any)?.did || (alert as any)?.DID || undefined,
    panel_name: alert.panel_name || undefined,
    tag_name: alert.tag_name || undefined,
    metric_key: alert.metric_key || undefined,
    severity: alert.severity || (alert as any)?.current_severity || undefined,
    alert_value: alert.alert_value,
    unit: alert.unit || undefined,
    message: isBulk ? undefined : (alert.message || undefined),
    ts: alert.ts || alert.createdAt || (alert as any)?.created_at || undefined,
    acknowledged,
    status,
    solved,
    is_cleared: solved,
    ack_user: acknowledged ? (alert.ack_user || (alert as any)?.ack_user_name || undefined) : undefined,
    ack_user_id: acknowledged ? (alert.ack_user_id || undefined) : undefined,
    ack_user_name: acknowledged ? ((alert as any)?.ack_user_name || alert.ack_user || undefined) : undefined,
    ack_user_email: acknowledged ? ((alert as any)?.ack_user_email || undefined) : undefined,
    ack_ts: acknowledged ? (alert.ack_ts || (alert as any)?.bulk_ts || undefined) : undefined,
    ack_note: acknowledged ? (alert.ack_note || undefined) : undefined,
    solved_user: solved ? (alert.clear_user || (alert as any)?.solved_user || undefined) : undefined,
    solved_ts: solved ? (alert.solved_ts || alert.clear_ts || (alert as any)?.solved_ts || undefined) : undefined,
    solve_reason: solved ? (alert.clear_note || (alert as any)?.solve_reason || undefined) : undefined,
    alert_service_updated_at: alert.updatedAt || (alert as any)?.updated_at || undefined,
    backfill_acknowledgement: acknowledged ? true : undefined,
  };
}

export async function ensureAlertLifecycle(alert: AlertItem): Promise<any> {
  const id = getLifecycleAlertId(alert);
  if (!id) return null;
  try {
    const payload = buildLifecycleAlertPayload(alert);
    const res = await telemetryClient.post(
      `/api/v1/alert-lifecycle/${id}/ensure`,
      payload
    );
    return res.data?.data || null;
  } catch (err: any) {
    console.warn("[LifecycleApi] ensureAlertLifecycle warning:", err?.message);
    return null;
  }
}

export async function ensureAlertLifecycleBulk(alerts: AlertItem[]): Promise<any> {
  const payloadRows = (Array.isArray(alerts) ? alerts : [])
    .filter((alert) => String(alert?.alert_id || alert?._id || "").trim())
    .map((alert) => buildLifecycleAlertPayload(alert, true));

  if (!payloadRows.length) return null;

  const chunks: any[][] = [];
  for (let i = 0; i < payloadRows.length; i += 50) {
    chunks.push(payloadRows.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      await telemetryClient.post("/api/v1/alert-lifecycle/bulk-ensure", { alerts: chunk });
    } catch (err: any) {
      console.warn("[LifecycleApi] bulk-ensure warning:", err?.message);
    }
  }
}

export async function syncLifecycleAck(
  alert: AlertItem,
  action: "ack" | "unack",
  options?: { note?: string }
): Promise<any> {
  const id = getLifecycleAlertId(alert);
  if (!id) return null;

  try {
    const res = await telemetryClient.patch(`/api/v1/alert-lifecycle/${id}/ack`, {
      action,
      company_id: alert.company_id || (alert as any)?.companyId || undefined,
      device_id: alert.device_id || (alert as any)?.did || (alert as any)?.DID || undefined,
      tag_name: alert.tag_name || undefined,
      severity: alert.severity || undefined,
      note: options?.note || undefined,
    });
    return res.data?.data || null;
  } catch (err: any) {
    console.warn("[LifecycleApi] syncLifecycleAck warning:", err?.message);
    return null;
  }
}

export async function fetchLifecycleSummary(params: { start?: string; end?: string }): Promise<{
  unsolved_critical: number;
  unsolved_warning: number;
  total_critical?: number;
  total_warning?: number;
  pending_critical?: number;
  pending_warning?: number;
  solved_critical?: number;
  solved_warning?: number;
  total_solved?: number;
  solved_by_system?: number;
}> {
  try {
    const res = await telemetryClient.get("/api/v1/alert-lifecycle/summary", { params });
    const summary = res.data?.summary || res.data?.data?.summary || {};
    return {
      unsolved_critical: Number(summary.unsolved_critical || 0),
      unsolved_warning: Number(summary.unsolved_warning || 0),
      total_critical: Number(summary.total_critical || 0),
      total_warning: Number(summary.total_warning || 0),
      pending_critical: Number(summary.pending_critical || 0),
      pending_warning: Number(summary.pending_warning || 0),
      solved_critical: Number(summary.solved_critical || 0),
      solved_warning: Number(summary.solved_warning || 0),
      total_solved: Number(summary.total_solved || 0),
      solved_by_system: Number(summary.solved_by_system || 0),
    };
  } catch (err: any) {
    console.warn("[LifecycleApi] fetchLifecycleSummary warning:", err?.message || err);
    return {
      unsolved_critical: 0,
      unsolved_warning: 0,
      total_solved: 0,
      solved_by_system: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Lifecycle Decoration & State Hydration (Mirrors Web alertApi.js)
// ---------------------------------------------------------------------------

function preservedSourceField(row: any, field: string, fallback: any) {
  return Object.prototype.hasOwnProperty.call(row || {}, field) ? row[field] : fallback;
}

export function normalizeAlert(row: any): AlertItem {
  if (!row) return row;
  const alert_id = getLifecycleAlertId(row);
  return {
    ...row,
    alert_id,
    alert_service_status: preservedSourceField(row, "alert_service_status", row.status),
    alert_service_ack_user: preservedSourceField(row, "alert_service_ack_user", row.ack_user),
    alert_service_ack_user_id: preservedSourceField(row, "alert_service_ack_user_id", row.ack_user_id),
    alert_service_ack_user_name: preservedSourceField(row, "alert_service_ack_user_name", row.ack_user_name),
    alert_service_ack_user_email: preservedSourceField(row, "alert_service_ack_user_email", row.ack_user_email),
    alert_service_ack_ts: preservedSourceField(row, "alert_service_ack_ts", row.ack_ts || row.bulk_ts),
    alert_service_ack_note: preservedSourceField(row, "alert_service_ack_note", row.ack_note),
    alert_service_updated_at: preservedSourceField(row, "alert_service_updated_at", row.updatedAt || row.updated_at),
  };
}

export function alertServiceAckSnapshot(alert: any = {}) {
  const status = String(
    preservedSourceField(alert, "alert_service_status", alert?.status) || ""
  )
    .trim()
    .toLowerCase();

  const bulkStatus = String(
    preservedSourceField(alert, "bulk_ack_status", alert?.bulk_ack_status) || ""
  )
    .trim()
    .toLowerCase();

  const acknowledged = status === "acknowledged" || bulkStatus === "acknowledged";

  return {
    acknowledged,
    status: acknowledged ? "acknowledged" : "open",
    ack_user: preservedSourceField(alert, "alert_service_ack_user", alert?.ack_user),
    ack_user_id: preservedSourceField(alert, "alert_service_ack_user_id", alert?.ack_user_id),
    ack_user_name: preservedSourceField(alert, "alert_service_ack_user_name", alert?.ack_user_name),
    ack_user_email: preservedSourceField(alert, "alert_service_ack_user_email", alert?.ack_user_email),
    ack_ts: preservedSourceField(alert, "alert_service_ack_ts", alert?.ack_ts || alert?.bulk_ts),
    ack_note: preservedSourceField(alert, "alert_service_ack_note", alert?.ack_note),
    updated_at: preservedSourceField(alert, "alert_service_updated_at", alert?.updatedAt || alert?.updated_at),
  };
}

export async function fetchLifecycleStatesMap(alertIds: string[]): Promise<Record<string, any>> {
  const ids = [...new Set(alertIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return {};

  const chunks: string[][] = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await telemetryClient.get("/api/v1/alert-lifecycle/states", {
          params: { alert_ids: chunk.join(",") },
        });
        return res.data?.states || res.data?.data?.states || {};
      } catch (err: any) {
        console.warn("[LifecycleApi] fetchLifecycleStatesMap warning:", err?.message || err);
        return {};
      }
    })
  );

  return Object.assign({}, ...results);
}

export async function decorateAlertsWithLifecycle(rows: AlertItem[] = []): Promise<AlertItem[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const normalized = rows.map(normalizeAlert);
  const alertIds = normalized.map((r) => getLifecycleAlertId(r)).filter(Boolean);
  let lifecycleMap = await fetchLifecycleStatesMap(alertIds);

  // Repair split-brain where Alerts service has an acknowledgement but Telemetry missed it.
  // The Telemetry backend performs timestamp-aware reconciliation, so an older stale Alerts
  // acknowledgement cannot overwrite a newer lifecycle unacknowledgement.
  const repairCandidates = normalized.filter((row) => {
    const id = getLifecycleAlertId(row);
    const lifecycle = lifecycleMap[id];
    return Boolean(lifecycle) && alertServiceAckSnapshot(row).acknowledged && !lifecycle.acknowledged;
  });

  if (repairCandidates.length) {
    try {
      await ensureAlertLifecycleBulk(repairCandidates);
      const repairedMap = await fetchLifecycleStatesMap(
        repairCandidates.map((row) => getLifecycleAlertId(row))
      );
      lifecycleMap = { ...lifecycleMap, ...repairedMap };
    } catch (error: any) {
      console.warn(
        "[LifecycleApi] Alert lifecycle acknowledgement reconciliation failed.",
        error?.message || error
      );
    }
  }

  return normalized.map((row) => {
    const id = getLifecycleAlertId(row);
    const lifecycle = lifecycleMap[id];
    if (!lifecycle) return row;

    const lifecycleAcknowledged = Boolean(lifecycle.acknowledged);
    const sourceAck = alertServiceAckSnapshot(row);

    return {
      ...row,
      // Lifecycle is the display source of truth. Keep acknowledgement state
      // atomic: when lifecycle says "not acknowledged", do not leak a stale
      // Alerts-service actor/timestamp into the Acknowledged By column.
      status: (lifecycleAcknowledged ? "acknowledged" : "open") as AlertStatus,
      lifecycle_acknowledged: lifecycleAcknowledged,
      acknowledged: lifecycleAcknowledged,
      bulk_ack_status: lifecycleAcknowledged ? (row.bulk_ack_status || "acknowledged") : null,
      ack_user: lifecycleAcknowledged
        ? lifecycle.ack_user || sourceAck.ack_user || null
        : null,
      ack_user_id: lifecycleAcknowledged
        ? lifecycle.ack_user_id || sourceAck.ack_user_id || null
        : null,
      ack_user_name: lifecycleAcknowledged
        ? lifecycle.ack_user_name || sourceAck.ack_user_name || sourceAck.ack_user || null
        : null,
      ack_user_email: lifecycleAcknowledged
        ? lifecycle.ack_user_email || sourceAck.ack_user_email || null
        : null,
      ack_ts: lifecycleAcknowledged
        ? lifecycle.ack_ts || sourceAck.ack_ts || null
        : null,
      ack_note: lifecycleAcknowledged
        ? lifecycle.ack_note || sourceAck.ack_note || null
        : null,
      solved: Boolean(lifecycle.solved),
      is_cleared: Boolean(lifecycle.solved),
      solved_user: lifecycle.solved_user || lifecycle.solvedUser || null,
      solved_user_id: lifecycle.solved_user_id || lifecycle.solvedUserId || null,
      solved_user_name: lifecycle.solved_user_name || lifecycle.solvedUserName || null,
      solved_user_email: lifecycle.solved_user_email || lifecycle.solvedUserEmail || null,
      solved_ts:
        lifecycle.solved_ts ||
        lifecycle.solved_at ||
        lifecycle.solvedTs ||
        row.clear_ts ||
        row.solved_ts ||
        null,
      clear_ts:
        lifecycle.solved_ts ||
        lifecycle.solved_at ||
        lifecycle.solvedTs ||
        row.clear_ts ||
        row.solved_ts ||
        null,
      solved_by: lifecycle.solved_by || lifecycle.solvedBy || null,
      solve_reason: lifecycle.solve_reason || lifecycle.solveReason || null,
      resolution_method: lifecycle.resolution_method || null,
      incident_key: lifecycle.incident_key || null,
      metric_key: lifecycle.metric_key || row.metric_key || null,
      current_severity: lifecycle.current_severity || row.severity,
      alert_value: lifecycle.alert_value ?? row.alert_value,
      unit: lifecycle.unit || row.unit,
      panel_name: lifecycle.panel_name || row.panel_name,
    };
  });
}

// ---------------------------------------------------------------------------
// Scope Hydration (Mirrors Web alertApi.js hydrateLifecycleScope)
// ---------------------------------------------------------------------------

const SCOPE_HYDRATION_CACHE_MS = 15000;
const scopeHydrationCache = new Map<string, { ts: number; promise: Promise<any> }>();

function alertTimestampMs(alert: any): number {
  const raw = alert?.ts || alert?.createdAt || alert?.created_at;
  const ms = new Date(raw || "").getTime();
  return Number.isFinite(ms) ? ms : Date.now();
}

function localDayStartMs(epochMs: number, offsetMinutes: number = 330): number {
  // IST (+05:30) offset = 330 minutes
  const offsetMs = Number(offsetMinutes || 0) * 60 * 1000;
  const shifted = new Date(epochMs + offsetMs);
  return (
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      0,
      0,
      0,
      0
    ) - offsetMs
  );
}

function localDayEndMs(epochMs: number, offsetMinutes: number = 330): number {
  // IST (+05:30) offset = 330 minutes
  const offsetMs = Number(offsetMinutes || 0) * 60 * 1000;
  const shifted = new Date(epochMs + offsetMs);
  return (
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
      23,
      59,
      59,
      999
    ) - offsetMs
  );
}

function sameScopedAlertFamily(selectedAlert: AlertItem, candidateAlert: AlertItem): boolean {
  const selectedDevice = String(
    selectedAlert?.device_id || (selectedAlert as any)?.did || (selectedAlert as any)?.DID || ""
  ).trim();
  const candidateDevice = String(
    candidateAlert?.device_id || (candidateAlert as any)?.did || (candidateAlert as any)?.DID || ""
  ).trim();

  if (selectedDevice && candidateDevice && selectedDevice !== candidateDevice) {
    return false;
  }

  const selectedPanel = String(selectedAlert?.panel_name || "").trim().toLowerCase();
  const candidatePanel = String(candidateAlert?.panel_name || "").trim().toLowerCase();

  if (!selectedDevice && selectedPanel && candidatePanel && selectedPanel !== candidatePanel) {
    return false;
  }

  const selectedSeverity = String(
    selectedAlert?.severity || (selectedAlert as any)?.current_severity || ""
  ).trim().toLowerCase();
  const candidateSeverity = String(
    candidateAlert?.severity || (candidateAlert as any)?.current_severity || ""
  ).trim().toLowerCase();

  if (selectedSeverity && candidateSeverity && selectedSeverity !== candidateSeverity) {
    return false;
  }

  const selectedMetricKey = String(selectedAlert?.metric_key || "").trim().toLowerCase();
  const candidateMetricKey = String(candidateAlert?.metric_key || "").trim().toLowerCase();

  if (selectedMetricKey && candidateMetricKey) {
    return selectedMetricKey === candidateMetricKey;
  }

  const selectedTag = String(selectedAlert?.tag_name || "").trim().toLowerCase();
  const candidateTag = String(candidateAlert?.tag_name || "").trim().toLowerCase();

  if (selectedTag && candidateTag) {
    return selectedTag === candidateTag;
  }

  return true;
}

function buildLifecycleScopeAlertParams(alert: AlertItem, scope: WebLifecycleScope) {
  const anchorMs = alertTimestampMs(alert);
  if (scope === "this_alert" || !Number.isFinite(anchorMs)) {
    return null;
  }

  let start: string | undefined;
  let end = new Date(anchorMs).toISOString();

  if (scope === "today") {
    start = new Date(localDayStartMs(anchorMs)).toISOString();
    end = new Date(localDayEndMs(anchorMs)).toISOString();
  } else if (scope === "one_week") {
    start = new Date(anchorMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const deviceId = String(
    alert?.device_id || (alert as any)?.did || (alert as any)?.DID || ""
  ).trim();
  const severity = String(
    alert?.severity || (alert as any)?.current_severity || ""
  ).trim();

  return {
    start,
    end,
    device_id: deviceId || undefined,
    severity: severity || undefined,
    pageSize: 50,
  };
}

export async function hydrateLifecycleScope(alert: AlertItem, scope: WebLifecycleScope): Promise<void> {
  if (!alert || typeof alert !== "object") return;
  const alertId = getLifecycleAlertId(alert);
  if (!alertId) return;

  // Always guarantee that the selected alert exists and is synchronized in lifecycle first
  const ensureResult = await ensureAlertLifecycle(alert);
  console.log("[Lifecycle Hydration Done]", { lifecycleAlertId: alertId, scope, ensureResult });

  if (scope === "this_alert") {
    return;
  }

  const cacheKey = `${alertId}:${scope}`;
  const cached = scopeHydrationCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < SCOPE_HYDRATION_CACHE_MS) {
    await cached.promise;
    return;
  }

  const promise = (async () => {
    const params = buildLifecycleScopeAlertParams(alert, scope);
    if (!params) return;

    const pageSize = 50;
    const firstResponse = await alertApi.listAlerts({
      ...params,
      page: 1,
      pageSize,
    } as any).catch(() => null);

    const firstRows: AlertItem[] = Array.isArray(firstResponse?.rows) ? firstResponse.rows : [];
    const hydrateRows = async (rows: AlertItem[]) => {
      const matchingRows = rows.filter((r) => sameScopedAlertFamily(alert, r));
      if (matchingRows.length > 0) {
        await ensureAlertLifecycleBulk(matchingRows);
      }
    };

    await hydrateRows(firstRows);

    const total = Number(firstResponse?.total);
    const totalPages = Number.isFinite(total) ? Math.ceil(total / pageSize) : 1;

    // Fetch up to 3 additional pages if totalPages > 1
    const maxPagesToFetch = Math.min(totalPages, 4);
    for (let page = 2; page <= maxPagesToFetch; page++) {
      const nextResponse = await alertApi.listAlerts({
        ...params,
        page,
        pageSize,
      } as any).catch(() => null);
      if (nextResponse?.rows && Array.isArray(nextResponse.rows)) {
        await hydrateRows(nextResponse.rows);
      }
    }
  })();

  scopeHydrationCache.set(cacheKey, {
    ts: Date.now(),
    promise,
  });

  try {
    await promise;
  } catch (error) {
    scopeHydrationCache.delete(cacheKey);
    console.warn("[LifecycleApi] hydrateLifecycleScope warning:", error);
  }
}

/**
 * Preview action impact (matching & eligible alert count)
 */
export async function previewLifecycleAction(
  alert: AlertItem,
  action: LifecycleAction,
  scope: ApplyScope
): Promise<LifecycleActionPreviewResult> {
  const lifecycleAlertId = getLifecycleAlertId(alert);

  if (!lifecycleAlertId) {
    throw new Error("Missing alert ID for preview");
  }

  const webScope = toWebLifecycleScope(scope);

  console.log("[Lifecycle Preview Debug]", {
    mongoId: alert?._id,
    alertId: alert?.alert_id,
    lifecycleAlertId,
    action,
    scope: webScope,
    mobileAcknowledged: isAlertAcknowledged(alert),
    mobileSolved: isAlertSolved(alert),
    status: alert?.status,
    bulkAckStatus: alert?.bulk_ack_status,
    ackUser: alert?.ack_user,
    ackTs: alert?.ack_ts,
  });

  // Make sure lifecycle records for the selected scope exist
  // before asking the backend for matching / eligible counts.
  await hydrateLifecycleScope(alert, webScope);

  const payload = {
    ...buildLifecycleAlertPayload(alert),
    action,
    scope: webScope,
  };

  const res =
    await telemetryClient.post<{ data: LifecycleActionPreviewResult }>(
      `/api/v1/alert-lifecycle/${lifecycleAlertId}/action-preview`,
      payload
    );

  const result = res.data?.data;

  if (!result) {
    throw new Error("Invalid preview response");
  }

  // IMPORTANT:
  // Backend preview is the source of truth.
  // Never manually change matching_alerts or eligible_alerts here.
  console.log("[Lifecycle Preview Result]", {
    alert_id: lifecycleAlertId,
    action,
    scope: webScope,
    matching_alerts: result.matching_alerts,
    eligible_alerts: result.eligible_alerts,
    device_id: result.device_id,
    panel_name: result.panel_name,
    tag_name: result.tag_name,
    metric_key: result.metric_key,
    severity: result.severity,
  });

  return result;
}

/**
 * Applies a scoped lifecycle action: ack | unack | solve | unsolve | ack_solve
 * LIFECYCLE ACTION IS PRIMARY (mirrors web applyAlertActionApi)
 */
export async function applyLifecycleAction(
  alert: AlertItem,
  action: LifecycleAction,
  scope: ApplyScope,
  note: string = "",
  resolutionMethod?: string
): Promise<LifecycleActionResult> {
  const lifecycleAlertId = getLifecycleAlertId(alert);

  if (!lifecycleAlertId) {
    throw new Error("Missing alert ID for action");
  }

  const webScope = toWebLifecycleScope(scope);

  // Ensure selected alert + matching scoped history exist
  // in lifecycle before applying the action.
  await hydrateLifecycleScope(alert, webScope);

  const payload: any = {
    ...buildLifecycleAlertPayload(alert),
    action,
    scope: webScope,
    note: note || "",
  };

  if (resolutionMethod) {
    payload.resolution_method = resolutionMethod;
  }

  try {
    const res =
      await telemetryClient.patch<{ data: LifecycleActionResult }>(
        `/api/v1/alert-lifecycle/${lifecycleAlertId}/action`,
        payload
      );

    const result = res.data?.data;

    if (!result) {
      throw new Error("Invalid lifecycle action response");
    }

    // Match web behavior:
    // synchronize legacy Alert-service ACK state only
    // for a single-alert acknowledgement operation.
    //
    // Solve / unsolve remain lifecycle-driven.
    if (scope === "this") {
      const legacyId = String(
        alert._id ||
        alert.alert_id ||
        lifecycleAlertId
      ).trim();

      if (action === "ack" || action === "ack_solve") {
        await alertApi
          .acknowledgeAlert(legacyId, {
            action: "ack",
            note,
          })
          .catch((syncError: any) => {
            console.warn(
              "[LifecycleApi] Legacy single-alert ack sync failed:",
              syncError?.message || syncError
            );
          });
      } else if (action === "unack") {
        await alertApi
          .unacknowledgeAlert(legacyId)
          .catch((syncError: any) => {
            console.warn(
              "[LifecycleApi] Legacy single-alert unack sync failed:",
              syncError?.message || syncError
            );
          });
      }
    }

    console.log("[Lifecycle Action Result]", {
      action,
      scope: webScope,

      updated_alerts:
        (result as any)?.updated_alerts ??
        result.updated_incidents,

      updated_incidents:
        result.updated_incidents,

      failures:
        result.failures,

      remaining_eligible_alerts:
        (result as any)?.remaining_eligible_alerts,

      selected_state:
        result.selected_state,
    });

    return result;
  } catch (err: any) {
    console.error("[LifecycleApi] Lifecycle action FAILED", {
      action,
      scope: webScope,
      lifecycleAlertId,
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message,
    });

    // NEVER silently downgrade Today / Week / All Previous
    // to the legacy single-alert API.
    throw err;
  }
}