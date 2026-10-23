/**
 * alertClient.ts
 * ----------------------------------------------------------------------------
 * Dedicated Axios instance for the deployed ALERT backend.
 *
 * Base URL: https://dev.esmbackend.click/api/alert/api/v1
 *
 * Design principles:
 *  - DEFAULT is always the deployed HTTPS URL — never a local address
 *  - Stale local/HTTP URLs in AsyncStorage are REJECTED at read-time (not
 *    in a separate async migration that can race with the first request)
 *  - Dev Settings (gear icon on login screen) can override to a local backend
 *    but ONLY stores the override explicitly this session
 *  - Every request logs exact baseURL + auth state (no token values)
 *  - 401 auto-refresh via auth backend with queue for concurrent requests
 * ----------------------------------------------------------------------------
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";
import { authClient } from "./authClient";
import { RefreshTokenResponse } from "../types/auth";
import { refreshAccessToken, setCentralUnauthorizedHandler } from "../services/authSessionService";

// ============================================================================
// URL helpers
// ============================================================================

/**
 * Returns true if a URL is a local/development address that only works on an
 * emulator or local machine — NOT on a physical device over the internet.
 *
 * NOTE: http://192.168.x.x addresses are allowed because the user may be
 * deliberately testing against a LAN server via Dev Settings.
 */
const isStaleDevelopmentUrl = (url: string): boolean => {
  if (!url) return false;
  return (
    url.includes("10.0.2.2") ||   // Android emulator host alias
    url.includes("localhost") ||   // iOS simulator / local
    url.includes("127.0.0.1") ||   // loopback
    (url.includes("esmbackend.click") && !url.includes("/api/alert")) // stale path missing /api/alert
  );
};

// ============================================================================
// Runtime URL management
// ============================================================================

/** In-memory URL override. null = use CONFIG.DEFAULT_ALERT_BASE_URL. */
let _alertBaseUrl: string | null = null;

/**
 * Returns the effective alert backend base URL.
 *
 * Priority:
 *   1. In-memory _alertBaseUrl (set by setAlertBaseUrl / resetAlertBaseUrl)
 *   2. AsyncStorage stored value — ONLY if it is NOT a stale dev URL
 *   3. CONFIG.DEFAULT_ALERT_BASE_URL (deployed production HTTPS)
 *
 * Stale dev URLs (10.0.2.2, localhost, 127.0.0.1) are silently rejected and
 * cleared from storage. This prevents "Network Error" on physical devices
 * that still have an old emulator URL saved from a previous dev session.
 */
export const getAlertBaseUrl = async (): Promise<string> => {
  // Fast path: in-memory override already resolved this session
  if (_alertBaseUrl !== null) return _alertBaseUrl;

  try {
    const stored = await storage.getItem(CONFIG.STORAGE_KEYS.ALERT_BASE_URL);

    if (stored) {
      if (isStaleDevelopmentUrl(stored)) {
        // Stale emulator/localhost URL — clear it and fall through to deployed default
        console.warn(
          "[AlertClient] Stale dev URL in storage:",
          stored,
          "→ clearing, reverting to deployed URL"
        );
        storage.removeItem(CONFIG.STORAGE_KEYS.ALERT_BASE_URL).catch(() => {});
        // Fall through to default below
      } else {
        // Valid stored override (e.g. production URL or user-set LAN URL)
        _alertBaseUrl = stored;
        return stored;
      }
    }
  } catch (e) {
    console.warn("[AlertClient] getAlertBaseUrl storage read error:", e);
  }

  // Default: deployed production URL
  _alertBaseUrl = CONFIG.DEFAULT_ALERT_BASE_URL;
  return _alertBaseUrl;
};

/** Sets alert backend URL (Dev Settings only). Clears in-memory cache. */
export const setAlertBaseUrl = async (url: string): Promise<void> => {
  const formatted = url.trim().replace(/\/+$/, "");
  _alertBaseUrl = formatted;
  await storage.setItem(CONFIG.STORAGE_KEYS.ALERT_BASE_URL, formatted);
  alertClient.defaults.baseURL = formatted;
  console.log("[AlertClient] URL overridden to:", formatted);
};

/** Resets any Dev Settings URL override → back to deployed production URL. */
export const resetAlertBaseUrl = async (): Promise<void> => {
  _alertBaseUrl = CONFIG.DEFAULT_ALERT_BASE_URL;
  await storage.removeItem(CONFIG.STORAGE_KEYS.ALERT_BASE_URL);
  alertClient.defaults.baseURL = CONFIG.DEFAULT_ALERT_BASE_URL;
  console.log("[AlertClient] URL reset to deployed:", CONFIG.DEFAULT_ALERT_BASE_URL);
};

// ============================================================================
// One-time startup: clean legacy storage keys from pre-refactor sessions
// ============================================================================
storage
  .removeItem("@live_alerts_custom_api_url")
  .catch(() => {});

// ============================================================================
// Axios instance — starts with the deployed production URL
// ============================================================================
export const alertClient = axios.create({
  baseURL: CONFIG.DEFAULT_ALERT_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

console.log(
  "[AlertClient] Created. Default base URL:",
  CONFIG.DEFAULT_ALERT_BASE_URL
);

// ============================================================================
// Request interceptor: resolve URL + inject Bearer token
// ============================================================================
alertClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Resolve effective URL (validates + clears stale dev URLs inline)
    let baseUrl = await getAlertBaseUrl();
    baseUrl = baseUrl.trim().replace(/\/+$/, "");

    // Cleanly normalize URL path:
    // If baseUrl already ends with /api/v1 and config.url starts with /api/v1,
    // strip the duplicate /api/v1 from config.url.
    if (baseUrl.endsWith("/api/v1") && config.url?.startsWith("/api/v1")) {
      config.url = config.url.replace(/^\/api\/v1/, "");
    }
    if (config.url && !config.url.startsWith("/")) {
      config.url = `/${config.url}`;
    }

    config.baseURL = baseUrl;

    // Inject Bearer token
    const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Safe diagnostic log — no token values
    console.log("[AlertClient] ▶ Request:", config.method?.toUpperCase(), {
      baseURL: config.baseURL,
      path: config.url,
      fullURL: `${config.baseURL}${config.url}`,
      hasAuth: Boolean(config.headers.Authorization),
      tokenLen: token?.length ?? 0,
    });

    return config;
  },
  (err) => {
    console.error("[AlertClient] Request interceptor error:", err);
    return Promise.reject(err);
  }
);

// ============================================================================
// Response interceptor: error logging + 401 token refresh
// ============================================================================
type UnauthorizedHandler = () => void;

export const setOnUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  setCentralUnauthorizedHandler(handler);
};

alertClient.interceptors.response.use(
  (res) => {
    console.log("[AlertClient] ◀ Response:", res.status, res.config.url, {
      dataKeys: res.data ? Object.keys(res.data) : [],
    });
    return res;
  },
  async (error: AxiosError) => {
    // Full safe error log
    console.log("[AlertClient] ✗ Error:", {
      message: error?.message,
      code: error?.code,
      status: error?.response?.status,
      responseData: error?.response?.data,
      baseURL: error?.config?.baseURL,
      url: error?.config?.url,
      fullURL: `${error?.config?.baseURL ?? ""}${error?.config?.url ?? ""}`,
      method: error?.config?.method,
      hasAuthHeader: Boolean(error?.config?.headers?.Authorization),
      isNetworkError: !error?.response,
    });

    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        alertClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return alertClient(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);
