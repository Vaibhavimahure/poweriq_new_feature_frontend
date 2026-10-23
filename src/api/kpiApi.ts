/**
 * kpiApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for KPI services:
 * - Plant Power Flow & Owner Page summaries
 * - Favorite Machines
 * - Machine Analytics cards (Energy Cost, PF, THD, Imbalance, Load, Time vs Load)
 * - Plant Avoidable Losses & Settings
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";
import { fetchMyCompany } from "./companyApi";

// ============================================================================
// Owner Page & Plant Power Flow
// ============================================================================

function pickFirstString(...values: any[]): string {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function pickSolarDidFromCompany(company: any): string {
  return pickFirstString(
    company?.solarDid,
    company?.solar_did,
    company?.solarDeviceId,
    company?.solar_device_id,
    company?.solar_device_did,
    company?.mainSolarDevice,
    company?.main_solar_device,
    company?.main_solar_did,
    company?.solar?.did,
    company?.solar?.deviceId,
    company?.solar?.device_id
  );
}

function pickDeviceIdFromPolicyNode(node: any): string {
  const data = node?.data || node || {};
  return pickFirstString(
    data?.deviceId,
    data?.deviceID,
    data?.did,
    data?.DID,
    data?.esai_device_id,
    data?.solar_did,
    data?.solarDid
  );
}

function isSolarPolicyNode(node: any): boolean {
  const data = node?.data || node || {};
  const text = [
    data?.propertyType,
    data?.panelType,
    data?.formType,
    data?.type,
    data?.sourceType,
    data?.source,
    data?.meterRole,
    data?.meter_role,
    data?.role,
    data?.name,
    data?.label,
    data?.displayName,
    data?.deviceName,
    data?.panel_name,
    data?.machine_name,
  ]
    .map((v) => String(v || "").trim().toUpperCase())
    .filter(Boolean);

  return text.some((v) => v === "SOLAR" || v.includes("SOLAR"));
}

function pickSolarDidFromPolicy(policyData: any): string {
  const nodes = Array.isArray(policyData?.jsonObj?.nodes) ? policyData.jsonObj.nodes : [];
  for (const node of nodes) {
    if (!isSolarPolicyNode(node)) continue;
    const did = pickDeviceIdFromPolicyNode(node);
    if (did) return did;
  }
  return "";
}

export async function fetchPlantOverview(params: any = {}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/plant-overview");
  const res = await powerIqClient.get(url, { params });
  return res.data?.data || res.data;
}

export async function fetchPlantPowerFlow(params: {
  fromSec?: number;
  toSec?: number;
  did?: string;
  from?: string | number;
  to?: string | number;
  mode?: string;
} = {}): Promise<any> {
  const queryParams: any = {};
  if (params.mode) queryParams.mode = params.mode;
  if (params.fromSec !== undefined) queryParams.fromSec = params.fromSec;
  if (params.toSec !== undefined) queryParams.toSec = params.toSec;
  if (params.from !== undefined) queryParams.from = params.from;
  if (params.to !== undefined) queryParams.to = params.to;
  if (params.did) queryParams.did = params.did;

  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/plant-power-flow");
  const res = await powerIqClient.get(url, { params: queryParams });
  return res.data?.data || res.data;
}

export async function fetchOwnerSolarPerformance(params: {
  fromSec?: number;
  toSec?: number;
  mainDid?: string;
  solarDid?: string;
  companyId?: string;
  from?: string | number;
  to?: string | number;
  mode?: string;
} = {}): Promise<any> {
  try {
    const from = Number(params?.fromSec ?? params?.from);
    const to = Number(params?.toSec ?? params?.to);

    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return {
        available: false,
        solarGeneration: null,
        solarYield: null,
        performanceScore: null,
        meta: { reason: "window_missing" },
      };
    }

    let resolvedSolarDid = String(params?.solarDid || "").trim();

    if (!resolvedSolarDid) {
      // 1. Check company profile
      const company = await fetchMyCompany().catch(() => null);
      resolvedSolarDid = pickSolarDidFromCompany(company);

      // 2. If not in company, check policy
      const companyId = params?.companyId || company?._id || company?.companyId || "";
      if (!resolvedSolarDid && companyId) {
        try {
          const policyUrl = joinUrl(SERVICE_BASES.POLICY, `/api/v1/policy/${encodeURIComponent(companyId)}`);
          const policyRes = await powerIqClient.get(policyUrl);
          const policyData = policyRes?.data?.policy || policyRes?.data?.data || policyRes?.data || null;
          resolvedSolarDid = pickSolarDidFromPolicy(policyData);
        } catch {
          // ignore policy fetch error
        }
      }
    }

    if (!resolvedSolarDid) {
      return {
        status: "ok",
        card: "solar_performance",
        available: false,
        solarGeneration: null,
        solarYield: null,
        performanceScore: null,
        meta: { reason: "solar_did_not_configured" },
      };
    }

    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/solar-performance");
    const res = await powerIqClient.get(url, {
      params: {
        did: resolvedSolarDid,
        from,
        to,
      },
    });

    const payload = res.data?.data || res.data || {};
    const values = payload?.values || {};

    return {
      status: "ok",
      card: "solar_performance",
      available: true,
      solarDid: payload?.solarDid || payload?.did || resolvedSolarDid,
      solarGeneration:
        values?.solarGeneration ??
        values?.totalGeneration ??
        payload?.solarGeneration ??
        payload?.totalGeneration ??
        null,
      solarYield: values?.solarYield ?? payload?.solarYield ?? null,
      performanceScore:
        values?.performanceScore ??
        values?.rtps ??
        values?.score ??
        payload?.performanceScore ??
        payload?.rtps ??
        payload?.score ??
        null,
      values,
      raw: payload,
    };
  } catch (err: any) {
    console.warn("[kpiApi] fetchOwnerSolarPerformance failed:", err?.message);
    return {
      status: "error",
      card: "solar_performance",
      available: false,
      solarGeneration: null,
      solarYield: null,
      performanceScore: null,
      error: err?.message || "Failed to load solar performance",
    };
  }
}

export async function fetchEnergyCostAnalysis(params: {
  from?: string | number;
  to?: string | number;
  fromSec?: number;
  toSec?: number;
  mode?: string;
} = {}): Promise<any> {
  const queryParams: any = {};
  if (params.mode) queryParams.mode = params.mode;
  if (params.fromSec !== undefined) queryParams.fromSec = params.fromSec;
  if (params.toSec !== undefined) queryParams.toSec = params.toSec;
  if (params.from !== undefined) queryParams.from = params.from;
  if (params.to !== undefined) queryParams.to = params.to;

  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/energy-cost-analysis");
  const res = await powerIqClient.get(url, { params: queryParams });
  return res.data?.data || res.data;
}

// ============================================================================
// Favorite Machines
// ============================================================================

export async function fetchFavoriteMachines(params: {
  fromSec?: number;
  toSec?: number;
  from?: number | string;
  to?: number | string;
  did?: string;
  mode?: string;
} = {}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/favorite");
  const queryParams: any = { ...params };
  if (!queryParams.mode) {
    queryParams.mode = "today";
  }
  const res = await powerIqClient.get(url, { params: queryParams });
  return res.data?.data || res.data;
}

export async function fetchFavoriteOptions(params: { mode?: string } = {}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/favorite/options");
  const queryParams: any = { mode: params.mode || "today", ...params };
  const res = await powerIqClient.get(url, { params: queryParams });
  return res.data?.data || res.data;
}

export async function saveFavoriteMachines(favorites: any[]): Promise<any> {
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/owner-page/favorite");
  const res = await powerIqClient.put(url, { favorites });
  return res.data?.data || res.data;
}

export async function fetchPowerQualityLossAnalytics(params: {
  did: string;
  companyId?: string;
  from: number;
  to: number;
}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/power-quality");
  const res = await powerIqClient.get(url, { params });
  return res.data?.data || res.data;
}

// ============================================================================
// Machine Analytics Cards
// ============================================================================

export async function fetchEnergyCostCard(
  did: string,
  fromSec: number,
  toSec: number
): Promise<any> {
  const params = { did, from: fromSec, to: toSec };
  let cardPayload: any = null;

  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/energy-cost-analysis/card");
    const res = await powerIqClient.get(url, { params });
    cardPayload = res.data?.data || res.data;
  } catch (err) {
    try {
      const fallbackUrl = joinUrl(SERVICE_BASES.KPI, "/energy-cost-analysis/card");
      const res = await powerIqClient.get(fallbackUrl, { params });
      cardPayload = res.data?.data || res.data;
    } catch {
      cardPayload = null;
    }
  }

  // If card payload already contains sourceBreakdown, return it
  if (cardPayload?.sourceBreakdown || cardPayload?.current?.sourceBreakdown) {
    return cardPayload;
  }

  // Fallback to details API to retrieve QuestDB grid/solar/dg totals (matching Web Dashboard)
  try {
    let detailsPayload: any = null;
    try {
      const detailsUrl1 = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/energy-cost-analysis/details");
      const detailsRes = await powerIqClient.get(detailsUrl1, { params });
      detailsPayload = detailsRes.data?.data || detailsRes.data;
    } catch {
      const detailsUrl2 = joinUrl(SERVICE_BASES.KPI, "/energy-cost-analysis/details");
      const detailsRes = await powerIqClient.get(detailsUrl2, { params });
      detailsPayload = detailsRes.data?.data || detailsRes.data;
    }

    if (detailsPayload) {
      const curTotals = detailsPayload?.current?.totals || {};
      const prevTotals = detailsPayload?.previous?.totals || {};

      const next = cardPayload ? { ...cardPayload } : {};
      next.current = {
        ...(next.current || {}),
        totalCost: next.current?.totalCost ?? curTotals?.totalSourceEnergyCost ?? null,
        totalCostWithDemandToD: next.current?.totalCostWithDemandToD ?? curTotals?.totalCostWithDemandToD ?? null,
        totalEnergy: next.current?.totalEnergy ?? curTotals?.totalConsumptionUnits ?? null,
        sourceBreakdown: {
          grid: {
            label: "Grid",
            energyUnits: Number(curTotals?.assetGridUnits ?? 0),
            cost: Number(curTotals?.gridVariableCost ?? 0),
          },
          solar: {
            label: "Solar",
            energyUnits: Number(curTotals?.assetSolarUnits ?? 0),
            cost: Number(curTotals?.solarEnergyCost ?? 0),
          },
          dg: {
            label: "DG",
            energyUnits: Number(curTotals?.assetDgUnits ?? 0),
            cost: Number(curTotals?.dgEnergyCost ?? 0),
          },
        },
      };

      next.previous = {
        ...(next.previous || {}),
        totalCost: next.previous?.totalCost ?? prevTotals?.totalSourceEnergyCost ?? null,
        totalCostWithDemandToD: next.previous?.totalCostWithDemandToD ?? prevTotals?.totalCostWithDemandToD ?? null,
        totalEnergy: next.previous?.totalEnergy ?? prevTotals?.totalConsumptionUnits ?? null,
        sourceBreakdown: {
          grid: {
            label: "Grid",
            energyUnits: Number(prevTotals?.assetGridUnits ?? 0),
            cost: Number(prevTotals?.gridVariableCost ?? 0),
          },
          solar: {
            label: "Solar",
            energyUnits: Number(prevTotals?.assetSolarUnits ?? 0),
            cost: Number(prevTotals?.solarEnergyCost ?? 0),
          },
          dg: {
            label: "DG",
            energyUnits: Number(prevTotals?.assetDgUnits ?? 0),
            cost: Number(prevTotals?.dgEnergyCost ?? 0),
          },
        },
      };

      return next;
    }
  } catch (err) {
    console.warn("[kpiApi] energy-cost details fallback failed:", err);
  }

  return cardPayload;
}

export async function fetchPfAnalysisSummary(params: {
  did: string;
  type?: string;
  billingDay?: number;
  from: number;
  to: number;
}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/pf-analysis/summary");
  const res = await powerIqClient.get(url, { params });
  return res.data?.data || res.data;
}

export async function fetchThdAnalysisSummary(params: {
  did: string;
  from: number;
  to: number;
  prevFrom?: number;
  prevTo?: number;
}): Promise<any> {
  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/thd-analysis/summary");
    const res = await powerIqClient.get(url, { params });
    return res.data?.data || res.data;
  } catch {
    const fallbackUrl = joinUrl(SERVICE_BASES.KPI, "/thd-analysis/summary");
    const res = await powerIqClient.get(fallbackUrl, { params });
    return res.data?.data || res.data;
  }
}

export async function fetchPowerImbalance(params: {
  did: string;
  mode?: string;
  from: number;
  to: number;
}): Promise<any> {
  const p = { mode: "card", ...params };
  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/power-imbalance");
    const res = await powerIqClient.get(url, { params: p });
    return res.data?.data || res.data;
  } catch {
    const fallbackUrl = joinUrl(SERVICE_BASES.KPI, "/power-imbalance");
    const res = await powerIqClient.get(fallbackUrl, { params: p });
    return res.data?.data || res.data;
  }
}

export async function fetchLoadAnalysis(params: {
  did: string;
  mode?: string;
  from: number;
  to: number;
  prevFrom?: number;
  prevTo?: number;
}): Promise<any> {
  const p = { mode: "card", ...params };
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/load-analysis");
  const res = await powerIqClient.get(url, { params: p });
  return res.data?.data || res.data;
}

export async function fetchTimeVsLoad(params: {
  did: string;
  from: number;
  to: number;
  consolidated?: boolean;
}): Promise<any> {
  const p = { consolidated: true, ...params };
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/time-vs-load-detailed");
  const res = await powerIqClient.get(url, { params: p });
  return res.data?.data || res.data;
}

export async function fetchTodAnalysis(params: {
  deviceId: string;
  from: number;
  to: number;
}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/tod-analysis");
  const res = await powerIqClient.get(url, { params });
  return res.data?.data || res.data;
}

// ============================================================================
// Plant Avoidable Losses & Settings
// ============================================================================

export async function fetchPowerQualityLosses(params: {
  did: string;
  curr_from: number;
  curr_to: number;
  prev_from?: number;
  prev_to?: number;
  view?: string;
}): Promise<any> {
  const p = { view: "card", ...params };
  try {
    const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/power-quality");
    const res = await powerIqClient.get(url, { params: p });
    return res.data?.data || res.data;
  } catch {
    const fallbackUrl = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/telemetry/power-quality");
    const res = await powerIqClient.post(fallbackUrl, p);
    return res.data?.data || res.data;
  }
}

export async function fetchLfiKpi(params: {
  did: string;
  mode?: string;
  from?: number;
  to?: number;
}): Promise<any> {
  const p = { mode: "billing_cycle", ...params };
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/lfi-kpi");
  const res = await powerIqClient.get(url, { params: p });
  return res.data?.data || res.data;
}

export async function fetchDemandAnalysis(payload: {
  did: string;
  billingCycleStartDay?: number;
  maxMd?: number;
  billed_demand_rate_rskva?: string | number;
  demand_75pct_kva?: string | number;
  excessFactor?: number;
  cd_kva?: number | null;
  bill_month?: string | number;
  bill_year?: number;
  formType?: string;
}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/demand_analysis");
  const res = await powerIqClient.post(url, payload);
  return res.data?.data || res.data;
}

export async function fetchPlantAvoidableLoss(payload: {
  did: string;
  view?: string;
  curr_from: number;
  curr_to: number;
  prev_from: number;
  prev_to: number;
}): Promise<any> {
  const body = { view: "card", ...payload };
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/telemetry/power-quality");
  const res = await powerIqClient.post(url, body);
  return res.data?.data || res.data;
}

export async function fetchPlantSettings(): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/power-quality/plant-settings");
  const res = await powerIqClient.get(url);
  return res.data?.data || res.data;
}

export async function updatePlantSettings(setting: string, enabled: boolean): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/power-quality/plant-settings");
  const res = await powerIqClient.put(url, { setting, enabled });
  return res.data?.data || res.data;
}

