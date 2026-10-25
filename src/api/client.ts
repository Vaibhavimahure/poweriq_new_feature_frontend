/**
 * client.ts — DEPRECATED SHIM
 * ----------------------------------------------------------------------------
 * This file previously served as the single Axios client for everything.
 * It is now replaced by two separate clients:
 *
 *   authClient.ts  → https://dev.esm.co.in/api/auth          (auth only)
 *   alertClient.ts → https://dev.esm.co.in/api/alert/api/v1  (alerts only)
 *
 * This shim re-exports from alertClient.ts so any remaining imports from
 * "api/client" continue to work without crashing during migration.
 *
 * DO NOT add new code here. Import directly from authClient or alertClient.
 * ----------------------------------------------------------------------------
 */

export {
  alertClient as apiClient,
  getAlertBaseUrl as getApiBaseUrl,
  setAlertBaseUrl as setApiBaseUrl,
} from "./alertClient";
