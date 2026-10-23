/**
 * userApi.ts
 * ----------------------------------------------------------------------------
 * Centralized API calls for User Profile & Identity.
 * ----------------------------------------------------------------------------
 */

import { powerIqClient, SERVICE_BASES, joinUrl } from "./powerIqClient";

let _userProfileCache: any = null;
let _userProfileTime = 0;
const USER_CACHE_TTL = 5 * 60 * 1000;

export async function fetchUserProfile(forceRefresh = false): Promise<any> {
  const now = Date.now();
  if (!forceRefresh && _userProfileCache && now - _userProfileTime < USER_CACHE_TTL) {
    return _userProfileCache;
  }

  try {
    const url = joinUrl(SERVICE_BASES.AUTH, "/api/v1/user/profile");
    const res = await powerIqClient.get(url);
    const data = res.data?.data?.user || res.data?.user || res.data?.data || res.data;
    if (data) {
      _userProfileCache = data;
      _userProfileTime = now;
      return data;
    }
    return null;
  } catch (err: any) {
    console.warn("[userApi] fetchUserProfile failed:", err?.message);
    return _userProfileCache || null;
  }
}

export async function fetchUserById(userId: string): Promise<any> {
  const cleanId = String(userId || "").trim();
  if (!cleanId) return null;

  try {
    const url = joinUrl(SERVICE_BASES.AUTH, `/api/v1/user/getUserById/${encodeURIComponent(cleanId)}`);
    const res = await powerIqClient.get(url);
    return res.data?.data || res.data;
  } catch (err: any) {
    console.warn(`[userApi] fetchUserById(${cleanId}) failed:`, err?.message);
    return null;
  }
}
