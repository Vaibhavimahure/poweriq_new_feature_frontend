/**
 * deviceApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for Device details and listing.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";
import { fetchMyCompany } from "./companyApi";

export interface MachineOption {
  did: string;
  name: string;
  panelType?: string;
  location?: string;
  ratedLoadKw?: number | null;
  ratedPf?: number | null;
  benchmarkScore?: number | null;
}

let _plantMachinesCache: MachineOption[] | null = null;
let _plantMachinesCacheTime = 0;
const PLANT_MACHINES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches all MCC and plant machines configured in the company's plant layout/policy.
 * Queries Device Service (/api/v1/mcc, /api/v1/lt) with fallback to Policy graph nodes.
 */
export async function fetchAllPlantMachines(forceRefresh = false): Promise<MachineOption[]> {
  const now = Date.now();
  if (!forceRefresh && _plantMachinesCache && now - _plantMachinesCacheTime < PLANT_MACHINES_CACHE_TTL) {
    return _plantMachinesCache;
  }

  try {
    const company = await fetchMyCompany();
    const companyId = company?._id || company?.companyId || null;

    let policyId: string | null = null;
    let policyNodes: any[] = [];

    if (companyId) {
      try {
        const policyUrl = joinUrl(SERVICE_BASES.POLICY, `/api/v1/policy/${encodeURIComponent(companyId)}`);
        const policyRes = await powerIqClient.get(policyUrl);
        const policy = policyRes.data?.policy || policyRes.data?.data?.policy || policyRes.data;
        policyId = policy?._id || policy?.policyId || null;
        policyNodes = policy?.jsonObj?.nodes || [];
      } catch (err: any) {
        console.warn("[deviceApi] Failed to resolve plant policy:", err?.message);
      }
    }

    const machineMap = new Map<string, MachineOption>();

    // 1. Extract MCC DIDs from policy layout nodes (exact web dashboard matching)
    let extractedMccDids: string[] = [];
    if (Array.isArray(policyNodes) && policyNodes.length > 0) {
      extractedMccDids = policyNodes
        .filter((n: any) => {
          const pt = String(n?.data?.propertyType || "").toLowerCase();
          const did = String(n?.data?.deviceId || "").trim();
          return pt === "mcc" && did;
        })
        .map((n: any) => String(n?.data?.deviceId || "").trim());
      extractedMccDids = Array.from(new Set(extractedMccDids));
    }

    // 2. Fetch MCC forms from device service
    try {
      const mccUrl = joinUrl(SERVICE_BASES.DEVICE, "/api/v1/mcc");
      const mccRes = await powerIqClient.get(mccUrl, {
        params: policyId ? { policyId } : {},
      });
      const forms = mccRes.data?.forms || mccRes.data?.data?.forms || mccRes.data?.data || mccRes.data || [];
      if (Array.isArray(forms)) {
        let filteredForms = forms;
        if (extractedMccDids.length > 0) {
          const didSet = new Set(extractedMccDids);
          filteredForms = forms.filter((f: any) => didSet.has(String(f?.did || "").trim()));
          const idx = new Map(extractedMccDids.map((d: string, i: number) => [d, i]));
          filteredForms.sort((a: any, b: any) => {
            const ia = idx.get(String(a?.did || "").trim());
            const ib = idx.get(String(b?.did || "").trim());
            return (ia ?? 9999) - (ib ?? 9999);
          });
        }

        filteredForms.forEach((f: any) => {
          const did = String(f?.did || f?.deviceId || f?.deviceID || f?.esai_did || f?.esai_device_id || "").trim();
          if (!did) return;
          const name = String(f?.machine_name || f?.machineName || f?.panel_name || f?.panelName || f?.name || did).trim();
          const location = String(f?.location || f?.plant_location || f?.panel_location || "Utility Area").trim();
          const ratedLoadKw = Number(f?.machine_power_value ?? f?.total_rated_power_kw ?? null);
          const ratedPf = Number(f?.rated_pf ?? null);
          const benchmarkScore = Number(f?.benchmark_performance_value ?? f?.benchmark ?? null);

          machineMap.set(did, {
            did,
            name,
            panelType: "MCC",
            location,
            ratedLoadKw: Number.isFinite(ratedLoadKw) ? ratedLoadKw : null,
            ratedPf: Number.isFinite(ratedPf) ? ratedPf : null,
            benchmarkScore: Number.isFinite(benchmarkScore) ? benchmarkScore : null,
          });
        });
      }
    } catch (err: any) {
      console.warn("[deviceApi] Failed to fetch MCC forms:", err?.message);
    }

    // 3. Fallback: If forms endpoint was empty, populate from policy nodes directly
    if (machineMap.size === 0 && extractedMccDids.length > 0) {
      extractedMccDids.forEach((devId: string) => {
        const node = policyNodes.find((n: any) => String(n?.data?.deviceId || "").trim() === devId);
        const d = node?.data || {};
        const devLabel = String(d.deviceName || d.label || d.name || devId).trim();
        machineMap.set(devId, {
          did: devId,
          name: devLabel,
          panelType: "MCC",
          location: String(d.location || "Plant Area").trim(),
        });
      });
    }

    if (machineMap.size > 0) {
      const list = Array.from(machineMap.values());
      _plantMachinesCache = list;
      _plantMachinesCacheTime = now;
      return list;
    }

    return _plantMachinesCache || [];
  } catch (err: any) {
    console.warn("[deviceApi] fetchAllPlantMachines error:", err?.message);
    return _plantMachinesCache || [];
  }
}

export interface DeviceDetails {
  machine_name?: string;
  panel_name?: string;
  name?: string;
  esai_device_id?: string;
  panel_location?: string;
  location?: string;
  plant_location?: string;
  panel_rating_details?: string;
  nameplate_details?: string;
  machine_power_value?: number;
  total_rated_power_kw?: number;
  formType?: string;
  status?: string;
  [key: string]: any;
}

const _deviceCache: Record<string, { data: DeviceDetails; at: number }> = {};
const DEVICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function fetchDeviceById(
  did: string,
  forceRefresh = false
): Promise<DeviceDetails | null> {
  const cleanDid = String(did || "").trim();
  if (!cleanDid) return null;

  const now = Date.now();
  if (!forceRefresh && _deviceCache[cleanDid] && now - _deviceCache[cleanDid].at < DEVICE_CACHE_TTL) {
    return _deviceCache[cleanDid].data;
  }

  try {
    const url = joinUrl(SERVICE_BASES.DEVICE, `/api/v1/${encodeURIComponent(cleanDid)}`);
    const res = await powerIqClient.get(url);
    const data = res.data?.data || res.data;
    if (data) {
      _deviceCache[cleanDid] = { data, at: now };
      return data;
    }
    return null;
  } catch (err: any) {
    console.warn(`[deviceApi] fetchDeviceById(${cleanDid}) failed:`, err?.message);
    return _deviceCache[cleanDid]?.data || null;
  }
}
