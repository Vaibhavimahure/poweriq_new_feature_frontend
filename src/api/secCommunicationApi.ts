/**
 * secCommunicationApi.ts
 * ----------------------------------------------------------------------------
 * Connects the mobile app directly to api-communication backend for:
 *   1. Camera OCR extraction of handwritten slips
 *   2. Forwarding production logs to trigger upstream KPI calculations
 *   3. Fetching product logs history
 * ----------------------------------------------------------------------------
 */

import { communicationClient } from "./communicationClient";
import { fetchSecProductHistory, createSecProductLog, fetchSecProductConfigs } from "./secApi";

export interface OcrExtractionResult {
  success: boolean;
  primaryProductionQty: number | null;
  secondaryProductionQty: number | null;
  wastageQty: number | null;
  rawText?: string;
  confidence?: number;
  method?: string;
}

export interface ProductionLogPayload {
  productionDate: string; // YYYY-MM-DD
  periodType: "shift" | "day" | "batch";
  shiftName: string;
  shifts?: string[];
  selectedShifts?: string[];
  primaryProductionQty: number;
  secondaryProductionQty?: number;
  wastageQty?: number;
  remarks?: string;
}

/**
 * Send an image (base64) of a handwritten or printed production slip to
 * api-communication for OCR extraction.
 */
export async function extractProductionLogOcr(
  base64Image: string,
  rawTextOverride?: string
): Promise<OcrExtractionResult> {
  try {
    const res = await communicationClient.post("/sec/ocr", {
      image: base64Image,
      rawText: rawTextOverride,
    });
    const data = res.data?.data || res.data;
  return {
  success:
    data.success !== false &&
    data.primaryProductionQty !== null &&
    data.primaryProductionQty !== undefined,

  primaryProductionQty: data.primaryProductionQty ?? null,
  secondaryProductionQty: data.secondaryProductionQty ?? null,
  wastageQty: data.wastageQty ?? null,
  rawText: data.rawText || "",
  confidence: data.confidence ?? 0,
  method: data.method,
};
  // } catch (err: any) {
  //   console.warn("[secCommunicationApi] OCR API call failed, attempting fallback:", err?.message);
  //   // If backend OCR failed or was unreachable, return safe fallback object so user can type manually
  //   return {
  //     success: false,
  //     primaryProductionQty: null,
  //     secondaryProductionQty: null,
  //     wastageQty: null,
  //   };
  // }

   } catch (err: any) {
      console.warn(
        "[secCommunicationApi] OCR API call failed, attempting fallback:",
        err?.message
      );

      return {
        success: false,
        primaryProductionQty: null,
        secondaryProductionQty: null,
        wastageQty: null,
      };
    }
  }

/**
 * Save a new Production Log for a product directly to the KPI microservice.
 * This triggers upstream KPI recalculation for SEC, TEC, Cost & Energy.
 */
export async function saveProductionLogToBackend(
  productId: string,
  payload: ProductionLogPayload
): Promise<any> {
  const cleanId = String(productId || "").trim();

  if (!cleanId) {
    throw new Error("Product ID is missing.");
  }

  // Auto-populate deviceUsage from product configuration for all LT and secondary MCC machines
  let deviceUsage: Array<{ did: string; usagePct: number }> = [];
  try {
    const configs = await fetchSecProductConfigs();
    const prod = (configs || []).find(
      (p: any) => String(p.productId || p._id || p.id).trim() === cleanId
    );
    if (prod) {
      const lt = (prod.selectedLtDevices || []).map((d: any) => ({
        did: d.did,
        usagePct: 100,
      }));
      const mcc = (prod.selectedMccDevices || []).map((d: any) => ({
        did: d.did,
        usagePct: Number(d.usagePct ?? 100),
      }));
      deviceUsage = [...lt, ...mcc];
    }
  } catch {}

  const effectiveShifts =
    payload.selectedShifts ||
    (payload.shiftName ? [payload.shiftName] : []);

  const pQty = Number(payload.primaryProductionQty ?? 0);
  const sQty = Number(payload.secondaryProductionQty ?? 0);
  const wQty = Number(payload.wastageQty ?? 0);

  // Match the payload expected by the existing KPI/SEC API (supporting all field aliases)
  const kpiPayload: any = {
    productionDate: payload.productionDate,
    productionWindowMode: "shift",
    periodType: "shift",
    shifts: effectiveShifts,
    selectedShifts: effectiveShifts,
    selected_shifts: effectiveShifts,

    // Primary production quantity (all aliases required by backend)
    qtyProduced: pQty,
    primaryProductionQty: pQty,
    productionQty: pQty,
    productionQtyEntered: pQty,
    primaryProductionQtyEntered: pQty,
    enteredProductionQty: pQty,
    quantity: pQty,

    // Secondary & wastage
    secondaryProductionQty: sQty,
    secondaryProductionQtyEntered: sQty,
    wastageQty: wQty,
    wastage_qty: wQty,

    remarks: payload.remarks || "",
  };

  if (deviceUsage.length > 0) {
    kpiPayload.deviceUsage = deviceUsage;
  }

  try {
    // Use the same SEC/KPI API used by the web dashboard
    return await createSecProductLog(cleanId, kpiPayload);
  } catch (err: any) {
    console.error(
      "[SEC] Production log save failed:",
      err?.response?.data || err?.message
    );

    throw new Error(
      err?.response?.data?.message ||
      err?.message ||
      "Failed to save production log."
    );
  }
}

  /**
   * Fetch product logs from KPI client (or fallback to api-communication).
   */
  export async function fetchProductLogsFromBackend(
    productId: string,
    params: {
      page?: number;
      limit?: number;
      productionDateFrom?: string;
      productionDateTo?: string;
    } = {}
  ): Promise<any> {
    const cleanId = String(productId || "").trim();
    if (!cleanId) return null;

    try {
      const directKpiData = await fetchSecProductHistory(cleanId, params);
      if (directKpiData) return directKpiData;
    } catch (err) {
      console.warn("[secCommunicationApi] Direct KPI fetch logs failed, trying communication fallback:", err);
    }

    try {
      const res = await communicationClient.get(`/sec/production-logs/${encodeURIComponent(cleanId)}`, {
        params,
      });
      return res.data?.data || res.data;
    } catch (err) {
      console.warn("[secCommunicationApi] Communication fetch logs fallback failed:", err);
      return null;
    }
  }

  /**
   * Fetch active shift information and options from api-communication.
   */
  export async function fetchShiftInfoFromBackend(): Promise<{
    activeShift: string;
    shifts: string[];
  }> {
    try {
      const res = await communicationClient.get("/sec/shift-info");
      return res.data?.data || {
        activeShift: "Morning Shift",
        shifts: ["Morning Shift", "Evening Shift", "Night Shift"],
      };
    } catch {
      return {
        activeShift: "Morning Shift",
        shifts: ["Morning Shift", "Evening Shift", "Night Shift"],
      };
    }
  }
