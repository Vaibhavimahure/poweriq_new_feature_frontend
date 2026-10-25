/**
 * authApi.ts
 * ----------------------------------------------------------------------------
 * Authentication API — DEPLOYED AUTH backend ONLY.
 *
 * Base: https://dev.esm.co.in/api/auth
 * Login: POST /api/v1/auth/login
 *
 * Confirmed login response structure (from authController.js):
 * {
 *   "message": "Login successful",
 *   "accessToken": "<JWT>",
 *   "refreshToken": "<JWT>",
 *   "userData": {
 *     "id": "<ObjectId>",
 *     "name": "...",
 *     "email": "...",
 *     "role": "...",
 *     "image": "..." | null
 *   }
 * }
 *
 * Auth mechanism: Bearer token — Authorization: Bearer <accessToken>
 * ----------------------------------------------------------------------------
 */

import axios from "axios";
import { authClient } from "./authClient";
import { LoginRequest, LoginResponse, RefreshTokenResponse } from "../types/auth";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";

export const authApi = {
  /**
   * Login with email + password.
   * Full endpoint: POST https://dev.esm.co.in/api/auth/api/v1/auth/login
   */
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    console.log("[AuthAPI] POST /api/v1/auth/login for:", credentials.email);

    const response = await authClient.post<LoginResponse>(
      "/api/v1/auth/login",
      credentials
    );

    // Safe structure log — does NOT print token values
    console.log("[AuthAPI] Login response shape:", {
      message: response.data?.message,
      hasAccessToken: Boolean(response.data?.accessToken),
      accessTokenLength: response.data?.accessToken?.length ?? 0,
      hasRefreshToken: Boolean(response.data?.refreshToken),
      userData: {
        id: response.data?.userData?.id,
        name: response.data?.userData?.name,
        email: response.data?.userData?.email,
        role: response.data?.userData?.role,
        hasImage: Boolean(response.data?.userData?.image),
      },
    });

    return response.data;
  },

  /**
   * Refresh access token.
   * Full endpoint: POST https://dev.esm.co.in/api/auth/api/v1/auth/refresh-token
   */
  refreshToken: async (token: string): Promise<RefreshTokenResponse> => {
    const response = await authClient.post<RefreshTokenResponse>(
      "/api/v1/auth/refresh-token",
      { token }
    );
    return response.data;
  },

  /**
   * Fetch all users from deployed auth service.
   * Full endpoint: GET https://dev.esm.co.in/api/auth/api/v1/user/getAllUsers
   * Accepts optional companyId. If omitted, auth server filters by authenticated user's company.
   */
  getAllUsers: async (companyId?: string): Promise<any[]> => {
    try {
      const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
      const params: Record<string, string> = {};
      if (companyId) {
        params.companyId = companyId;
      }
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      // 1. Primary: fetch from Web Dashboard Auth directory (dev.esm.co.in/api/auth)
      try {
        const webAuthUrl = `${(CONFIG.WEB_AUTH_BASE_URL || "https://dev.esm.co.in/api/auth").replace(/\/+$/, "")}/api/v1/user/getAllUsers`;
        const response = await axios.get(webAuthUrl, {
          params,
          headers,
          timeout: 10000,
        });
        if (Array.isArray(response.data?.data)) return response.data.data;
        if (Array.isArray(response.data)) return response.data;
      } catch (webErr) {
        // Fallback to communication users endpoint
        const response = await authClient.get("/users", {
          params,
          headers,
          timeout: 10000,
        });
        if (Array.isArray(response.data?.data)) return response.data.data;
        if (Array.isArray(response.data)) return response.data;
      }

      return [];
    } catch (err: any) {
      console.warn("[AuthAPI] getAllUsers error:", err?.response?.data || err?.message || err);
      return [];
    }
  },

  /**
   * Health check — verifies auth server reachability.
   */
  checkHealth: async (): Promise<{ message: string }> => {
    const response = await authClient.get<{ message: string }>("/health");
    return response.data;
  },
};

