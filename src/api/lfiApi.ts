/**
 * lfiApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Load Power Incentive (LFI) Analytics.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

export async function fetchLfiAnalysis(params: {
  did: string;
  month: number;
  year: number;
  view?: string;
}): Promise<any> {
  const p = { view: "full", ...params };
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/lfi-analysis");
  const res = await powerIqClient.get(url, { params: p });
  return res.data?.data || res.data;
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

export async function fetchLoadProfileLeaderboard(params: {
  from: string | number;
  to: string | number;
  billingCycleStartDay?: number;
  companyId?: string;
  policyId?: string;
  formType?: string;
  limit?: number;
}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/telemetry");
  const query = {
    segment: "plant_summary",
    metric: "load_profile_leaderboard",
    formType: params.formType || "MCC",
    billingCycleStartDay: params.billingCycleStartDay || 1,
    order: "desc",
    page: 1,
    limit: params.limit || 50,
    timePeriod: "range",
    from: params.from,
    to: params.to,
    ...(params.companyId ? { companyId: params.companyId } : {}),
    ...(params.policyId ? { policyId: params.policyId } : {}),
  };
  const res = await powerIqClient.get(url, { params: query });
  return res.data?.data || res.data;
}

export async function fetchCompanyPolicy(companyId: string): Promise<any> {
  try {
    const url = joinUrl(SERVICE_BASES.POLICY, `/api/v1/policy/${encodeURIComponent(companyId)}`);
    const res = await powerIqClient.get(url);
    return res.data?.policy || res.data?.data || res.data;
  } catch (err: any) {
    console.warn("[lfiApi] fetchCompanyPolicy error:", err?.message);
    return null;
  }
}
