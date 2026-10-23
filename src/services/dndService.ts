/**
 * dndService.ts — PowerIQ Critical Alert Override & DND Management
 * ----------------------------------------------------------------------------
 * Manages the opt-in "Critical Alert Override" feature:
 *  - Checks if Android Notification Policy / Do Not Disturb access is granted.
 *  - Opens official Android system settings if permission is not granted.
 *  - Configures the Critical notification channel (poweriq_critical_v3) to bypass
 *    DND when enabled and permitted.
 *  - Ensures the Warning channel (poweriq_warning_v3) NEVER bypasses DND.
 *  - NEVER modifies the global device ringer mode or system volume behind the user's back.
 * ----------------------------------------------------------------------------
 */

import { Platform, NativeModules, Linking } from "react-native";
import { storage } from "./storage";
import { CONFIG } from "../config/constants";
import { configureAndroidNotificationChannels, CHANNEL_CRITICAL } from "../config/notifications";

const { DndModule } = NativeModules;

export class DndService {
  /**
   * Checks whether Android Notification Policy (DND) access is granted.
   */
  public async isDndAccessGranted(): Promise<boolean> {
    if (Platform.OS !== "android") return false;

    try {
      if (DndModule?.isDndAccessGranted) {
        return await DndModule.isDndAccessGranted();
      }
    } catch (err) {
      console.warn("[DndService] isDndAccessGranted error:", err);
    }
    return false;
  }

  /**
   * Opens the official Android system settings screen where the user can grant
   * PowerIQ DND / Notification Policy access.
   */
  public async openDndSettings(): Promise<boolean> {
    if (Platform.OS !== "android") return false;

    try {
      if (DndModule?.openDndSettings) {
        return await DndModule.openDndSettings();
      }
      // Fallback intent
      await Linking.sendIntent("android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS");
      return true;
    } catch (err) {
      console.warn("[DndService] openDndSettings error:", err);
      try {
        await Linking.openSettings();
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Opens Android's native notification channel settings screen for PowerIQ.
   * Allows user to view/verify the "Bypass Do Not Disturb" toggle in system settings.
   */
  public async openChannelSettings(channelId: string = CHANNEL_CRITICAL.id): Promise<boolean> {
    if (Platform.OS !== "android") return false;

    try {
      if (DndModule?.openChannelSettings) {
        return await DndModule.openChannelSettings(channelId);
      }
      await Linking.sendIntent("android.settings.CHANNEL_NOTIFICATION_SETTINGS", [
        { key: "android.provider.extra.APP_PACKAGE", value: "com.poweriq.livealerts" },
        { key: "android.provider.extra.CHANNEL_ID", value: channelId },
      ]);
      return true;
    } catch (err) {
      console.warn("[DndService] openChannelSettings error:", err);
      try {
        await Linking.openSettings();
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Checks whether the user has opted in to Critical Alert Override in app settings.
   */
  public async isCriticalOverrideEnabled(): Promise<boolean> {
    try {
      const stored = await storage.getItem(CONFIG.STORAGE_KEYS.CRITICAL_ALERT_OVERRIDE);
      return stored === "true";
    } catch {
      return false;
    }
  }

  /**
   * Enables or disables Critical Alert Override setting.
   * If enabled, re-configures the Critical notification channel with bypassDnd.
   */
  public async setCriticalOverrideEnabled(enabled: boolean): Promise<void> {
    try {
      await storage.setItem(CONFIG.STORAGE_KEYS.CRITICAL_ALERT_OVERRIDE, String(enabled));
      // Re-configure Android channels with the updated DND policy
      await configureAndroidNotificationChannels(enabled);
    } catch (err) {
      console.warn("[DndService] setCriticalOverrideEnabled error:", err);
    }
  }

  /**
   * Checks whether the native Critical channel is currently set to bypass DND.
   */
  public async isCriticalChannelBypassingDnd(channelId: string = CHANNEL_CRITICAL.id): Promise<boolean> {
    if (Platform.OS !== "android") return false;

    try {
      if (DndModule?.isChannelBypassingDnd) {
        return await DndModule.isChannelBypassingDnd(channelId);
      }
    } catch (err) {
      console.warn("[DndService] isCriticalChannelBypassingDnd error:", err);
    }
    return false;
  }
}

export const dndService = new DndService();
