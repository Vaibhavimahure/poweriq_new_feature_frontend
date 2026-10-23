/**
 * solar.ts
 * ----------------------------------------------------------------------------
 * Type definitions for Solar Inverters, OCR Slip Processing, and
 * Daily Generation Readings in PowerIQ-AI.
 * ----------------------------------------------------------------------------
 */

export type ReadingSource = "MANUAL" | "OCR";

export interface SolarInverterItem {
  inverterId: string;
  inverterIndex: number;
  inverterName: string;
  capacityKw: number;
  readingValue: number | string;
  unit?: string;
  source?: ReadingSource;
  scannedAt?: string;
}

export interface SolarInverterEditItem {
  inverterId: string;
  inverterIndex: number;
  inverterName: string;
  capacityKw: number;
  readingValue: string;
  unit: string;
  source: ReadingSource;
  scannedAt?: string;
}

export interface SolarInverterReadingRecord {
  _id?: string;
  companyId?: string;
  plantId?: string;
  solarDid: string;
  productionDate: string; // YYYY-MM-DD
  totalGenerationKwh: number;
  inverters: SolarInverterItem[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SolarOcrCandidate {
  value: number;
  unit: string;
  confidence?: number;
}

export interface SolarOcrResponse {
  success: boolean;
  data: {
    success: boolean;
    candidates: SolarOcrCandidate[];
    count: number;
    rawText: string;
    method?: string;
  };
  message?: string;
}

export interface SolarRegistryItem {
  inverterId: string;
  inverterIndex: number;
  inverterName: string;
  capacityKw: number;
  serialNumber?: string;
  isActive?: boolean;
}

export interface SolarRegistryResponse {
  success: boolean;
  data: {
    solarDid: string;
    companyId: string;
    plantId?: string;
    inverters: SolarRegistryItem[];
  } | null;
  message?: string;
}

export interface SolarReadingsResponse {
  success: boolean;
  recorded: boolean;
  data: SolarInverterReadingRecord | null;
  message?: string;
}

export interface SaveSolarReadingsPayload {
  solarDid: string;
  productionDate: string; // YYYY-MM-DD
  plantId?: string;
  inverters: Array<{
    inverterId: string;
    inverterIndex: number;
    inverterName: string;
    capacityKw?: number;
    readingValue: number;
    unit?: string;
    source?: ReadingSource;
    scannedAt?: string;
  }>;
  reason?: string;
  replaceAll?: boolean;
}
