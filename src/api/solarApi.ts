/**
 * solarApi.ts
 * ----------------------------------------------------------------------------
 * API client methods for Solar Inverter Daily Generation, Hardware Registry,
 * and Slip OCR parsing. All requests are routed through api-communication backend.
 * ----------------------------------------------------------------------------
 */

import { communicationClient } from "./communicationClient";
import {
  SolarOcrResponse,
  SolarRegistryResponse,
  SolarReadingsResponse,
  SaveSolarReadingsPayload,
  SolarInverterReadingRecord,
} from "../types/solar";

export const solarApi = {
  /**
   * Extract numeric readings from a photographed or uploaded solar inverter slip.
   * Rate-limited to 25 requests/min per user on the backend.
   */
  extractSolarOcr: async (payload: {
    image?: string;
    rawText?: string;
    expectedCount?: number;
    solarDid?: string;
  }): Promise<SolarOcrResponse> => {
    const res = await communicationClient.post<SolarOcrResponse>("/solar/ocr", payload);
    return res.data;
  },

  /**
   * Retrieve persistent hardware inverter registry for a solar device.
   */
  getRegistry: async (solarDid: string): Promise<SolarRegistryResponse> => {
    const res = await communicationClient.get<SolarRegistryResponse>("/solar/registry", {
      params: { solarDid },
    });
    return res.data;
  },

  /**
   * Synchronize hardware inverters with persistent registry.
   */
  syncRegistry: async (payload: {
    solarDid: string;
    plantId?: string;
    inverters: any[];
    reconciliations?: any[];
  }): Promise<SolarRegistryResponse> => {
    const res = await communicationClient.post<SolarRegistryResponse>("/solar/registry/sync", payload);
    return res.data;
  },

  /**
   * Retrieve recorded daily solar inverter generation readings for a specific date (YYYY-MM-DD).
   */
  getReadings: async (params: {
    solarDid: string;
    date: string;
  }): Promise<SolarReadingsResponse> => {
    const res = await communicationClient.get<SolarReadingsResponse>("/solar/readings", {
      params,
    });
    return res.data;
  },

  /**
   * Save or update daily inverter generation readings.
   * Concurrency-safe: uses replaceAll to cleanly persist inverter arrays with id_001 format.
   */
  saveReadings: async (
    payload: SaveSolarReadingsPayload
  ): Promise<{ success: boolean; message: string; data: SolarInverterReadingRecord }> => {
    const res = await communicationClient.put<{
      success: boolean;
      message: string;
      data: SolarInverterReadingRecord;
    }>("/solar/readings", payload);
    return res.data;
  },

  /**
   * Retrieve historical daily generation records.
   */
  getHistory: async (params: {
    solarDid: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; data: SolarInverterReadingRecord[] }> => {
    const res = await communicationClient.get<{
      success: boolean;
      data: SolarInverterReadingRecord[];
    }>("/solar/readings/history", {
      params,
    });
    return res.data;
  },
};
