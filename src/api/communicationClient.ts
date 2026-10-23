import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";

export const communicationClient = axios.create({
  baseURL: CONFIG.COMMUNICATION_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

communicationClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let baseUrl = (config.baseURL || CONFIG.COMMUNICATION_BASE_URL).trim().replace(/\/+$/, "");

    if (baseUrl.endsWith("/api/v1") && config.url?.startsWith("/api/v1")) {
      config.url = config.url.replace(/^\/api\/v1/, "");
    }
    if (config.url && !config.url.startsWith("/")) {
      config.url = `/${config.url}`;
    }
    config.baseURL = baseUrl;

    // Attach Bearer token from storage
    const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

communicationClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    console.log("[CommunicationClient] Error:", {
      status: error?.response?.status,
      message: (error?.response?.data as any)?.message || error?.message,
      url: error?.config?.url,
    });
    return Promise.reject(error);
  }
);
