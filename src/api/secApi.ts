/**
 * secApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Product-Wise Specific Energy Consumption (SEC).
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

export interface SecProductOverviewItem {
  productId?: string;
  _id?: string;
  name?: string;
  productName?: string;
  primaryProductUnit?: string;
  secondaryProductUnit?: string;
  summary?: any;
  status?: string;
  [key: string]: any;
}

let _secOverviewCache: any = null;
let _secOverviewTime = 0;
const SEC_TTL = 30 * 1000; // 30s cache

export async function fetchSecOverview(
  forceRefresh = false,
  params?: { productionDateFrom?: string; productionDateTo?: string }
): Promise<any> {
  const now = Date.now();
  const url = joinUrl(SERVICE_BASES.KPI, "/sec-overview");
  const queryParams: any = {};
  if (forceRefresh) queryParams._secFresh = now;
  if (params?.productionDateFrom) queryParams.productionDateFrom = params.productionDateFrom;
  if (params?.productionDateTo) queryParams.productionDateTo = params.productionDateTo;

  const res = await powerIqClient.get(url, {
    params: Object.keys(queryParams).length ? queryParams : undefined,
  });
  const data = res.data?.data || res.data || {};
  return data;
}

export async function fetchSecProductHistory(
  productId: string,
  params: {
    page?: number;
    limit?: number;
    productionDateFrom?: string;
    productionDateTo?: string;
  } = {}
): Promise<any> {
  const cleanId = String(productId || "").trim();
  if (!cleanId) return null;

  const url = joinUrl(SERVICE_BASES.KPI, `/sec-product-history/${encodeURIComponent(cleanId)}`);
  const res = await powerIqClient.get(url, {
    params: { page: 1, limit: 50, ...params },
  });
  return res.data?.data || res.data;
}

export async function fetchSecProductConfigs(): Promise<any[]> {
  try {
    const url = joinUrl(SERVICE_BASES.KPI, "/sec-config");
    const res = await powerIqClient.get(url);
    const data = res.data?.data || res.data || [];
    return Array.isArray(data) ? data : data?.products || [];
  } catch (err: any) {
    console.warn("[secApi] fetchSecProductConfigs failed:", err?.message);
    return [];
  }
}

export async function createSecProductLog(
  productId: string,
  details: {
    productionDate: string;
    selectedShifts?: string[];
    primaryProductionQtyEntered: number;
    secondaryProductionQtyEntered?: number;
    wastageQty?: number;
    remarks?: string;
    [key: string]: any;
  }
): Promise<any> {
  const cleanId = String(productId || "").trim();
  if (!cleanId) throw new Error("Product ID is missing.");

  const url = joinUrl(SERVICE_BASES.KPI, `/sec-product-history/${encodeURIComponent(cleanId)}`);
  const res = await powerIqClient.post(url, details);
  _secOverviewCache = null; // Invalidate cache on new log
  return res.data?.data || res.data;
}

export async function fetchSecMachineOverview(params: {
  productionDateFrom?: string;
  productionDateTo?: string;
  forceRefresh?: boolean;
} = {}): Promise<any> {
  const url = joinUrl(SERVICE_BASES.KPI, "/sec-machine-overview");
  const queryParams: Record<string, any> = {};
  if (params.productionDateFrom) queryParams.productionDateFrom = params.productionDateFrom;
  if (params.productionDateTo) queryParams.productionDateTo = params.productionDateTo;
  if (params.forceRefresh) queryParams._secFresh = Date.now();

  const res = await powerIqClient.get(url, { params: queryParams });
  return res.data?.data || res.data || {};
}


