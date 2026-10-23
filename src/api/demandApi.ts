/**
 * demandApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Demand Charges & Analysis.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

export interface DemandAnalysisPayload {
  did: string;
  formType?: string;
  billingCycleStartDay?: number;
  maxMd?: number;
  billed_demand_rate_rskva?: number;
  demand_75pct_kva?: number;
  contract_demand_kva?: number;
  excessFactor?: number;
  companyId?: string;
  bill_month?: string;
  bill_year?: number | string;
  [key: string]: any;
}

export async function fetchHistoricalBills(
  companyId: string,
  params: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<any> {
  const url = joinUrl(
    SERVICE_BASES.BILLS,
    `/api/v1/bill/${encodeURIComponent(companyId)}/historical`
  );
  const res = await powerIqClient.get(url, { params: { page: 1, limit: 100, ...params } });
  return res.data?.data || res.data;
}

export async function fetchDemandHistoryContext(params: {
  month?: number;
  year?: number;
}): Promise<any> {
  try {
    const url = joinUrl(SERVICE_BASES.COMPANY, "/api/v1/company/my/demand-history/context");
    const res = await powerIqClient.get(url, { params });
    return res.data?.data || res.data;
  } catch (err: any) {
    console.warn("[demandApi] fetchDemandHistoryContext failed:", err?.message);
    return null;
  }
}

export async function fetchDemandAnalysis(payload: DemandAnalysisPayload): Promise<any> {
  const cleanPayload = { ...payload };
  Object.keys(cleanPayload).forEach((k) => {
    if (cleanPayload[k] === null || cleanPayload[k] === undefined || cleanPayload[k] === "") {
      delete cleanPayload[k];
    }
  });

  const url = joinUrl(SERVICE_BASES.TELEMETRY, "/api/v1/kpi/demand_analysis");
  const res = await powerIqClient.post(url, cleanPayload);
  return res.data?.data || res.data;
}
