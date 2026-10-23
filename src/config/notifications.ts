/**
 * notifications.ts — PowerIQ Severity-Based Notifications Engine
 * ----------------------------------------------------------------------------
 * End-to-end notification pipeline for real-time alerts:
 *  - Android Warning channel: poweriq_warning_v2 (importance: HIGH, sound: poweriq_alert.wav)
 *  - Android Critical channel: poweriq_critical_v2 (importance: MAX, sound: poweriq_critical.wav)
 *  - iOS: platform-appropriate custom sound in payload
 *  - Expo Go safe fallback: uses default system tone to prevent native crashes
 *  - Dynamic title & body with panel name & message
 *  - Stable alertId payload for AlertDetail navigation
 * ----------------------------------------------------------------------------
 */

import { Platform, NativeModules, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { storage } from "../services/storage";
import { CONFIG } from "./constants";
import { AlertItem, AlertSeverity, getUniqueAlertId } from "../types/alert";
import { isNotificationEligibleRole, isOwnerRole, normalizeRole } from "../utils/role";
import { geofenceService } from "../services/geofenceService";

import { getPerformanceMetricName, resolveDisplayPanelName } from "../utils/metrics";

const { DndModule } = NativeModules;

/* ============================================================
   ENVIRONMENT
============================================================ */

export const IS_EXPO_GO = Constants.executionEnvironment === "storeClient";

/* ============================================================
   SOUND FILE NAMES
============================================================ */
// For iOS & Local Notifications (requires file extension)
export const WARNING_SOUND_FILE = "poweriq_alert.wav";
export const CRITICAL_SOUND_FILE = "poweriq_critical.wav";

// For Android Native Channel Creation (Android raw resources MUST NOT contain extensions)
export const ANDROID_WARNING_SOUND = "poweriq_alert";
export const ANDROID_CRITICAL_SOUND = "poweriq_critical";

/* ============================================================
   ANDROID NOTIFICATION CHANNELS (SEVERITY SPECIFIC)
============================================================ */

// Native channels (v7 ensures clean OS channel recreation with MAX importance & bypassDnd)
export const CHANNEL_CRITICAL = {
  id: "poweriq_critical_v7",
  name: "PowerIQ Critical Alerts",
  importance: Notifications.AndroidImportance.MAX,
  sound: "poweriq_critical",
  vibrationPattern: [0, 400, 200, 400],
} as const;

export const CHANNEL_WARNING = {
  id: "poweriq_warning_v6",
  name: "PowerIQ Warnings & Owner Alerts",
  importance: Notifications.AndroidImportance.MAX,
  sound: WARNING_SOUND_FILE,
  vibrationPattern: [0, 300, 200, 300],
} as const;

// Dedicated Communication Channels (distinct from alert sirens)
export const CHANNEL_MESSAGES = {
  id: "poweriq_messages_v1",
  name: "PowerIQ Messages",
  importance: Notifications.AndroidImportance.HIGH,
  sound: "default",
  vibrationPattern: [0, 200, 100, 200],
} as const;

export const CHANNEL_MENTIONS = {
  id: "poweriq_mentions_v1",
  name: "PowerIQ Mentions",
  importance: Notifications.AndroidImportance.MAX,
  sound: "default",
  vibrationPattern: [0, 300, 150, 300],
} as const;

export const CHANNEL_SILENT = {
  id: "poweriq_silent_v1",
  name: "PowerIQ Silent Notifications",
  importance: Notifications.AndroidImportance.HIGH,
  sound: null,
  vibrationPattern: null,
} as const;

// Fallback channels for Expo Go
export const EXPO_GO_CHANNEL_CRITICAL = {
  id: "poweriq_critical_expo_go",
  name: "PowerIQ Critical Alerts",
  importance: Notifications.AndroidImportance.MAX,
  sound: "default",
  vibrationPattern: [0, 400, 200, 400],
} as const;

export const EXPO_GO_CHANNEL_WARNING = {
  id: "poweriq_warning_expo_go",
  name: "PowerIQ Warnings",
  importance: Notifications.AndroidImportance.MAX,
  sound: "default",
  vibrationPattern: [0, 250, 250, 250],
} as const;

export const EXPO_GO_CHANNEL_SILENT = {
  id: "poweriq_silent_expo_go",
  name: "PowerIQ Silent Notifications",
  importance: Notifications.AndroidImportance.HIGH,
  sound: null,
  vibrationPattern: null,
} as const;

/* ============================================================
   FOREGROUND NOTIFICATION HANDLER (REGISTERED AT MODULE LOAD)
   Enforces heads-up dropdown banner + audible sound on Android
============================================================ */

async function isUserAuthenticated(): Promise<boolean> {
  try {
    const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
    if (!token || token.trim() === "") return false;
    return true;
  } catch {
    return false;
  }
}

Notifications.setNotificationHandler({
  handleNotification: async () => {
    const authenticated = await isUserAuthenticated();
    if (!authenticated) {
      console.log("[Notifications] Suppressed notification & sound: User is logged out");
      return {
        shouldShowAlert: false,
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    };
  },
});

/* ============================================================
   DEFAULT PREFERENCES
============================================================ */

const DEFAULT_PREFERENCES: Record<AlertSeverity, boolean> = {
  critical: true,
  warning: true,
  info: true,
};

const preferenceKeys: Record<AlertSeverity, string> = {
  critical: CONFIG.STORAGE_KEYS.NOTIFICATION_CRITICAL,
  warning: CONFIG.STORAGE_KEYS.NOTIFICATION_WARNING,
  info: CONFIG.STORAGE_KEYS.NOTIFICATION_INFO,
};

let initialized = false;

/* ============================================================
   ROUTING HELPERS
============================================================ */

export function normalizeSeverity(severity?: string | null): AlertSeverity {
  const normalized = String(severity || "info").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "warning") return "warning";
  return "info";
}

/**
 * Determines whether an alert is a Maximum Demand (MD) alert.
 */
export function isMdAlert(alert?: any): boolean {
  if (!alert) return false;

  const tag = String(
    alert.tag_name ||
    alert.metric_key ||
    alert.metric ||
    alert.tag ||
    alert.parameter ||
    alert.sub_type ||
    alert.type ||
    ""
  ).toLowerCase();

  const message = String(
    alert.message ||
    alert.alert_message ||
    alert.description ||
    ""
  ).toLowerCase();

  const title = String(alert.title || "").toLowerCase();

  // 1. Tag / Metric checks
  const isMdTag =
    tag.includes("md_actual") ||
    tag.includes("actual_md") ||
    tag.includes("md_critical") ||
    tag.includes("md_warning") ||
    tag.includes("md_penalty") ||
    tag.includes("md_kva") ||
    tag.startsWith("ht_md") ||
    tag.startsWith("md_") ||
    tag.endsWith("_md") ||
    tag === "md";

  // 2. Keyword checks in alert message / title
  const isMdMessage =
    message.includes("maximum demand") ||
    message.includes("contract demand") ||
    message.includes("md penalty") ||
    message.includes("md exceed") ||
    message.includes("md breach") ||
    message.includes("md warning") ||
    message.includes("md critical") ||
    title.includes("maximum demand") ||
    title.includes("contract demand") ||
    title.includes("md ") ||
    title.startsWith("md:") ||
    title.includes("md alert");

  return isMdTag || isMdMessage;
}

export interface ResolvedSoundConfig {
  channelId: string;
  sound: string | undefined;
  isHarshSiren: boolean;
  isMildSound: boolean;
  isSilent: boolean;
  vibrationPattern?: number[];
  reason: string;
}

/**
 * Resolves alert sound and notification channel according to the FINAL agreed sound requirements:
 *
 * | Alert category | Maintenance inside 500m | Maintenance outside 500m | Other roles |
 * | MD Warning     | Harsh siren             | Harsh siren              | Silent      |
 * | MD Critical    | Harsh siren             | Harsh siren              | Silent      |
 * | MD Penalty     | Harsh siren             | Harsh siren              | Silent      |
 * | Non-MD Warning | Mild sound              | Silent                   | Silent      |
 * | Non-MD Critical| Mild sound              | Silent                   | Silent      |
 *
 * Rules:
 *  - MD alert audio MUST bypass location restrictions for Maintenance.
 *  - Unknown, stale or unavailable location must NOT authorize audible non-MD alerts.
 *  - Notification visibility MUST remain unchanged. Silent means no alert audio, not discarded.
 */
export function resolveAlertSoundConfig(
  alert?: AlertItem | null,
  userRole?: unknown,
  geofenceState?: { status: string; isFresh: boolean } | null,
  severity?: AlertSeverity
): ResolvedSoundConfig {
  const normRole = normalizeRole(userRole);
  const isMaintenance = normRole === "maintenance";
  const isMd = alert ? isMdAlert(alert) : false;

  // 1. Other roles (Non-Maintenance: Admin, Super Admin, Engineer, Production, Owner, Management)
  // Per Final agreed sound matrix: All Other roles are SILENT for all alert categories
  if (!isMaintenance) {
    return {
      channelId: IS_EXPO_GO ? EXPO_GO_CHANNEL_SILENT.id : CHANNEL_SILENT.id,
      sound: undefined,
      isHarshSiren: false,
      isMildSound: false,
      isSilent: true,
      vibrationPattern: undefined,
      reason: "Other roles -> Silent for all alerts per final sound matrix",
    };
  }

  // 2. Maintenance Role
  // A) MD alerts (Warning, Critical, Penalty) -> Harsh siren everywhere (GPS bypassed)
  if (isMd) {
    return {
      channelId: IS_EXPO_GO ? EXPO_GO_CHANNEL_CRITICAL.id : CHANNEL_CRITICAL.id,
      sound: IS_EXPO_GO ? "default" : CRITICAL_SOUND_FILE,
      isHarshSiren: true,
      isMildSound: false,
      isSilent: false,
      vibrationPattern: [0, 400, 200, 400],
      reason: "Maintenance on MD alert -> Harsh siren (GPS bypassed)",
    };
  }

  // B) Non-MD alerts (Warning, Critical) -> Audible ONLY when fresh, verified INSIDE 500m
  const currentGeofence = geofenceState !== undefined ? geofenceState : geofenceService.getGeofenceStatus();
  const isInside = Boolean(currentGeofence?.isFresh && currentGeofence?.status === "inside");

  if (isInside) {
    return {
      channelId: IS_EXPO_GO ? EXPO_GO_CHANNEL_WARNING.id : CHANNEL_WARNING.id,
      sound: IS_EXPO_GO ? "default" : WARNING_SOUND_FILE,
      isHarshSiren: false,
      isMildSound: true,
      isSilent: false,
      vibrationPattern: [0, 250, 250, 250],
      reason: "Maintenance on Non-MD alert inside 500m -> Mild sound",
    };
  }

  // Maintenance outside 500m, stale, unknown, or GPS unavailable -> SILENT
  return {
    channelId: IS_EXPO_GO ? EXPO_GO_CHANNEL_SILENT.id : CHANNEL_SILENT.id,
    sound: undefined,
    isHarshSiren: false,
    isMildSound: false,
    isSilent: true,
    vibrationPattern: undefined,
    reason: "Maintenance on Non-MD alert outside or unverified location -> Silent",
  };
}

/**
 * Returns the exact Android notification channel ID based on whether the alert is an MD or Critical alert.
 */
export function getChannelIdForAlert(
  alert?: AlertItem | null,
  isOwner: boolean = false,
  severity?: AlertSeverity,
  userRole?: unknown
): string {
  const role = userRole || (isOwner ? "owner" : undefined);
  const cfg = resolveAlertSoundConfig(alert, role, undefined, severity);
  return cfg.channelId;
}

/**
 * Returns the notification sound string for the alert.
 */
export function getSoundForAlert(
  alert?: AlertItem | null,
  isOwner: boolean = false,
  severity?: AlertSeverity,
  userRole?: unknown
): string | undefined {
  const role = userRole || (isOwner ? "owner" : undefined);
  const cfg = resolveAlertSoundConfig(alert, role, undefined, severity);
  return cfg.sound;
}

/**
 * Returns the exact Android notification channel ID based on severity, role, and environment.
 */
export function getChannelIdForSeverity(severity: AlertSeverity, isOwner: boolean = false): string {
  // For Owner: ALWAYS use the gentle Warning channel (configured with poweriq_alert.wav)
  if (isOwner) {
    return IS_EXPO_GO ? EXPO_GO_CHANNEL_WARNING.id : CHANNEL_WARNING.id;
  }
  if (IS_EXPO_GO) {
    return severity === "critical"
      ? EXPO_GO_CHANNEL_CRITICAL.id
      : EXPO_GO_CHANNEL_WARNING.id;
  }
  return severity === "critical"
    ? CHANNEL_CRITICAL.id
    : CHANNEL_WARNING.id;
}

/**
 * Returns the notification sound string for the platform/environment.
 * For Owner: ALWAYS returns WARNING_SOUND_FILE (poweriq_alert.wav) for both Warning and Critical.
 */
export function getSoundForSeverity(severity: AlertSeverity, isOwner: boolean = false): string {
  if (IS_EXPO_GO) return "default";
  if (isOwner) return WARNING_SOUND_FILE;
  return severity === "critical" ? CRITICAL_SOUND_FILE : WARNING_SOUND_FILE;
}

// export function notificationTitle(severity: AlertSeverity): string {
//   switch (severity) {
//     case "critical":
//       return "Critical PowerIQ Alert";
//     case "warning":
//       return "PowerIQ Warning";
//     default:
//       return "PowerIQ Info";
//   }
// }

export function notificationTitle(severity: AlertSeverity, alert?: AlertItem): string {
  const panel = alert ? resolveDisplayPanelName(alert) : "";
  const severityPrefix = severity === "critical" ? "🚨 Critical" : "⚠️ Warning";
  
  if (panel && panel !== "Alert") {
    return `${severityPrefix}: ${panel}`; // e.g., "🚨 Critical: VCB Panel"
  }
  return severity === "critical" ? "Critical PowerIQ Alert" : "PowerIQ Alert";
}

// export function notificationBody(alert: AlertItem): string {
//   const panelName = alert.panel_name || "";
//   const message = alert.message || "New alert received";
//   if (panelName) {
//     return `${panelName}: ${message}`;
//   }
//   return message;
// }

export function notificationBody(alert: AlertItem): string {
  const metric =
    getPerformanceMetricName(alert.tag_name || (alert as any)?.metric) ||
    alert.tag_name ||
    "Equipment Metric";
    
  const valueStr =
    alert.alert_value !== undefined && alert.alert_value !== null
      ? ` • ${alert.alert_value} ${alert.unit || ""}`.trim()
      : "";
  return `${metric}${valueStr}`; // e.g., "Power Factor • 0.96" or "THD – Current %"
}


/* ============================================================
   PERMISSIONS
============================================================ */

export async function getNotificationPermissionStatus(): Promise<Notifications.NotificationPermissionsStatus> {
  return Notifications.getPermissionsAsync();
}

export async function requestNotificationPermissions(): Promise<Notifications.NotificationPermissionsStatus> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return current;
  }
  return Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
    android: {},
  });
}

/* ============================================================
   ANDROID NOTIFICATION CHANNELS SETUP
============================================================ */

export async function configureAndroidNotificationChannels(
  criticalOverrideEnabled?: boolean
): Promise<void> {
  if (Platform.OS !== "android") return;

  // Determine whether Critical Alert Override is enabled and system authorized
  let shouldBypassDnd = false;
  try {
    if (NativeModules.DndModule?.isDndAccessGranted) {
      const dndGranted = await NativeModules.DndModule.isDndAccessGranted();
      if (criticalOverrideEnabled !== undefined) {
        shouldBypassDnd = criticalOverrideEnabled && dndGranted;
      } else {
        const stored = await storage.getItem(CONFIG.STORAGE_KEYS.CRITICAL_ALERT_OVERRIDE);
        shouldBypassDnd = (stored === "true" || stored === null) && dndGranted;
      }
    }
  } catch {
    shouldBypassDnd = false;
  }

  try {
    if (IS_EXPO_GO) {
      // 1. Expo Go Critical Channel
      await Notifications.setNotificationChannelAsync(EXPO_GO_CHANNEL_CRITICAL.id, {
        name: EXPO_GO_CHANNEL_CRITICAL.name,
        importance: EXPO_GO_CHANNEL_CRITICAL.importance,
        sound: EXPO_GO_CHANNEL_CRITICAL.sound,
        vibrationPattern: Array.from(EXPO_GO_CHANNEL_CRITICAL.vibrationPattern),
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // 2. Expo Go Warning Channel
      await Notifications.setNotificationChannelAsync(EXPO_GO_CHANNEL_WARNING.id, {
        name: EXPO_GO_CHANNEL_WARNING.name,
        importance: EXPO_GO_CHANNEL_WARNING.importance,
        sound: EXPO_GO_CHANNEL_WARNING.sound,
        vibrationPattern: Array.from(EXPO_GO_CHANNEL_WARNING.vibrationPattern),
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });

      // 3. Expo Go Silent Channel (for visual alerts without sound)
      await Notifications.setNotificationChannelAsync(EXPO_GO_CHANNEL_SILENT.id, {
        name: EXPO_GO_CHANNEL_SILENT.name,
        importance: EXPO_GO_CHANNEL_SILENT.importance,
        sound: null,
        enableVibrate: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    } else {
      // 1. Native Critical Channel: poweriq_critical_v7 (MAX importance, poweriq_critical, bypassDnd)
      await Notifications.setNotificationChannelAsync(CHANNEL_CRITICAL.id, {
        name: CHANNEL_CRITICAL.name,
        importance: Notifications.AndroidImportance.MAX,
        sound: "poweriq_critical",
        vibrationPattern: Array.from(CHANNEL_CRITICAL.vibrationPattern),
        enableVibrate: true,
        enableLights: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: shouldBypassDnd,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });

      // 2. Native Warning & Owner Channel: poweriq_warning_v6 (MAX importance, poweriq_alert)
      await Notifications.setNotificationChannelAsync(CHANNEL_WARNING.id, {
        name: CHANNEL_WARNING.name,
        importance: CHANNEL_WARNING.importance,
        sound: "poweriq_alert",
        vibrationPattern: Array.from(CHANNEL_WARNING.vibrationPattern),
        enableVibrate: true,
        enableLights: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        audioAttributes: {
          usage: Notifications.AndroidAudioUsage.NOTIFICATION,
          contentType: Notifications.AndroidAudioContentType.SONIFICATION,
        },
      });

      // 3. Native Silent Channel: poweriq_silent_v1 (HIGH importance, NO sound, NO vibration)
      await Notifications.setNotificationChannelAsync(CHANNEL_SILENT.id, {
        name: CHANNEL_SILENT.name,
        importance: CHANNEL_SILENT.importance,
        sound: null,
        enableVibrate: false,
        enableLights: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    // 3. Native Communication Messages Channel (short chat sound, NO siren)
    await Notifications.setNotificationChannelAsync(CHANNEL_MESSAGES.id, {
      name: CHANNEL_MESSAGES.name,
      importance: CHANNEL_MESSAGES.importance,
      sound: "default",
      vibrationPattern: Array.from(CHANNEL_MESSAGES.vibrationPattern),
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    // 4. Native Communication Mentions Channel (high priority, short chat sound)
    await Notifications.setNotificationChannelAsync(CHANNEL_MENTIONS.id, {
      name: CHANNEL_MENTIONS.name,
      importance: CHANNEL_MENTIONS.importance,
      sound: "default",
      vibrationPattern: Array.from(CHANNEL_MENTIONS.vibrationPattern),
      enableVibrate: true,
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });

    console.log("[PowerIQ Notification Channels] Android channels configured:", {
      expoGo: IS_EXPO_GO,
      criticalChannel: IS_EXPO_GO ? EXPO_GO_CHANNEL_CRITICAL.id : CHANNEL_CRITICAL.id,
      criticalBypassDnd: shouldBypassDnd,
      warningChannel: IS_EXPO_GO ? EXPO_GO_CHANNEL_WARNING.id : CHANNEL_WARNING.id,
      messagesChannel: CHANNEL_MESSAGES.id,
      mentionsChannel: CHANNEL_MENTIONS.id,
    });
  } catch (error: any) {
    console.warn("[PowerIQ Notification] Channel setup error:", error?.message || error);
  }
}

/* ============================================================
   INITIALIZATION
============================================================ */

export async function initializeNotifications(): Promise<void> {
  if (initialized) return;

  try {
    if (Platform.OS === "android") {
      await configureAndroidNotificationChannels();
    }
    initialized = true;
    console.log("[PowerIQ Notifications] Initialized successfully");
  } catch (error: any) {
    console.warn("[PowerIQ Notifications] Initialization error:", error?.message || error);
    initialized = false;
  }
}

/* ============================================================
   SOUND PREFERENCES
============================================================ */

export async function getSeveritySoundPreference(severity: AlertSeverity): Promise<boolean> {
  const saved = await storage.getItem(preferenceKeys[severity]);
  const effectivePreference =
    saved === null ? (DEFAULT_PREFERENCES[severity] ?? true) : saved === "true";

  console.log("[PowerIQ Sound Preference]", {
    severity,
    savedPreference: saved,
    effectivePreference,
  });

  return effectivePreference;
}

export async function setSeveritySoundPreference(
  severity: AlertSeverity,
  enabled: boolean
): Promise<void> {
  await storage.setItem(preferenceKeys[severity], String(enabled));
}

export function getDefaultSeveritySoundPreference(severity: AlertSeverity): boolean {
  return DEFAULT_PREFERENCES[severity];
}

export async function getOwnerNotificationsEnabled(): Promise<boolean> {
  const saved = await storage.getItem(CONFIG.STORAGE_KEYS.OWNER_NOTIFICATIONS_ENABLED);
  // Enabled by default (true)
  return saved === null ? true : saved === "true";
}

export async function setOwnerNotificationsEnabled(enabled: boolean): Promise<void> {
  await storage.setItem(CONFIG.STORAGE_KEYS.OWNER_NOTIFICATIONS_ENABLED, String(enabled));
}

/* ============================================================
   TEST NOTIFICATION
============================================================ */

export async function sendTestNotification(): Promise<void> {
  await initializeNotifications();
  const permission = await requestNotificationPermissions();
  if (!permission.granted) {
    console.warn("[PowerIQ Notification] Permission not granted");
    Alert.alert(
      "Notification Permission Required",
      "Notifications are disabled. Please enable notification permissions in system settings to receive audible alert popups."
    );
    return;
  }

  const channelId = Platform.OS === "android" ? getChannelIdForSeverity("critical") : undefined;
  const sound = getSoundForSeverity("critical");

  console.log("[PowerIQ Notification] Scheduling Test Critical Notification on channel:", channelId);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "PowerIQ Critical Alert (Test)",
        body: "Critical Alert Test: Notification banner and siren channel verified.",
        sound,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 400, 200, 400],
        data: { source: "test", severity: "critical" },
      },
      trigger: getImmediateNotificationTrigger(channelId),
    });
    console.log("[PowerIQ Notification] Test notification scheduled with channel:", channelId);
  } catch (error: any) {
    console.warn("[PowerIQ Notification] Test notification failed:", error?.message || error);
    Alert.alert("Notification Error", error?.message || "Failed to trigger notification.");
  }
}

/* ============================================================
   REALTIME SOCKET ALERT NOTIFICATION
============================================================ */

function getImmediateNotificationTrigger(
  channelId?: string
): Notifications.NotificationTriggerInput {
  if (Platform.OS === "android" && channelId) {
    return {
      channelId,
    };
  }

  return null;
}

export async function notifyForRealtimeAlert(
  alert: AlertItem,
  userRole?: unknown
): Promise<void> {
  const authenticated = await isUserAuthenticated();
  if (!authenticated) {
    console.log("[PowerIQ Notification] Skipped: User is logged out");
    return;
  }

  const alertId = getUniqueAlertId(alert);
  const roleEligible = userRole === undefined ? true : isNotificationEligibleRole(userRole);

  if (!roleEligible) {
    console.log("[PowerIQ Notification] Skipped for excluded role:", userRole);
    return;
  }

  const isOwner = isOwnerRole(userRole);
  if (isOwner) {
    const ownerEnabled = await getOwnerNotificationsEnabled();
    if (!ownerEnabled) {
      console.log("[PowerIQ Notification] Skipped: Owner notifications are disabled in settings");
      return;
    }
  }

  const severity = normalizeSeverity(alert.severity as string);
  // Separate sound preference from notification eligibility:
  // Sound preference controls only siren audio playback, never suppresses the notification itself
  const severitySoundEnabled = await getSeveritySoundPreference(severity);

  await initializeNotifications();
  const permission = await requestNotificationPermissions();
  if (!permission.granted) {
    console.warn("[PowerIQ Notification] Notification permission not granted");
    return;
  }

  // Log detailed critical debug information for critical alerts
  if (severity === "critical") {
    console.log("[PowerIQ Critical Debug]", {
      alertId: String(alertId),
      severity,
      userRole: String(userRole ?? "unknown"),
      roleEligible,
      severitySoundEnabled,
      isOwner,
      notificationPermission: permission.status || (permission.granted ? "granted" : "denied"),
    });
  }

  // Log notification scheduling stage
  console.log("[PowerIQ Notification Scheduling]", {
    alertId: String(alertId),
    severity,
    isOwner,
  });

  const soundConfig = resolveAlertSoundConfig(alert, userRole, undefined, severity);
  const channelId = Platform.OS === "android" ? soundConfig.channelId : undefined;
  const sound = soundConfig.isSilent
    ? undefined
    : (severitySoundEnabled || soundConfig.isHarshSiren ? soundConfig.sound : undefined);
  const vibrationPattern = soundConfig.isSilent ? undefined : soundConfig.vibrationPattern;

  console.log("[PowerIQ Notification] Dispatching system notification:", {
    alertId: String(alertId),
    severity,
    userRole: String(userRole ?? "unknown"),
    isMdAlert: isMdAlert(alert),
    channelId,
    sound,
    hasSound: Boolean(sound),
    isSilent: soundConfig.isSilent,
    reason: soundConfig.reason,
    platform: Platform.OS,
  });

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notificationTitle(severity,alert),
        body: notificationBody(alert),
        sound,
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: vibrationPattern,
        data: {
          alertId: alertId ? String(alertId) : "",
          alert,
          severity,
          source: "socket",
        },
      },
      trigger: getImmediateNotificationTrigger(channelId),
    });
    console.log("[PowerIQ Notification] Notification scheduled successfully:", {
      alertId: String(alertId),
      severity,
      channelId,
    });
  } catch (error: any) {
    console.warn("[PowerIQ Notification] Realtime notification failed:", error?.message || error);
  }
}

/* ============================================================
   ENVIRONMENT HELPERS
============================================================ */

export function isRunningInExpoGo(): boolean {
  return IS_EXPO_GO;
}

export function supportsCustomNotificationSound(): boolean {
  return !IS_EXPO_GO;
}