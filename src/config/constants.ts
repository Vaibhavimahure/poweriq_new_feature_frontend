// constants.ts — PowerIQ Mobile App Configuration & Design Tokens
// Clean Light Mode Theme for Industrial Reliability & Scanning
import { Platform } from "react-native";

// ============================================================================
// DEPLOYED SERVICE URLs — Confirmed Working Endpoints (Fallback Defaults)
// ============================================================================

export const DEPLOYED_WEB_AUTH_BASE_URL = "https://dev.esm.co.in/api/auth";
export const DEPLOYED_MOBILE_AUTH_BASE_URL = "https://api-communication.vercel.app/api/v1";
export const DEPLOYED_AUTH_BASE_URL = DEPLOYED_MOBILE_AUTH_BASE_URL;

export const DEPLOYED_ALERT_BASE_URL = "https://dev.esm.co.in/api/alert/api/v1";
export const DEPLOYED_SOCKET_HOST_URL = "https://dev.esm.co.in";
export const DEPLOYED_SOCKET_PATH = "/api/alert/socket.io";

export const DEPLOYED_TELEMETRY_BASE_URL = "https://dev.esm.co.in/api/telemetry";
export const DEPLOYED_KPI_BASE_URL = "https://dev.esm.co.in/api/telemetry/api/v1/kpi";
export const DEPLOYED_DEVICE_BASE_URL = "https://dev.esm.co.in/api/device";
export const DEPLOYED_COMPANY_BASE_URL = "https://dev.esm.co.in/api/company";
export const DEPLOYED_POLICY_BASE_URL = "https://dev.esm.co.in/api/policy";
export const DEPLOYED_BILLS_BASE_URL = "https://dev.esm.co.in/api/bills";

/** Mobile Communication & 366-Day Auth Service Base URL */
export const AUTH_BASE_URL =
  process.env.EXPO_PUBLIC_AUTH_BASE_URL?.trim() || DEPLOYED_MOBILE_AUTH_BASE_URL;

/** Web Dashboard Auth Service Base URL (Directory / Users) */
export const WEB_AUTH_BASE_URL =
  process.env.EXPO_PUBLIC_WEB_AUTH_BASE_URL?.trim() || DEPLOYED_WEB_AUTH_BASE_URL;

/** Alert REST service base URL (supports local env override for testing) */
export const ALERT_BASE_URL =
  process.env.EXPO_PUBLIC_ALERT_API_BASE_URL?.trim() || DEPLOYED_ALERT_BASE_URL;

export const TELEMETRY_BASE_URL =
  process.env.EXPO_PUBLIC_TELEMETRY_API_BASE_URL?.trim() || DEPLOYED_TELEMETRY_BASE_URL;

export const KPI_BASE_URL =
  process.env.EXPO_PUBLIC_KPI_API_BASE_URL?.trim() || DEPLOYED_KPI_BASE_URL;

export const DEVICE_BASE_URL =
  process.env.EXPO_PUBLIC_DEVICE_API_BASE_URL?.trim() || DEPLOYED_DEVICE_BASE_URL;

export const COMPANY_BASE_URL =
  process.env.EXPO_PUBLIC_COMPANY_API_BASE_URL?.trim() || DEPLOYED_COMPANY_BASE_URL;

export const POLICY_BASE_URL =
  process.env.EXPO_PUBLIC_POLICY_API_BASE_URL?.trim() || DEPLOYED_POLICY_BASE_URL;

export const BILLS_BASE_URL =
  process.env.EXPO_PUBLIC_BILLS_API_BASE_URL?.trim() || DEPLOYED_BILLS_BASE_URL;

/** Socket.IO host URL (supports local env override for testing) */
export const SOCKET_HOST_URL =
  process.env.EXPO_PUBLIC_ALERT_SOCKET_URL?.trim() || DEPLOYED_SOCKET_HOST_URL;

/** Socket.IO path on the alert service */
export const SOCKET_PATH =
  process.env.EXPO_PUBLIC_ALERT_SOCKET_PATH?.trim() || DEPLOYED_SOCKET_PATH;

// ---------------------------------------------------------------------------
// Communication Service Endpoints (Independent Service)
// ---------------------------------------------------------------------------
export const DEPLOYED_COMMUNICATION_BASE_URL = "https://api-communication.vercel.app/api/v1";
export const DEPLOYED_COMMUNICATION_SOCKET_URL = "https://api-communication.vercel.app";
export const DEPLOYED_COMMUNICATION_SOCKET_PATH = "/api/communication/socket.io";

export const COMMUNICATION_BASE_URL =
  process.env.EXPO_PUBLIC_COMMUNICATION_API_BASE_URL?.trim() ||
  DEPLOYED_COMMUNICATION_BASE_URL;

export const COMMUNICATION_SOCKET_URL =
  process.env.EXPO_PUBLIC_COMMUNICATION_SOCKET_URL?.trim() ||
  DEPLOYED_COMMUNICATION_SOCKET_URL;

export const COMMUNICATION_SOCKET_PATH =
  process.env.EXPO_PUBLIC_COMMUNICATION_SOCKET_PATH?.trim() ||
  DEPLOYED_COMMUNICATION_SOCKET_PATH;

// ---------------------------------------------------------------------------
// Dev-only local fallback URLs (preserved for development builds only)
// ---------------------------------------------------------------------------
export const LOCAL_ALERT_BASE_URL_ANDROID = __DEV__ ? "http://10.0.2.2:9013/api/v1" : "";
export const LOCAL_ALERT_BASE_URL_IOS = __DEV__ ? "http://localhost:9013/api/v1" : "";

// ============================================================================
// APPLICATION CONFIG & DESIGN TOKENS (LIGHT MODE)
// ============================================================================

export const CONFIG = {
  // Auth Service
  AUTH_BASE_URL,
  WEB_AUTH_BASE_URL,

  // Alert REST Service
  DEFAULT_ALERT_BASE_URL: ALERT_BASE_URL, // "https://dev.esm.co.in/api/alert/api/v1"

  // Communication REST Service
  COMMUNICATION_BASE_URL,
  COMMUNICATION_SOCKET_URL,
  COMMUNICATION_SOCKET_PATH,

  // Socket.IO
  SOCKET_HOST_URL,
  SOCKET_PATH,

  // Canonical Storage Keys
  STORAGE_KEYS: {
    ACCESS_TOKEN: "@live_alerts_access_token",
    REFRESH_TOKEN: "@live_alerts_refresh_token",
    USER_DATA: "@live_alerts_user_data",
    ALERT_BASE_URL: "@live_alerts_alert_base_url",
    SOUND_ENABLED: "@live_alerts_sound_enabled",
    HAPTICS_ENABLED: "@live_alerts_haptics_enabled",
    NOTIFICATION_CRITICAL: "@live_alerts_notif_crit",
    NOTIFICATION_WARNING: "@live_alerts_notif_warn",
    NOTIFICATION_INFO: "@live_alerts_notif_info",
    CRITICAL_ALERT_OVERRIDE: "@live_alerts_critical_override",
    OWNER_NOTIFICATIONS_ENABLED: "@live_alerts_owner_notif_enabled",
  },

  // Socket.IO Events
  SOCKET_EVENTS: {
    CONNECT: "connect",
    DISCONNECT: "disconnect",
    CONNECT_ERROR: "connect_error",
    RECONNECT_ATTEMPT: "reconnect_attempt",
    SOCKET_READY: "socket:ready",
    ALERT_NEW: "alert:new",
    ALERT_UPDATED: "alert:updated",
    ALERT_BULK_ACK: "alert:bulk_ack",
    ALERT_CLEAR: "alert:clear",
  },

  // Communication Socket Events
  COMMUNICATION_EVENTS: {
    DISCUSSION_NEW: "discussion:new",
    DISCUSSION_MESSAGE: "discussion:message",
    DISCUSSION_MESSAGE_UPDATED: "discussion:message_updated",
    DISCUSSION_MESSAGE_DELETED: "discussion:message_deleted",
    DISCUSSION_PARTICIPANT_ADDED: "discussion:participant_added",
    DISCUSSION_PARTICIPANT_REMOVED: "discussion:participant_removed",
    DISCUSSION_TYPING: "discussion:typing",
    DISCUSSION_STOP_TYPING: "discussion:stop_typing",
    DISCUSSION_READ: "discussion:read",
    COMMUNITY_NEW_ANSWER: "community:new_answer",
  },

  // Severity Colors (Optimized for Light Backgrounds)
  SEVERITY: {
    CRITICAL: {
      color: "#DC2626", // bold red
      colorDark: "#991B1B",
      bgLight: "#FEF2F2", // soft red tint
      border: "#FCA5A5",
      badgeBg: "#FEE2E2",
      badgeText: "#991B1B",
      label: "Critical",
    },
    WARNING: {
      color: "#D97706", // bold amber
      colorDark: "#92400E",
      bgLight: "#FFFBEB", // soft amber tint
      border: "#FCD34D",
      badgeBg: "#FEF3C7",
      badgeText: "#92400E",
      label: "Warning",
    },
    INFO: {
      color: "#2563EB", // bold blue
      colorDark: "#1E40AF",
      bgLight: "#EFF6FF", // soft blue tint
      border: "#BFDBFE",
      badgeBg: "#DBEAFE",
      badgeText: "#1E40AF",
      label: "Info",
    },
    ACKNOWLEDGED: {
      color: "#16A34A", // emerald green
      colorDark: "#166534",
      bgLight: "#F0FDF4",
      border: "#86EFAC",
      badgeBg: "#DCFCE7",
      badgeText: "#166534",
      label: "Acknowledged",
    },
  },

  // Premium Light Theme Palette
  THEME: {
    // Backgrounds
    bgLight: "#F5F7FB", // Main app background (soft grey-blue)
    bgCard: "#FFFFFF", // Card surface (pure crisp white)
    bgCardElevated: "#FFFFFF",
    bgSubtle: "#F1F5F9", // Slate subtle background for chips/inputs
    bgHover: "#E2E8F0",

    // Borders
    border: "#E2E8F0", // Standard card border
    borderSubtle: "#F1F5F9",
    borderFocus: "#3B82F6",

    // Typography
    textPrimary: "#0F172A", // Slate 900 (deep dark navy/black)
    textSecondary: "#475569", // Slate 600 (readable body text)
    textMuted: "#94A3B8", // Slate 400 (hints, timestamps)
    textInverse: "#FFFFFF",

    // PowerIQ Brand Accents
    primary: "#2563EB", // PowerIQ Royal Blue
    primaryHover: "#1D4ED8",
    primaryLight: "#EFF6FF",
    primaryGradient: ["#2563EB", "#1D4ED8"] as [string, string],

    // Functional
    success: "#16A34A",
    danger: "#DC2626",
    warning: "#D97706",
    info: "#2563EB",

    // Shadows
    shadowCard: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    shadowSm: {
      shadowColor: "#0F172A",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
  },
};
