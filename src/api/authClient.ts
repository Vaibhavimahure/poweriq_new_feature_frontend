/**
 * authClient.ts
 * ----------------------------------------------------------------------------
 * Dedicated Axios instance for the DEPLOYED AUTH backend only.
 *
 * Base URL: https://dev.esm.co.in/api/auth  (fixed deployed endpoint)
 * Login:    POST /api/v1/auth/login
 * Full:     https://dev.esm.co.in/api/auth/api/v1/auth/login
 *
 * This client:
 *  - Never reads a user-configurable URL from storage
 *  - Never attaches bearer tokens to login/refresh requests
 *  - Has NO 401 refresh-retry loop (auth endpoints are the source of tokens)
 * ----------------------------------------------------------------------------
 */

import axios from "axios";
import { CONFIG } from "../config/constants";

export const authClient = axios.create({
  baseURL: CONFIG.AUTH_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Safeguard against duplicate /api/v1 if AUTH_BASE_URL is configured with or without /api/v1
authClient.interceptors.request.use((config) => {
  let baseUrl = (config.baseURL || CONFIG.AUTH_BASE_URL).trim().replace(/\/+$/, "");
  if (baseUrl.endsWith("/api/v1") && config.url?.startsWith("/api/v1")) {
    config.url = config.url.replace(/^\/api\/v1/, "");
  }
  if (config.url && !config.url.startsWith("/")) {
    config.url = `/${config.url}`;
  }
  config.baseURL = baseUrl;
  return config;
});
