/**
 * authSessionService.ts — Centralized Token Refresh & Session Lifecycle Manager
 * ----------------------------------------------------------------------------
 * Guarantees long-lived 366-day session persistence by coordinating silent
 * token refresh across all API clients and app lifecycle events:
 *  - Deduplicates concurrent refresh requests via in-flight Promise mutex
 *  - Calls authoritative refresh endpoint: POST /api/v1/auth/refresh-token
 *  - Updates secure storage and all axios client defaults on successful rotation
 *  - Preserves saved credentials on transient network failures (offline/timeout/5xx)
 *  - Dispatches clean logout ONLY on confirmed unrecoverable 401/403 invalidation
 * ----------------------------------------------------------------------------
 */

import { authClient } from "../api/authClient";
import { storage } from "./storage";
import { CONFIG } from "../config/constants";
import { UserData } from "../types/auth";

export interface RefreshResult {
  accessToken: string;
  refreshToken?: string | null;
  userData?: UserData | null;
}

type TokenRefreshedCallback = (newToken: string, userData?: UserData | null) => void;
type UnauthorizedCallback = () => void;

let inFlightRefreshPromise: Promise<string> | null = null;
const tokenRefreshedListeners: Set<TokenRefreshedCallback> = new Set();
let unauthorizedHandler: UnauthorizedCallback | null = null;

export function addTokenRefreshedListener(cb: TokenRefreshedCallback): () => void {
  tokenRefreshedListeners.add(cb);
  return () => {
    tokenRefreshedListeners.delete(cb);
  };
}

export function setCentralUnauthorizedHandler(handler: UnauthorizedCallback | null): void {
  unauthorizedHandler = handler;
}

/**
 * Checks if an error is a permanent, unrecoverable authorization invalidation
 * (such as a revoked refresh token, expired 366-day session, or disabled account).
 */
export function isUnrecoverableAuthError(error: any): boolean {
  const status = error?.response?.status;
  return status === 401 || status === 403;
}

/**
 * Silently refreshes the access token using the securely stored refresh token.
 * Coalesces concurrent calls so only ONE network request is in-flight at any time.
 */
export async function refreshAccessToken(): Promise<string> {
  // If a refresh is already underway, reuse the pending promise
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  inFlightRefreshPromise = (async () => {
    const storedRefreshToken = await storage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);

    if (!storedRefreshToken) {
      const err: any = new Error("No refresh token available in secure storage.");
      err.isMissingRefreshToken = true;
      throw err;
    }

    try {
      console.log("[AuthSession] Executing coordinated token refresh...");

      // Normalizes to /api/v1/auth/refresh-token with dual payload compatibility
      const res = await authClient.post(
        "/api/v1/auth/refresh-token",
        {
          token: storedRefreshToken,
          refreshToken: storedRefreshToken,
        },
        { timeout: 15000 }
      );

      const data = res?.data || {};
      const newAccessToken: string =
        data.accessToken ||
        data.token ||
        data.data?.accessToken ||
        data.data?.token ||
        "";

      const newRefreshToken: string | null =
        data.refreshToken ||
        data.data?.refreshToken ||
        null;

      const rawUser = data.userData || data.user || data.data?.userData || data.data?.user || null;

      if (!newAccessToken) {
        throw new Error("Refresh response did not return a valid access token.");
      }

      // 1. Securely persist rotated access token
      await storage.setItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN, newAccessToken);

      // 2. If rotated refresh token was returned, securely save it
      if (newRefreshToken && newRefreshToken.trim()) {
        await storage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, newRefreshToken.trim());
      }

      // 3. Update cached user metadata if provided
      if (rawUser && typeof rawUser === "object") {
        try {
          const existingUser: Partial<UserData> = (await storage.getObject<UserData>(CONFIG.STORAGE_KEYS.USER_DATA)) || {};
          const mergedUser: UserData = {
            id: rawUser.id || rawUser._id || existingUser.id || "user",
            name: rawUser.name || rawUser.fullName || existingUser.name || "User",
            email: rawUser.email || existingUser.email || "",
            role: rawUser.role || existingUser.role || "Operator",
            image: rawUser.image ?? existingUser.image ?? null,
            companyId: rawUser.companyId || existingUser.companyId || null,
            company: rawUser.company || existingUser.company || null,
            plantId: rawUser.plantId || existingUser.plantId,
            plant: rawUser.plant || existingUser.plant,
          };
          await storage.setObject(CONFIG.STORAGE_KEYS.USER_DATA, mergedUser);
        } catch (e) {
          console.warn("[AuthSession] User metadata merge warning:", e);
        }
      }

      console.log("[AuthSession] Token refresh successful. Access token renewed.");

      // 4. Notify subscribers (AuthContext, WebSocket, etc.)
      tokenRefreshedListeners.forEach((listener) => {
        try {
          listener(newAccessToken, rawUser);
        } catch (e) {
          console.warn("[AuthSession] Listener error:", e);
        }
      });

      return newAccessToken;
    } catch (refreshErr: any) {
      const isUnrecoverable = isUnrecoverableAuthError(refreshErr);

      if (isUnrecoverable) {
        console.warn("[AuthSession] Refresh token permanently rejected by server (401/403). Session revoked.");
        try {
          await storage.removeItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
          await storage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
          await storage.removeItem(CONFIG.STORAGE_KEYS.USER_DATA);
        } catch (e) {
          console.warn("[AuthSession] Storage cleanup error:", e);
        }

        if (unauthorizedHandler) {
          try {
            unauthorizedHandler();
          } catch (e) {
            console.warn("[AuthSession] Unauthorized handler error:", e);
          }
        }
      } else {
        // Transient network error or 5xx: DO NOT delete credentials! Allow retry.
        console.warn(
          "[AuthSession] Refresh failed due to network or temporary server issue. Retaining saved credentials:",
          refreshErr?.message || refreshErr
        );
      }

      throw refreshErr;
    }
  })().finally(() => {
    inFlightRefreshPromise = null;
  });

  return inFlightRefreshPromise;
}
