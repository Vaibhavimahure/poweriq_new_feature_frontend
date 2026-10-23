/**
 * telemetryApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Telemetry, Performance, and Current metrics.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

export interface TelemetryParams {
  did?: string;
  from?: number;
  to?: number;
  segment?: string;
  metric?: string;
  aggregation?: string;
  shift?: string;
  limit?: number;
  [key: string]: any;
}

export async function fetchTelemetry(params: TelemetryParams = {}): Promise<any> {
  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/telemetry");
    const res = await powerIqClient.get(url, { params });
    return res.data?.data || res.data;
  } catch (err: any) {
    console.warn("[telemetryApi] fetchTelemetry failed:", err?.message);
    throw err;
  }
}

/**
 * Performance telemetry query (matches Web Dashboard).
 * Returns RTPS, LL_VOL_IMB, I_CURR_IMB for both current and previous window.
 * Shared between Performance Index and Phase Imbalance to prevent duplicate network calls.
 */
export async function fetchPerformanceTelemetry(
  did: string,
  fromSec: number,
  toSec: number,
  prevFromSec?: number,
  prevToSec?: number
): Promise<any> {
  const fetchWindow = async (from: number, to: number) => {
    try {
      const data = await fetchTelemetry({
        did,
        from,
        to,
        segment: "performance",
        limit: 1,
      });
      const row = Array.isArray(data) ? data[0] : (data?.data?.[0] || data || {});
      return {
        rtps: Number(row?.RTPS ?? row?.rtps ?? 0),
        llVolImb: Number(row?.LL_VOL_IMB ?? row?.ll_vol_imb ?? 0),
        iCurrImb: Number(row?.I_CURR_IMB ?? row?.i_curr_imb ?? 0),
      };
    } catch {
      return { rtps: 0, llVolImb: 0, iCurrImb: 0 };
    }
  };

  const current = await fetchWindow(fromSec, toSec);
  const previous =
    prevFromSec && prevToSec
      ? await fetchWindow(prevFromSec, prevToSec)
      : { rtps: 0, llVolImb: 0, iCurrImb: 0 };

  return {
    ...current,
    current,
    previous,
    RTPS: current.rtps,
    LL_VOL_IMB: current.llVolImb,
    I_CURR_IMB: current.iCurrImb,
  };
}


/**
 * Latest telemetry record for device (matching Web Dashboard telemetry-latest-v2).
 * Used for live TS, last telemetry updated time, and live panel status.
 */
export async function fetchLatestTelemetry(did: string): Promise<any> {
  try {
    const data = await fetchTelemetry({ did, limit: 1 });
    const rows = Array.isArray(data) ? data : (data?.data || []);
    return rows[0] || null;
  } catch {
    return null;
  }
}

/**
 * Plant incomer PF telemetry for Plant Power Flow card.
 */
export async function fetchIncomerPfTelemetry(
  didOrParams?: string | { did?: string; from?: number; to?: number }
): Promise<number | null> {
  try {
    const opts = typeof didOrParams === "string" ? { did: didOrParams } : didOrParams || {};
    const params: TelemetryParams = {
      segment: "plant_summary",
      metric: "pf_stats",
      limit: 1000,
    };
    if (opts.did) params.did = opts.did;
    if (opts.from !== undefined) params.from = opts.from;
    if (opts.to !== undefined) params.to = opts.to;

    const data = await fetchTelemetry(params);
    const cur = data?.current || data?.values || data || {};
    const pf =
      cur?.avg_pf ??
      cur?.AVG_PF ??
      cur?.avgPf ??
      cur?.avg_power_factor ??
      null;
    return pf !== null ? Number(pf) : null;
  } catch (err) {
    return null;
  }
}

/**
 * Current telemetry with dynamic aggregation interval based on range duration.
 * <= 2 days -> 15m, <= 45 days -> 1h, <= 180 days -> 4h, otherwise -> 1d.
 */
export async function fetchCurrentTelemetry(
  did: string,
  fromSec: number,
  toSec: number
): Promise<any> {
  const durationDays = (toSec - fromSec) / (24 * 3600);
  let timeFrame = "1d";
  if (durationDays <= 2) timeFrame = "15m";
  else if (durationDays <= 45) timeFrame = "1h";
  else if (durationDays <= 180) timeFrame = "4h";

  return fetchTelemetry({
    did,
    segment: "current",
    from: fromSec,
    to: toSec,
    timeFrame,
    aggregation: "avg",
    shift: "ALL",
  });
}

export interface MachineSummaryParams {
  did: string;
  mode?: "today" | "billing_cycle" | "custom";
  from?: number;
  to?: number;
}

/**
 * Fetches machine summary telemetry for a device (matches Web Dashboard).
 * Returns performanceScore, benchmarkScore, ratedLoadKw, avgOperatingLoadKw,
 * avgPf, ratedPf, availableMinutes, upMinutes, downMinutes, overloadMinutes, idleMinutes.
 */
export async function fetchMachineSummary(params: MachineSummaryParams): Promise<any> {
  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/machine-summary");
    const res = await powerIqClient.get(url, { params });
    return res.data?.data || res.data;
  } catch (err: any) {
    console.warn("[telemetryApi] fetchMachineSummary failed:", err?.message);
    return null;
  }
}
