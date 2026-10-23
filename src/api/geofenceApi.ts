/**
 * geofenceApi.ts
 * ----------------------------------------------------------------------------
 * Connects the mobile app to api-communication geofencing endpoints:
 *   1. Device location & inside/outside status synchronization
 *   2. Fetching official plant centroid coordinates
 *   3. Setting / updating official plant coordinates (Admins & Owners)
 * ----------------------------------------------------------------------------
 */

import { communicationClient } from "./communicationClient";
import {
  DeviceLocationSyncPayload,
  DeviceLocationSyncResponse,
  PlantGeofenceResponse,
  SavePlantGeofencePayload,
} from "../types/geofence";

export const geofenceApi = {
  /**
   * Sync current device coordinates and 500m geofence status to backend.
   */
  updateDeviceLocation: async (
    payload: DeviceLocationSyncPayload
  ): Promise<DeviceLocationSyncResponse> => {
    const res = await communicationClient.post<DeviceLocationSyncResponse>(
      "/geofence/location",
      payload
    );
    return res.data;
  },

  /**
   * Retrieve current geofence status stored for this device and user.
   */
  getDeviceStatus: async (expoPushToken?: string): Promise<any> => {
    const res = await communicationClient.get("/geofence/status", {
      params: expoPushToken ? { expoPushToken } : undefined,
    });
    return res.data;
  },

  /**
   * Retrieve official plant coordinates. Checks communication DB first,
   * then falls back to company service.
   */
  getPlantGeofence: async (companyId?: string): Promise<PlantGeofenceResponse> => {
    const res = await communicationClient.get<PlantGeofenceResponse>(
      "/geofence/plant",
      {
        params: companyId ? { companyId } : undefined,
      }
    );
    return res.data;
  },

  /**
   * Save or update official plant coordinates (Administrators & Owners only).
   */
  setPlantGeofence: async (
    payload: SavePlantGeofencePayload
  ): Promise<{ success: boolean; message: string; data?: any }> => {
    const res = await communicationClient.put<{
      success: boolean;
      message: string;
      data?: any;
    }>("/geofence/plant", payload);
    return res.data;
  },
};
