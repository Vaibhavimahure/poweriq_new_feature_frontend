/**
 * powerIqClient.ts
 * ----------------------------------------------------------------------------
 * Centralized HTTP client for PowerIQ-AI microservices.
 * Injects Bearer token, handles automatic refresh on 401,
 * and routes to the appropriate microservice base URLs.
 * ----------------------------------------------------------------------------
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { storage } from "../services/storage";
import {
  CONFIG,
  AUTH_BASE_URL,
  TELEMETRY_BASE_URL,
  KPI_BASE_URL,
  DEVICE_BASE_URL,
  COMPANY_BASE_URL,
  POLICY_BASE_URL,
  BILLS_BASE_URL,
  ALERT_BASE_URL,
} from "../config/constants";
import { authClient } from "./authClient";
import { RefreshTokenResponse } from "../types/auth";

import { refreshAccessToken } from "../services/authSessionService";

export const SERVICE_BASES = {
  AUTH: AUTH_BASE_URL,
  TELEMETRY: TELEMETRY_BASE_URL,
  KPI: KPI_BASE_URL,
  DEVICE: DEVICE_BASE_URL,
  COMPANY: COMPANY_BASE_URL,
  POLICY: POLICY_BASE_URL,
  BILLS: BILLS_BASE_URL,
  ALERT: ALERT_BASE_URL,
} as const;

export const powerIqClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

powerIqClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

powerIqClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        powerIqClient.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return powerIqClient(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export function joinUrl(base: string, path: string): string {
  const cleanBase = String(base || "").replace(/\/+$/, "");
  const cleanPath = String(path || "").replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}
