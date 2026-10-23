import { alertClient } from "./alertClient";
import {
  ListAlertsQuery,
  ListAlertsResponse,
  AlertItem,
  AcknowledgeAlertRequest,
} from "../types/alert";

export const alertApi = {
  listAlerts: async (
    params?: ListAlertsQuery
  ): Promise<ListAlertsResponse> => {
    const response = await alertClient.get<ListAlertsResponse>(
      "/api/v1/alerts",
      {
        params,
      }
    );

    if (!params?.page || params.page === 1) {
      console.log("[AlertAPI] listAlerts response shape:", {
        rowsCount:
          response.data?.rows?.length ??
          "rows field missing",
        total: response.data?.total,
        hasMore: response.data?.hasMore,
        hasTotals: Boolean(response.data?.totals),
        firstAlertKeys: response.data?.rows?.[0]
          ? Object.keys(response.data.rows[0])
          : "no alerts",
      });
    }
 
    return response.data;
  },

  fetchAllAlerts: async (
    params?: ListAlertsQuery
  ): Promise<AlertItem[]> => {
    try {
      const exportRes = await alertClient.get<{ rows: AlertItem[]; total?: number }>(
        "/api/v1/alerts/export",
        { params }
      );
      if (Array.isArray(exportRes.data?.rows) && exportRes.data.rows.length > 0) {
        return exportRes.data.rows;
      }
    } catch {
      // Fall through to paginated fetch
    }

    const pageSize = 100;
    const firstRes = await alertClient.get<ListAlertsResponse>(
      "/api/v1/alerts",
      { params: { ...params, page: 1, pageSize, includeSummary: true } }
    );
    const firstRows = Array.isArray(firstRes.data?.rows) ? firstRes.data.rows : [];
    const total = Number(firstRes.data?.total || 0);

    if (!firstRows.length || total <= firstRows.length) {
      return firstRows;
    }

    const totalPages = Math.min(100, Math.ceil(total / pageSize));
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

    const pagePromises = pages.map((page) =>
      alertClient
        .get<ListAlertsResponse>("/api/v1/alerts", {
          params: { ...params, page, pageSize, includeSummary: false },
        })
        .then((r) => (Array.isArray(r.data?.rows) ? r.data.rows : []))
        .catch(() => [])
    );

    const remainingPages = await Promise.all(pagePromises);
    return [...firstRows, ...remainingPages.flat()];
  },

  getAlertById: async (
    id: string
  ): Promise<AlertItem> => {
    const response = await alertClient.get<{
      data: AlertItem;
    }>(`/api/v1/alerts/${id}`);

    return response.data.data;
  },

  acknowledgeAlert: async (
    id: string,
    data?: AcknowledgeAlertRequest
  ): Promise<{
    message: string;
    data?: AlertItem;
  }> => {
    const response = await alertClient.patch<{
      message: string;
      data?: AlertItem;
    }>(
      `/api/v1/alerts/${id}/ack`,
      data || { action: "ack" }
    );

    return response.data;
  },

  unacknowledgeAlert: async (
    id: string
  ): Promise<{
    message: string;
    data?: AlertItem;
  }> => {
    const response = await alertClient.patch<{
      message: string;
      data?: AlertItem;
    }>(
      `/api/v1/alerts/${id}/ack`,
      { action: "unack" }
    );

    return response.data;
  },

  bulkAcknowledge: async (
    params: {
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
  ): Promise<{
    message: string;
    matched?: number;
    modified?: number;
  }> => {
    const response = await alertClient.patch<{
      message: string;
      matched?: number;
      modified?: number;
    }>("/api/v1/alerts/bulk_ack", params);

    return response.data;
  },

  /**
   * IMPORTANT:
   * This is the legacy CLEAR operation.
   *
   * DO NOT use this for "Mark as Solved".
   * clear => is_cleared=true => alert disappears
   * from normal Alert API lists.
   */
  clearAlert: async (
    params: {
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
  ): Promise<{
    message: string;
    matched?: number;
    modified?: number;
  }> => {
    const response = await alertClient.patch<{
      message: string;
      matched?: number;
      modified?: number;
    }>("/api/v1/alerts/clear", params);

    return response.data;
  },

  getBuildMeta: async (): Promise<{
    message: string;
    company_id: string;
  }> => {
    const response = await alertClient.get<{
      message: string;
      company_id: string;
    }>("/api/v1/alerts/build");

    return response.data;
  },
};