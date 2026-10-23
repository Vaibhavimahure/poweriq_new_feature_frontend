/**
 * geofenceService.ts — PowerIQ 500m Attendance Geofencing Engine
 * ----------------------------------------------------------------------------
 * Handles:
 *  - 500m plant boundary monitoring using expo-location & expo-task-manager
 *  - Precise Haversine distance calculation against official plant coordinates
 *  - In-memory & persistent inside/outside state management
 *  - Background location updates and secure backend status sync
 *  - User & Company isolation with complete logout cleanup
 *  - Integration with soundService to silence non-MD alerts when outside 500m
 * ----------------------------------------------------------------------------
 */

import { Platform } from "react-native";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { storage } from "./storage";
import { geofenceApi } from "../api/geofenceApi";
import {
  GeofenceStatus,
  GeofenceCoordinates,
  PlantGeofenceLocation,
  GeofenceStateSnapshot,
} from "../types/geofence";
import { normalizeRole } from "../utils/role";

export const POWERIQ_GEOFENCE_TASK = "POWERIQ_BACKGROUND_GEOFENCE_TASK";

// Storage keys
const STORAGE_KEY_STATUS = "@poweriq_geofence_status";
const STORAGE_KEY_USER_ID = "@poweriq_geofence_user_id";
const STORAGE_KEY_COMPANY_ID = "@poweriq_geofence_company_id";
const STORAGE_KEY_PLANT_ID = "@poweriq_geofence_plant_id";
const STORAGE_KEY_PLANT_COORDS = "@poweriq_saved_plant_coords";
const STORAGE_KEY_UPDATED_AT = "@poweriq_geofence_updated_at";
const STORAGE_KEY_PUSH_TOKEN = "@poweriq_expo_push_token";

// Freshness threshold: 3 minutes (180,000 ms) matching electricalPushController
export const GEOFENCE_FRESHNESS_TTL_MS = 3 * 60 * 1000;

// Maximum acceptable GPS inaccuracy: 80 meters
const MAX_ACCEPTABLE_ACCURACY = 80;

/**
 * Calculates the great-circle distance between two GPS coordinates in meters.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates GPS latitude and longitude numbers.
 */
export function isValidCoordinates(lat?: number | null, lng?: number | null): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180 &&
    (nLat !== 0 || nLng !== 0)
  );
}

type GeofenceChangeListener = (snapshot: GeofenceStateSnapshot) => void;

class GeofenceService {
  private currentStatus: GeofenceStatus = "unknown";
  private distanceMeters: number | null = null;
  private lastUpdated: number | null = null;
  private currentCoords: GeofenceCoordinates | null = null;
  private plantLocation: PlantGeofenceLocation | null = null;

  private currentUserId: string | null = null;
  private currentCompanyId: string | null = null;
  private currentPlantId: string | null = null;
  private currentUserRole: string | null = null;

  private isTracking = false;
  private isInitializing = false;
  private lastError: string | null = null;

  private listeners: Set<GeofenceChangeListener> = new Set();

  constructor() {
    this.hydrateFromStorage();
  }

  /**
   * Hydrates previous cached geofence state from storage on app boot.
   */
  private async hydrateFromStorage(): Promise<void> {
    try {
      const savedStatus = (await storage.getItem(STORAGE_KEY_STATUS)) as GeofenceStatus | null;
      const savedCoordsJson = await storage.getItem(STORAGE_KEY_PLANT_COORDS);
      const savedUpdatedAt = await storage.getItem(STORAGE_KEY_UPDATED_AT);
      const savedUserId = await storage.getItem(STORAGE_KEY_USER_ID);

      if (savedStatus && ["inside", "outside", "unknown"].includes(savedStatus)) {
        this.currentStatus = savedStatus;
      }
      if (savedCoordsJson) {
        try {
          this.plantLocation = JSON.parse(savedCoordsJson);
        } catch {}
      }
      if (savedUpdatedAt) {
        this.lastUpdated = parseInt(savedUpdatedAt, 10);
      }
      this.currentUserId = savedUserId || null;
      this.notifyListeners();
    } catch (err: any) {
      console.warn("[GeofenceService] Hydration notice:", err?.message);
    }
  }

  public subscribe(listener: GeofenceChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snap);
      } catch (err) {
        console.warn("[GeofenceService] Listener error:", err);
      }
    });
  }

  public getSnapshot(): GeofenceStateSnapshot {
    return {
      status: this.currentStatus,
      distanceMeters: this.distanceMeters,
      lastUpdated: this.lastUpdated,
      currentCoords: this.currentCoords,
      plantLocation: this.plantLocation,
      isTracking: this.isTracking,
      errorMessage: this.lastError,
    };
  }

  /**
   * Returns current geofence status with freshness check.
   */
  public getGeofenceStatus(): {
    status: GeofenceStatus;
    distanceMeters: number | null;
    isFresh: boolean;
    lastUpdated: number | null;
  } {
    const isFresh =
      this.lastUpdated !== null && Date.now() - this.lastUpdated < GEOFENCE_FRESHNESS_TTL_MS;

    return {
      status: isFresh ? this.currentStatus : "unknown",
      distanceMeters: this.distanceMeters,
      isFresh,
      lastUpdated: this.lastUpdated,
    };
  }

  /**
   * Loads official plant coordinates from backend for the user's company.
   */
  public async fetchOfficialPlantCoordinates(companyId?: string): Promise<PlantGeofenceLocation | null> {
    const targetComp = companyId || this.currentCompanyId;
    if (!targetComp) return null;

    try {
      const res = await geofenceApi.getPlantGeofence(targetComp);
      if (res.success && res.location && isValidCoordinates(res.location.latitude, res.location.longitude)) {
        this.plantLocation = {
          ...res.location,
          radiusMeters: res.location.radiusMeters || 500,
        };
        await storage.setItem(STORAGE_KEY_PLANT_COORDS, JSON.stringify(this.plantLocation));
        this.notifyListeners();
        return this.plantLocation;
      }
    } catch (err: any) {
      console.warn("[GeofenceService] Failed to fetch official plant coordinates:", err?.message);
    }
    return this.plantLocation;
  }

  /**
   * Starts geofence monitoring for the authenticated user.
   * Isolates data to current user/company and stops any prior conflicting state.
   */
  public async startTracking(user: any, companyId?: string, plantId?: string): Promise<boolean> {
    if (this.isInitializing) return false;
    this.isInitializing = true;
    this.lastError = null;

    const newUserId = user?.id || user?._id || user?.userId || null;
    const newCompanyId = companyId || user?.companyId || null;
    const newPlantId = plantId || user?.plantId || null;
    const newRole = normalizeRole(user?.role);

    // 1. User / Company Isolation check: if user or company changed, clear previous state
    if (
      (this.currentUserId && this.currentUserId !== newUserId) ||
      (this.currentCompanyId && this.currentCompanyId !== newCompanyId)
    ) {
      console.log("[GeofenceService] Switching user/company context. Clearing prior geofence cache.");
      await this.clearCachedState();
    }

    this.currentUserId = newUserId;
    this.currentCompanyId = newCompanyId;
    this.currentPlantId = newPlantId;
    this.currentUserRole = newRole;

    await storage.setItem(STORAGE_KEY_USER_ID, String(newUserId || ""));
    await storage.setItem(STORAGE_KEY_COMPANY_ID, String(newCompanyId || ""));
    await storage.setItem(STORAGE_KEY_PLANT_ID, String(newPlantId || ""));

    try {
      // 2. Request Foreground Permission
      const fgPerm = await Location.requestForegroundPermissionsAsync();
      if (!fgPerm.granted) {
        this.lastError = "Location permission denied by user.";
        console.log("[GeofenceService] Foreground location permission not granted.");
        this.isInitializing = false;
        this.notifyListeners();
        return false;
      }

      // 3. Request Background Permission if supported on platform
      let bgGranted = false;
      try {
        const bgPerm = await Location.requestBackgroundPermissionsAsync();
        bgGranted = bgPerm.granted;
      } catch (bgErr) {
        console.log("[GeofenceService] Background permission not available or skipped:", bgErr);
      }

      // 4. Fetch official plant coordinates from backend
      await this.fetchOfficialPlantCoordinates(newCompanyId);

      // 5. Acquire immediate one-time high-accuracy position fix
      try {
        const immediateFix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await this.handleLocationUpdate(immediateFix);
      } catch (posErr: any) {
        console.warn("[GeofenceService] Immediate position fix notice:", posErr?.message);
      }

      // 6. Start Native Background Task if background permission is granted
      if (bgGranted) {
        const hasStarted = await Location.hasStartedLocationUpdatesAsync(POWERIQ_GEOFENCE_TASK);
        if (!hasStarted) {
          await Location.startLocationUpdatesAsync(POWERIQ_GEOFENCE_TASK, {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 25, // meters
            timeInterval: 30000, // 30 seconds
            deferredUpdatesInterval: 30000,
            foregroundService: {
              notificationTitle: "PowerIQ Geofencing",
              notificationBody: "Monitoring 500m plant attendance boundary for alert siren control.",
              notificationColor: "#2563EB",
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: false,
          });
          console.log("[GeofenceService] Native background geofence task started.");
        }
      }

      this.isTracking = true;
      this.isInitializing = false;
      this.notifyListeners();
      return true;
    } catch (err: any) {
      this.lastError = err?.message || "Failed to initialize geofencing.";
      this.isInitializing = false;
      console.warn("[GeofenceService] startTracking error:", err);
      this.notifyListeners();
      return false;
    }
  }

  /**
   * Handles incoming location update from either foreground fix or background task.
   */
  public async handleLocationUpdate(loc: Location.LocationObject): Promise<void> {
    if (!loc || !loc.coords) return;
    const { latitude, longitude, accuracy } = loc.coords;

    // Discard zero or invalid coordinates
    if (!isValidCoordinates(latitude, longitude)) return;

    // Discard poor accuracy readings
    if (accuracy && accuracy > MAX_ACCEPTABLE_ACCURACY) {
      console.log(`[GeofenceService] Discarding poor accuracy GPS fix (${accuracy.toFixed(1)}m > ${MAX_ACCEPTABLE_ACCURACY}m)`);
      return;
    }

    this.currentCoords = {
      latitude,
      longitude,
      accuracy,
      altitude: loc.coords.altitude,
      heading: loc.coords.heading,
      speed: loc.coords.speed,
      timestamp: loc.timestamp,
    };

    // Calculate distance if plant location is configured
    let newStatus: GeofenceStatus = "unknown";
    let dist: number | null = null;

    if (this.plantLocation && isValidCoordinates(this.plantLocation.latitude, this.plantLocation.longitude)) {
      dist = calculateHaversineDistance(
        latitude,
        longitude,
        this.plantLocation.latitude,
        this.plantLocation.longitude
      );
      this.distanceMeters = dist;

      const radius = this.plantLocation.radiusMeters || 500;
      newStatus = dist <= radius ? "inside" : "outside";
    }

    const previousStatus = this.currentStatus;
    this.currentStatus = newStatus;
    this.lastUpdated = Date.now();

    await storage.setItem(STORAGE_KEY_STATUS, newStatus);
    await storage.setItem(STORAGE_KEY_UPDATED_AT, String(this.lastUpdated));

    if (previousStatus !== newStatus) {
      console.log(
        `[GeofenceService] Status transition: ${previousStatus} -> ${newStatus} (${dist !== null ? `${dist.toFixed(1)}m` : "unknown distance"})`
      );
    }

    this.notifyListeners();

    // Sync to backend asynchronously
    this.syncDeviceLocationToBackend().catch((syncErr) => {
      console.log("[GeofenceService] Sync device location fallback:", syncErr?.message);
    });
  }

  /**
   * Synchronizes current location status with api-communication backend.
   */
  public async syncDeviceLocationToBackend(): Promise<void> {
    if (!this.currentUserId || !this.currentCoords) return;

    const pushToken = await storage.getItem(STORAGE_KEY_PUSH_TOKEN);
    if (!pushToken) return;

    try {
      await geofenceApi.updateDeviceLocation({
        expoPushToken: pushToken,
        geofenceStatus: this.currentStatus,
        plantId: this.currentPlantId,
        companyId: this.currentCompanyId,
        latitude: this.currentCoords.latitude,
        longitude: this.currentCoords.longitude,
        accuracy: this.currentCoords.accuracy,
        distanceMeters: this.distanceMeters,
        role: this.currentUserRole,
      });
    } catch (err: any) {
      // Background sync failures must never crash app
      console.log("[GeofenceService] Background sync error:", err?.response?.data?.message || err?.message);
    }
  }

  /**
   * Captures fresh GPS coordinates on demand (used by Admin settings).
   */
  public async captureCurrentLocation(): Promise<GeofenceCoordinates> {
    const fgPerm = await Location.requestForegroundPermissionsAsync();
    if (!fgPerm.granted) {
      throw new Error("Location permission is required to capture current position.");
    }

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
    });

    if (!isValidCoordinates(pos.coords.latitude, pos.coords.longitude)) {
      throw new Error("Invalid GPS coordinates received from device sensors.");
    }

    await this.handleLocationUpdate(pos);
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    };
  }

  /**
   * Saves new official plant centroid to backend (Admins & Owners).
   */
  public async saveOfficialPlantLocation(params: {
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    accuracy?: number;
    name?: string;
    address?: string;
  }): Promise<PlantGeofenceLocation> {
    if (!isValidCoordinates(params.latitude, params.longitude)) {
      throw new Error("Invalid plant coordinates. Latitude must be in [-90, 90], Longitude in [-180, 180].");
    }

    const res = await geofenceApi.setPlantGeofence({
      companyId: this.currentCompanyId || undefined,
      plantId: this.currentPlantId || undefined,
      latitude: params.latitude,
      longitude: params.longitude,
      radiusMeters: params.radiusMeters || 500,
      accuracy: params.accuracy,
      name: params.name,
      address: params.address,
    });

    if (!res.success) {
      throw new Error(res.message || "Failed to configure official plant coordinates.");
    }

    this.plantLocation = {
      latitude: params.latitude,
      longitude: params.longitude,
      radiusMeters: params.radiusMeters || 500,
      name: params.name || null,
      address: params.address || null,
      accuracy: params.accuracy || null,
      updatedAt: new Date().toISOString(),
    };

    await storage.setItem(STORAGE_KEY_PLANT_COORDS, JSON.stringify(this.plantLocation));

    // Re-evaluate current position against newly saved coordinates
    if (this.currentCoords) {
      const dist = calculateHaversineDistance(
        this.currentCoords.latitude,
        this.currentCoords.longitude,
        params.latitude,
        params.longitude
      );
      this.distanceMeters = dist;
      this.currentStatus = dist <= (params.radiusMeters || 500) ? "inside" : "outside";
      this.lastUpdated = Date.now();
      await storage.setItem(STORAGE_KEY_STATUS, this.currentStatus);
    }

    this.notifyListeners();
    return this.plantLocation;
  }

  /**
   * Stops tracking on logout and clears user-specific geofence state.
   */
  public async stopTracking(): Promise<void> {
    try {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(POWERIQ_GEOFENCE_TASK);
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(POWERIQ_GEOFENCE_TASK);
        console.log("[GeofenceService] Native background location updates stopped.");
      }
    } catch (err: any) {
      console.warn("[GeofenceService] Error stopping location updates:", err?.message);
    }

    await this.clearCachedState();
    this.isTracking = false;
    this.currentStatus = "unknown";
    this.distanceMeters = null;
    this.lastUpdated = null;
    this.currentCoords = null;
    this.plantLocation = null;
    this.currentUserId = null;
    this.currentCompanyId = null;
    this.currentPlantId = null;
    this.currentUserRole = null;
    this.notifyListeners();
  }

  private async clearCachedState(): Promise<void> {
    await storage.removeItem(STORAGE_KEY_STATUS);
    await storage.removeItem(STORAGE_KEY_USER_ID);
    await storage.removeItem(STORAGE_KEY_COMPANY_ID);
    await storage.removeItem(STORAGE_KEY_PLANT_ID);
    await storage.removeItem(STORAGE_KEY_PLANT_COORDS);
    await storage.removeItem(STORAGE_KEY_UPDATED_AT);
  }
}

export const geofenceService = new GeofenceService();

// ── Top-level TaskManager registration (Required by Expo) ────────────────────
if (!TaskManager.isTaskDefined(POWERIQ_GEOFENCE_TASK)) {
  TaskManager.defineTask(POWERIQ_GEOFENCE_TASK, async ({ data, error }) => {
    if (error) {
      console.warn("[GeofenceTask] Background geofence error:", error.message);
      return;
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      if (locations && locations.length > 0) {
        await geofenceService.handleLocationUpdate(locations[locations.length - 1]);
      }
    }
  });
}
