/**
 * companyApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Company context & policy metadata.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

let _cachedCompany: any = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CompanyContext {
  _id?: string;
  companyId?: string;
  name?: string;
  company_name?: string;
  billingCycleStartDay?: number;
  contract_demand_kva?: number;
  plant_location?: string;
  shiftPackage?: any;
  mainDid?: string;
  solarDid?: string;
  [key: string]: any;
}

export async function fetchMyCompany(forceRefresh = false): Promise<CompanyContext | null> {
  const now = Date.now();
  if (!forceRefresh && _cachedCompany && now - _cacheTime < CACHE_TTL_MS) {
    return _cachedCompany;
  }

  try {
    const url = joinUrl(SERVICE_BASES.COMPANY, "/api/v1/company/my");
    const res = await powerIqClient.get(url);
    const data = res.data?.data?.company || res.data?.company || res.data?.data || res.data;
    if (data && typeof data === "object") {
      _cachedCompany = data;
      _cacheTime = now;
      return data;
    }
    return null;
  } catch (err: any) {
    console.warn("[companyApi] fetchMyCompany failed:", err?.message);
    return _cachedCompany || null;
  }
}

export function clearCompanyCache(): void {
  _cachedCompany = null;
  _cacheTime = 0;
}
