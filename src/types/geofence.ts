/**
 * geofence.ts
 * ----------------------------------------------------------------------------
 * Type definitions for PowerIQ 500m Attendance Geofencing, Plant Centroid
 * settings, and Device Location synchronization.
 * ----------------------------------------------------------------------------
 */

export type GeofenceStatus = "inside" | "outside" | "unknown";

export interface GeofenceCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  altitude?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp?: number;
}

export interface PlantGeofenceLocation {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  name?: string | null;
  address?: string | null;
  accuracy?: number | null;
  registeredBy?: string | null;
  registeredByName?: string | null;
  registeredAt?: string;
  updatedAt?: string;
}

export interface PlantGeofenceResponse {
  success: boolean;
  source?: "communication-service" | "company-service" | "none";
  companyId?: string;
  location: PlantGeofenceLocation | null;
  message?: string;
}

export interface DeviceLocationSyncPayload {
  expoPushToken: string;
  geofenceStatus: GeofenceStatus;
  plantId?: string | null;
  companyId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  distanceMeters?: number | null;
  role?: string | null;
}

export interface DeviceLocationSyncResponse {
  success: boolean;
  message: string;
  data?: {
    userId: string;
    geofenceStatus: GeofenceStatus;
    plantId?: string | null;
    companyId?: string | null;
    distanceMeters?: number | null;
    radiusMeters?: number;
    lastSeenAt?: string;
  };
}

export interface SavePlantGeofencePayload {
  companyId?: string;
  plantId?: string;
  name?: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  accuracy?: number;
  address?: string;
}

export interface GeofenceStateSnapshot {
  status: GeofenceStatus;
  distanceMeters: number | null;
  lastUpdated: number | null;
  currentCoords: GeofenceCoordinates | null;
  plantLocation: PlantGeofenceLocation | null;
  isTracking: boolean;
  errorMessage?: string | null;
}
