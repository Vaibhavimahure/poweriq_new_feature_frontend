/**
 * pushNotificationService.ts — PowerIQ Mobile Push Notification Engine
 * ----------------------------------------------------------------------------
 * Handles mobile push notification lifecycle via Expo Server SDK + FCM:
 *  - Permission request & status check
 *  - Expo Push Token extraction with EAS projectId (b1506bc9-c624-4a4c-b876-e4d325453e29)
 *  - Token registration with backend (/push/mobile/register)
 *  - Token deactivation on logout (/push/mobile/unregister)
 *  - Remote push testing (/push/mobile/test)
 *  - Per-device alert deduplication between Socket.IO and Native Push
 *  - Tap handling & navigation to Alert Details
 * ----------------------------------------------------------------------------
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import axios from "axios";
import { storage } from "./storage";
import { AlertItem, getAlertDeduplicationKey, getUniqueAlertId } from "../types/alert";
import { isNotificationEligibleRole, isOwnerRole, normalizeRole } from "../utils/role";
import { getAlertBaseUrl } from "../api/alertClient";
import { initializeNotifications, getOwnerNotificationsEnabled } from "../config/notifications";
import { CONFIG } from "../config/constants";
import { navigate } from "../navigation/navigationRef";
import { communicationApi } from "../api/communicationApi";

const STORAGE_KEY_EXPO_PUSH_TOKEN = "@poweriq_expo_push_token";
const EAS_PROJECT_ID = "b1506bc9-c624-4a4c-b876-e4d325453e29";

// In-memory per-device deduplication cache shared between Socket.IO and Push
const processedAlertIds = new Set<string>();

/**
 * Marks an alert ID as processed on this physical device.
 */
export function markAlertProcessed(alertId?: string | null): void {
  if (!alertId || !alertId.trim()) return;
  const id = alertId.trim();
  processedAlertIds.add(id);
  if (processedAlertIds.size > 300) {
    const first = processedAlertIds.values().next().value;
    if (first) processedAlertIds.delete(first);
  }
}

/**
 * Checks whether an alert has already been processed on this device.
 */
export function isAlertProcessed(alertId?: string | null): boolean {
  if (!alertId || !alertId.trim()) return false;
  return processedAlertIds.has(alertId.trim());
}

/**
 * Masks token for safe diagnostic logging without leaking the full secret.
 */
function maskToken(token?: string | null): string {
  if (!token) return "none";
  if (token.length <= 12) return "***";
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

/**
 * Helper to resolve the correct endpoint URL regardless of trailing /api/v1
 */
function resolveEndpointUrl(baseUrl: string, path: string): string {
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (cleanBase.endsWith("/api/v1")) {
    return `${cleanBase}${cleanPath}`;
  }
  return `${cleanBase}/api/v1${cleanPath}`;
}

/**
 * Requests notification permissions and logs diagnostic state.
 */
export async function requestPushNotificationPermission(): Promise<Notifications.NotificationPermissionsStatus> {
  const current = await Notifications.getPermissionsAsync();
  let status = current;

  if (!current.granted) {
    status = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
      android: {},
    });
  }

  console.log("[PowerIQ Push] permission", {
    granted: status.granted,
    status: status.status,
    canAskAgain: status.canAskAgain,
  });

  return status;
}

/**
 * Obtains the Expo Push Token using the configured EAS projectId.
 * Never returns raw FCM device token for backend registration.
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    const permission = await requestPushNotificationPermission();
    if (!permission.granted) {
      console.log("[PowerIQ Push] permission not granted");
      return null;
    }

    // Ensure notification channels are registered on Android
    await initializeNotifications();

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId ||
      EAS_PROJECT_ID;

    const tokenResult = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (tokenResult?.data) {
      const rawToken = String(tokenResult.data).trim();
      console.log("[PowerIQ Push] Expo token obtained", {
        maskedToken: maskToken(rawToken),
        platform: Platform.OS,
      });
      await storage.setItem(STORAGE_KEY_EXPO_PUSH_TOKEN, rawToken);
      return rawToken;
    }

    return null;
  } catch (err: any) {
    console.warn("[PowerIQ Push] Token retrieval error:", err?.message || err);
    return null;
  }
}

/**
 * Registers current device's Expo Push Token with the local/configured backend.
 * Best effort: never throws or fails login.
 */
export async function registerDevicePushAfterLogin(
  userData: { id?: string; name?: string; role?: unknown } | null,
  accessToken: string | null
): Promise<void> {
  if (!userData || !accessToken) return;

  const rawRole = userData.role;
  const canonicalRole = normalizeRole(rawRole);
  const eligible = isNotificationEligibleRole(canonicalRole);

  if (!eligible) {
    console.log("[PowerIQ Push] Registration skipped for excluded role:", canonicalRole);
    return;
  }

  if (isOwnerRole(canonicalRole)) {
    const ownerEnabled = await getOwnerNotificationsEnabled();
    if (!ownerEnabled) {
      console.log("[PowerIQ Push] Registration skipped: Owner has turned off notifications");
      return;
    }
  }

  const token = await getExpoPushToken();
  if (!token) {
    console.log("[PowerIQ Push] registration aborted: no Expo token");
    return;
  }

  const baseUrl = await getAlertBaseUrl();
  const registerUrl = resolveEndpointUrl(baseUrl, "/push/mobile/register");

  console.log("[PowerIQ Push] registration attempting", {
    url: registerUrl,
    maskedToken: maskToken(token),
    platform: Platform.OS === "ios" ? "ios" : "android",
    role: canonicalRole,
  });

  try {
    const response = await axios.post(
      registerUrl,
      {
        expoPushToken: token,
        platform: Platform.OS === "ios" ? "ios" : "android",
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );

    if (response?.data?.success) {
      console.log("[PowerIQ Push] registration success", {
        role: canonicalRole,
        message: response.data?.message,
      });
    } else {
      console.log("[PowerIQ Push] registration response:", response?.data);
    }

    // Also register with Communication Backend for chat notifications
    communicationApi
      .registerPushToken(token, Platform.OS === "ios" ? "ios" : "android", null, accessToken)
      .catch((err) => {
        console.log("[PowerIQ Push] Communication push registration fallback:", err?.message);
      });
  } catch (err: any) {
    // Push registration failure MUST NEVER break login or app functionality
    console.log("[PowerIQ Push] registration failed (safe fallback):", {
      status: err?.response?.status,
      message: err?.response?.data?.message || err?.message,
    });
  }
}

export async function unregisterDevicePush(
  accessToken: string | null
): Promise<void> {
  let token: string | null = null;
  let effectiveToken = accessToken;
  try {
    if (!effectiveToken) {
      effectiveToken = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    }

    token = await storage.getItem(STORAGE_KEY_EXPO_PUSH_TOKEN);
    if (!token) {
      token = await getExpoPushToken();
    }

    if (!token) {
      console.log("[PowerIQ Push] unregister skipped: no Expo push token");
      return;
    }

    const baseUrl = await getAlertBaseUrl();
    const unregisterUrl = resolveEndpointUrl(baseUrl, "/push/mobile/unregister");

    console.log("[PowerIQ Push] unregistering device token from backend:", maskToken(token));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (effectiveToken) {
      headers.Authorization = `Bearer ${effectiveToken}`;
    }

    const response = await axios.delete(unregisterUrl, {
      headers,
      data: {
        expoPushToken: token,
      },
      timeout: 8000,
    });

    console.log("[PowerIQ Push] unregister success", {
      success: response?.data?.success,
      message: response?.data?.message,
    });
  } catch (err: any) {
    console.warn("[PowerIQ Push] unregister failed:", {
      status: err?.response?.status,
      message: err?.response?.data?.message || err?.message,
    });
  } finally {
    // Also unregister from Communication Backend (awaiting to ensure delivery before session drops)
    try {
      await communicationApi.unregisterPushToken(token, effectiveToken);
    } catch (err: any) {
      console.log("[PowerIQ Push] Communication push unregister fallback:", err?.message);
    }

    // Clear the stored push token so next session registers freshly
    await storage.removeItem(STORAGE_KEY_EXPO_PUSH_TOKEN);
  }
}

/**
 * Triggers a real remote test push through the backend.
 */
export async function sendRemoteTestPush(
  severity: "critical" | "warning",
  accessToken: string | null
): Promise<{ success: boolean; data?: any; message?: string }> {
  if (!accessToken) {
    throw new Error("Authentication required for remote push test");
  }

  const baseUrl = await getAlertBaseUrl();
  const testUrl = resolveEndpointUrl(baseUrl, "/push/mobile/test");

  console.log(`[PowerIQ Push] Triggering remote ${severity} push test via:`, testUrl);

  const response = await axios.post(
    testUrl,
    { severity },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return response.data;
}

/**
 * Sets up foreground/background push listeners with stable alert deduplication.
 */
export function setupPushNotificationListeners(
  onPushAlertReceived?: (alert: AlertItem) => void,
  onPushAlertTap?: (alertId: string, alertData?: any) => void
): () => void {
  // 1. Notification received while app is active
  const subReceived = Notifications.addNotificationReceivedListener(async (notification) => {
    // Suppress if logged out
    const userToken = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (!userToken) {
      console.log("[PowerIQ Push] Notification ignored: User is logged out");
      return;
    }

    const data = notification.request.content.data as any;
    const alert = (data?.alert || data) as AlertItem;
    const alertId =
      String(data?.alertId || "").trim() ||
      getUniqueAlertId(alert) ||
      "";
    const severity = String(data?.severity || alert?.severity || "info");

    console.log("[PowerIQ Push] foreground notification received", {
      alertId,
      severity,
      title: notification.request.content.title,
      source: data?.source || "expo_push",
    });

    if (alertId) {
      if (isAlertProcessed(alertId)) {
        console.log("[PowerIQ Push] Duplicate notification suppressed (already processed by Socket):", alertId);
        return;
      }
      markAlertProcessed(alertId);
    }

    // Check for Communication chat message / mention
    if (data?.type === "CHAT_MESSAGE" || data?.type === "CHAT_MENTION") {
      const messageId = String(data.messageId || "").trim();
      if (messageId) {
        if (isAlertProcessed(messageId)) {
          console.log("[PowerIQ Push] Duplicate chat message suppressed:", messageId);
          return;
        }
        markAlertProcessed(messageId);
      }
      return;
    }

    if (onPushAlertReceived && alert) {
      onPushAlertReceived(alert);
    }
  });

  // 2. Notification response (user tapped system notification banner/tray)
  const subResponse = Notifications.addNotificationResponseReceivedListener(async (response) => {
    // Suppress if logged out
    const userToken = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (!userToken) {
      console.log("[PowerIQ Push] Notification response ignored: User is logged out");
      return;
    }

    const data = response.notification.request.content.data as any;

    // Check if this is a Communication chat message or mention
    if (data?.type === "CHAT_MESSAGE" || data?.type === "CHAT_MENTION" || data?.discussionId) {
      console.log("[PowerIQ Push] Chat notification tapped, navigating to discussion:", data.discussionId);
      navigate("DiscussionChat", {
        discussionId: String(data.discussionId),
        title: data.title || "Discussion",
        alertId: data.alertId || undefined,
      });
      return;
    }

    const alertId = String(
      data?.alertId ||
      data?.alert?._id ||
      data?.alert?.alert_id ||
      data?.alert?.id ||
      ""
    ).trim();

    console.log("[PowerIQ Push] notification tapped:", {
      alertId,
      actionIdentifier: response.actionIdentifier,
      source: data?.source,
    });

    if (alertId) {
      navigate("AlertDetail", { alertId, alert: data?.alert });
    }

    if (onPushAlertTap && alertId) {
      onPushAlertTap(alertId, data?.alert);
    }
  });

  return () => {
    subReceived.remove();
    subResponse.remove();
  };
}

/**
 * Handles cold start: checks if app was launched by tapping a push notification
 */
export async function handleColdStartNotification(): Promise<void> {
  try {
    const lastResponse = await Notifications.getLastNotificationResponseAsync();
    if (!lastResponse) return;

    const data = lastResponse.notification.request.content.data as any;
    if (!data) return;

    if (data?.type === "CHAT_MESSAGE" || data?.type === "CHAT_MENTION" || data?.discussionId) {
      console.log("[PowerIQ Push] Cold start chat navigation to:", data.discussionId);
      navigate("DiscussionChat", {
        discussionId: String(data.discussionId),
        title: data.title || "Discussion",
        alertId: data.alertId || undefined,
      });
    } else {
      const alertId = String(
        data?.alertId ||
        data?.alert?._id ||
        data?.alert?.alert_id ||
        ""
      ).trim();
      if (alertId) {
        console.log("[PowerIQ Push] Cold start alert navigation to:", alertId);
        navigate("AlertDetail", { alertId, alert: data?.alert });
      }
    }
  } catch (err) {
    console.warn("[PowerIQ Push] Cold start notification handling error:", err);
  }
}
