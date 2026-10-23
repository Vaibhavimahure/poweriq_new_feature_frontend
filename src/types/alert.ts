export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "open" | "acknowledged" | "cleared";

export type DatePreset = "all" | "today" | "yesterday" | "week" | "month" | "custom";

export interface AlertItem {
  _id: string;
  alert_id?: string;
  company_id?: string | null;
  plant_id?: string | null;
  panel_id?: string | null;
  panel_name: string;
  panel_location?: string | null;
  device_id?: string | null;
  tag_name: string;
  metric_key?: string | null;
  alert_value: number | string;
  unit?: string | null;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  bulk_ack_status?: string | null;
  bulk_ack_user_id?: string | null;
  bulk_ts?: string | null;
  effective_status?: string;
  is_cleared?: boolean;
  clear_user_id?: string | null;
  clear_user?: string | null;
  clear_ts?: string | null;
  clear_note?: string | null;
  clear_scope?: string | null;
  ts: string;
  ack_user?: string | null;
  ack_user_id?: string | null;
  ack_ts?: string | null;
  ack_note?: string | null;
  owner_user_id?: string | null;
  owner_display?: string | null;
  createdAt?: string;
  updatedAt?: string;
  occurrence_counter?: number | null;
  active_accumulated_ms?: number | null;

  // Lifecycle decorated fields (Source of truth for display)
  lifecycle_acknowledged?: boolean;
  acknowledged?: boolean;
  solved?: boolean;
  solved_user?: string | null;
  solved_user_id?: string | null;
  solved_user_name?: string | null;
  solved_user_email?: string | null;
  solved_ts?: string | null;
  solved_by?: string | null;
  solve_reason?: string | null;
  resolution_method?: string | null;
  incident_key?: string | null;
  current_severity?: string | null;
  ack_user_name?: string | null;
  ack_user_email?: string | null;
  alert_service_status?: string | null;
  alert_service_ack_user?: string | null;
  alert_service_ack_user_id?: string | null;
  alert_service_ack_user_name?: string | null;
  alert_service_ack_user_email?: string | null;
  alert_service_ack_ts?: string | null;
  alert_service_ack_note?: string | null;
  alert_service_updated_at?: string | null;
}

export interface AlertCounters {
  pending_critical: number;
  pending_warning: number;
  ack_critical: number;
  ack_warning: number;
  unsolved_critical?: number;
  unsolved_warning?: number;
  all_solved?: number | string;
  solved_by_system?: number | string;
  acknowledged?: number | string;
}

export interface ListAlertsQuery {
  page?: number;
  pageSize?: number;
  severity?: string;
  status?: string;
  search?: string;
  panel_id?: string;
  plant_id?: string;
  device_id?: string;
  tag_name?: string;
  start?: string;
  end?: string;
  from?: string;
  to?: string;
  includeCleared?: boolean;
  includeSummary?: boolean;
}

export interface ListAlertsResponse {
  rows: AlertItem[];
  total: number | null;
  totals: AlertCounters | null;
  summary?: any;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AcknowledgeAlertRequest {
  action: "ack" | "unack";
  note?: string;
}

export type ApplyScope = "this" | "today" | "week" | "all_prev";

export interface BulkAcknowledgeRequest {
  action: "bulk_ack" | "bulk_unack";
  preset:
    | "today"
    | "yesterday"
    | "one_week"
    | "one_month"
    | "before_today"
    | "before_yesterday"
    | "before_one_week"
    | "before_one_month";
  did?: string;
}

export interface ClearAlertRequest {
  action: "clear" | "unclear";
  preset:
    | "today"
    | "yesterday"
    | "this_week"
    | "last_week"
    | "this_month"
    | "last_month"
    | "custom"
    | "all_for_did";
  note?: string;
  start?: string;
  end?: string;
  did?: string;
  severity?: string;
}

export interface SocketReadyPayload {
  ok: boolean;
  company_id?: string;
  reason?: string;
}

export function isAlertSolved(alert: AlertItem | null | undefined): boolean {
  if (!alert) return false;

  // 1. Explicit lifecycle solved state is PRIMARY
  if ((alert as any)?.solved !== undefined && (alert as any)?.solved !== null) {
    return (
      (alert as any).solved === true ||
      String((alert as any).solved).toLowerCase() === "true"
    );
  }

  // 2. Fallback to legacy Alerts service fields
  return (
    Boolean(alert.is_cleared) ||
    (alert.status || "").toLowerCase() === "cleared"
  );
}

export function isAlertSolvedBySystem(alert: AlertItem | null | undefined): boolean {
  if (!alert) return false;
  if (!isAlertSolved(alert)) return false;

  const solvedBy = String((alert as any)?.solved_by || (alert as any)?.solvedBy || "").toLowerCase();
  if (solvedBy === "system") return true;

  const resMethod = String(alert.resolution_method || (alert as any)?.solve_reason || "").toLowerCase();
  if (resMethod.includes("system") || resMethod.includes("auto")) return true;

  const clearUser = String(alert.clear_user || "").toLowerCase();
  const solvedUser = String(
    alert.solved_user ||
    (alert as any)?.solved_user_name ||
    (alert as any)?.solvedUser ||
    ""
  ).toLowerCase();

  if (clearUser.includes("system") || solvedUser.includes("system")) return true;

  // If solved without a human user assigned, it was auto-resolved by system
  const hasHumanUser = Boolean(
    (alert as any)?.solved_user_id ||
    (alert as any)?.solvedUserId ||
    (alert as any)?.clear_user_id ||
    (solvedUser && solvedUser !== "system" && solvedUser !== "null" && solvedUser !== "undefined")
  );

  return !hasHumanUser;
}

export function isAlertAcknowledged(alert: AlertItem | null | undefined): boolean {
  if (!alert) return false;

  // 1. Explicit lifecycle acknowledgement state is PRIMARY
  if (alert.lifecycle_acknowledged !== undefined && alert.lifecycle_acknowledged !== null) {
    return (
      alert.lifecycle_acknowledged === true ||
      String(alert.lifecycle_acknowledged).toLowerCase() === "true"
    );
  }
  if ((alert as any)?.acknowledged !== undefined && (alert as any)?.acknowledged !== null) {
    return (
      (alert as any).acknowledged === true ||
      String((alert as any).acknowledged).toLowerCase() === "true"
    );
  }

  // 2. Fallback to legacy Alerts service fields for alerts without lifecycle records
  const status = (alert.status || "open").toLowerCase();
  const bulkStatus = (alert.bulk_ack_status || "").toLowerCase();
  const effectiveStatus = bulkStatus || status;
  return effectiveStatus === "acknowledged";
}

export function getAcknowledgedByName(alert?: AlertItem | null): string {
  if (!alert) return "Operator";

  const candidates = [
    alert.ack_user_name,
    alert.ack_user,
    (alert as any)?.acknowledged_by,
    (alert as any)?.acknowledgedBy,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && trimmed.toLowerCase() !== "operator") {
        return trimmed;
      }
    }
  }

  return alert.ack_user || "Operator";
}

export function getResolvedByName(alert?: AlertItem | null): string {
  if (!alert) return "Not specified";

  const candidates = [
    alert.solved_user_name,
    alert.solved_user,
    alert.solved_by && alert.solved_by.toLowerCase() === "system"
      ? "System"
      : alert.solved_by,
    alert.clear_user,
    (alert as any)?.solvedBy,
    (alert as any)?.resolved_by,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && trimmed.toLowerCase() !== "operator") {
        if (trimmed.toLowerCase() === "system") {
          return "System";
        }
        return trimmed;
      }
    }
  }

  return "Not specified";
}


export function getLifecycleDisplayState(alert: AlertItem | null | undefined): "solved" | "acknowledged" | "open" {
  if (!alert) return "open";
  const solved = isAlertSolved(alert);
  const acknowledged = isAlertAcknowledged(alert);

  if (solved) {
    return "solved";
  }

  if (acknowledged) {
    return "acknowledged";
  }

  return "open";
}

/**
 * Resolves the unique deduplication key for an alert.
 *
 * Strict priority order:
 *  1. alert._id
 *  2. alert.alert_id
 *  3. alert.id
 *
 * DID is NEVER used alone as a deduplication key.
 * Multiple distinct alerts can originate from the same device (DID), such as:
 *  - Power Factor Critical
 *  - Current Imbalance Critical
 *  - THD Critical
 * All of these must independently produce notifications/sirens.
 *
 * Fallback Composite Key (ONLY when primary IDs are absent):
 *  composite_${did}_${timestamp}_${metric/tag}_${severity}
 */
export function getAlertDeduplicationKey(alert: AlertItem | null | undefined): string {
  if (!alert) return "";

  // 1. Primary Unique Alert IDs
  const primaryId = alert._id || alert.alert_id || (alert as any)?.id;
  if (primaryId) {
    return String(primaryId).trim();
  }

  // 2. Fallback Composite Key (ONLY when primary IDs are absent; NEVER DID alone)
  const did = alert.device_id || (alert as any)?.did || "";
  const timestamp =
    alert.ts ||
    alert.createdAt ||
    (alert as any)?.timestamp ||
    (alert as any)?.created_at ||
    (alert as any)?.telemetry_time ||
    (alert as any)?.telemetry_timestamp ||
    "";
  const metric =
    alert.tag_name ||
    (alert as any)?.tag ||
    (alert as any)?.metric ||
    (alert as any)?.parameter ||
    alert.message ||
    "";
  const severity = alert.severity || "";

  if (did && (timestamp || metric)) {
    return `composite_${did}_${timestamp}_${metric}_${severity}`.trim();
  }

  // Do not deduplicate if no unique alert ID or metric can be determined
  return "";
}

export function getUniqueAlertId(alert: AlertItem | null | undefined): string {
  if (!alert) return "";
  const primary = alert._id || alert.alert_id || (alert as any)?.id;
  if (primary) return String(primary).trim();
  return getAlertDeduplicationKey(alert);
}

