
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { UserData, LoginRequest, AuthState } from "../types/auth";
import { authApi } from "../api/authApi";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";
import { socketService } from "../services/socketService";
import { normalizeRole, isNotificationEligibleRole, logPowerIQRoleDebug } from "../utils/role";
import {
  registerDevicePushAfterLogin,
  unregisterDevicePush,
} from "../services/pushNotificationService";
import { soundService } from "../services/soundService";
import { geofenceService } from "../services/geofenceService";
import * as Notifications from "expo-notifications";
import { setOnUnauthorizedHandler } from "../api/alertClient";
import {
  refreshAccessToken,
  addTokenRefreshedListener,
  setCentralUnauthorizedHandler,
  isUnrecoverableAuthError,
} from "../services/authSessionService";

const LAST_ACTIVE_STORAGE_KEY = "@poweriq_last_active_time";
// Inactivity timeout disabled: Keep user logged in until manual logout

function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    let json = "";
    if (typeof atob === "function") {
      json = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } else if (typeof Buffer !== "undefined") {
      json = Buffer.from(base64, "base64").toString("utf-8");
    }
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  try {
    const payload = parseJwtPayload(token);
    if (!payload || !payload.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    // Mark expired if expiration has passed or is within 30s
    return payload.exp <= nowSec + 30;
  } catch {
    return false;
  }
}

interface AuthContextType extends AuthState {
  login: (credentials: LoginRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

function extractUserRole(rawUser: any, token?: string): string {
  if (!rawUser && !token) return "Operator";

  // 1. Direct string role on rawUser
  if (typeof rawUser?.role === "string" && rawUser.role.trim()) {
    return rawUser.role.trim();
  }

  // 2. Nested object role: { name: "Production", displayName: "Production", ... }
  if (typeof rawUser?.role === "object" && rawUser.role !== null) {
    const roleName =
      rawUser.role.name ||
      rawUser.role.role ||
      rawUser.role.role_name ||
      rawUser.role.title ||
      rawUser.role.displayName ||
      rawUser.role.slug;
    if (roleName) return String(roleName).trim();
  }

  // 3. Designation or roleName field
  if (typeof rawUser?.designation === "string" && rawUser.designation.trim()) {
    return rawUser.designation.trim();
  }
  if (typeof rawUser?.roleName === "string" && rawUser.roleName.trim()) {
    return rawUser.roleName.trim();
  }
  if (typeof rawUser?.role_name === "string" && rawUser.role_name.trim()) {
    return rawUser.role_name.trim();
  }

  // 4. Array of roles
  if (Array.isArray(rawUser?.roles) && rawUser.roles.length > 0) {
    const first = rawUser.roles[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (typeof first === "object" && first !== null) {
      const n = first.name || first.role || first.title;
      if (n) return String(n).trim();
    }
  }

  // 5. Inspect JWT claims if available
  if (token) {
    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        let json = "";
        try {
          // Standard web base64 decode if available
          json = decodeURIComponent(
            atob(base64)
              .split("")
              .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
              .join("")
          );
        } catch {
          // Ignore decode error
        }
        if (json) {
          const payload = JSON.parse(json);
          const jwtRole =
            payload?.role?.name ||
            payload?.role ||
            payload?.roleName ||
            payload?.designation ||
            payload?.user?.role;
          if (typeof jwtRole === "string" && jwtRole.trim()) {
            return jwtRole.trim();
          }
        }
      }
    } catch {
      // Ignore JWT decode errors
    }
  }

  return "Operator";
}

function extractUserName(rawUser: any, token?: string, email?: string): string {
  if (typeof rawUser?.name === "string" && rawUser.name.trim()) {
    return rawUser.name.trim();
  }
  if (typeof rawUser?.fullName === "string" && rawUser.fullName.trim()) {
    return rawUser.fullName.trim();
  }
  if (typeof rawUser?.full_name === "string" && rawUser.full_name.trim()) {
    return rawUser.full_name.trim();
  }
  if (typeof rawUser?.username === "string" && rawUser.username.trim()) {
    return rawUser.username.trim();
  }
  if (typeof rawUser?.userName === "string" && rawUser.userName.trim()) {
    return rawUser.userName.trim();
  }
  if (typeof rawUser?.displayName === "string" && rawUser.displayName.trim()) {
    return rawUser.displayName.trim();
  }
  if (typeof rawUser?.firstName === "string" && rawUser.firstName.trim()) {
    const last = typeof rawUser?.lastName === "string" ? rawUser.lastName.trim() : "";
    return `${rawUser.firstName.trim()} ${last}`.trim();
  }
  if (typeof rawUser?.first_name === "string" && rawUser.first_name.trim()) {
    const last = typeof rawUser?.last_name === "string" ? rawUser.last_name.trim() : "";
    return `${rawUser.first_name.trim()} ${last}`.trim();
  }

  // Inspect JWT token claims
  if (token) {
    try {
      const payload = parseJwtPayload(token);
      if (payload) {
        const jwtName =
          payload?.name ||
          payload?.userName ||
          payload?.username ||
          payload?.fullName ||
          payload?.user?.name;
        if (typeof jwtName === "string" && jwtName.trim()) {
          return jwtName.trim();
        }
      }
    } catch {
      // Ignore
    }
  }

  // Derive readable name from email (e.g. "priyanshu" -> "Priyanshu", "sunil.das" -> "Sunil Das")
  const emailCandidate = email || rawUser?.email;
  if (typeof emailCandidate === "string" && emailCandidate.includes("@")) {
    const part = emailCandidate.split("@")[0].trim();
    if (part) {
      return part
        .replace(/[._-]/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return "User";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    accessToken: null,
    refreshToken: null,
    error: null,
  });

  // -------------------------------------------------------------------------
  // Bootstrap: restore session from secure storage on app start
  // -------------------------------------------------------------------------
  useEffect(() => {
    const bootstrapAuth = async () => {
      try {
        const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        const refreshToken = await storage.getItem(
          CONFIG.STORAGE_KEYS.REFRESH_TOKEN
        );
        const userData = await storage.getObject<UserData>(
          CONFIG.STORAGE_KEYS.USER_DATA
        );

        let activeToken = token;
        let activeRefreshToken = refreshToken;
        let activeUserData = userData;

        if ((activeToken || activeRefreshToken) && activeUserData) {
          // 1. If access token is expired or missing, attempt silent refresh
          if (!activeToken || isTokenExpired(activeToken)) {
            console.log("[AuthContext] Access token expired or missing on launch. Attempting silent refresh...");
            if (activeRefreshToken) {
              try {
                activeToken = await refreshAccessToken();
                const rotatedRefreshToken = await storage.getItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
                if (rotatedRefreshToken) activeRefreshToken = rotatedRefreshToken;
                const updatedUser = await storage.getObject<UserData>(CONFIG.STORAGE_KEYS.USER_DATA);
                if (updatedUser) activeUserData = updatedUser;
                console.log("[AuthContext] Silent refresh succeeded on app launch.");
              } catch (refreshErr: any) {
                if (isUnrecoverableAuthError(refreshErr)) {
                  console.warn("[AuthContext] Refresh token permanently rejected on startup. Logging out.");
                  await logout();
                  return;
                }
                // Transient network error / offline: retain session with cached credentials
                console.warn("[AuthContext] Silent refresh failed (offline/network). Retaining session:", refreshErr?.message);
              }
            } else {
              console.warn("[AuthContext] Access token expired and no refresh token available. Logging out.");
              await logout();
              return;
            }
          }

          // Inactivity timeout disabled: Keep user logged in until manual logout
          const lastActiveStr = await storage.getItem(LAST_ACTIVE_STORAGE_KEY);

          // Update active timestamp
          await storage.setItem(LAST_ACTIVE_STORAGE_KEY, String(Date.now()));

          // Ensure name is dynamically restored/extracted if missing or generic
          if (!activeUserData.name || activeUserData.name === "Operator" || activeUserData.name === "User") {
            const restoredName = extractUserName(activeUserData, activeToken || "", activeUserData.email);
            if (restoredName && restoredName !== "User") {
              activeUserData.name = restoredName;
              storage.setObject(CONFIG.STORAGE_KEYS.USER_DATA, activeUserData).catch(() => {});
            }
          }

          // Restore companyId if missing in stored userData
          if (!activeUserData.companyId && activeToken) {
            const payload = parseJwtPayload(activeToken);
            const cid =
              payload?.companyId ||
              payload?.company_id ||
              (typeof payload?.company === "string" ? payload.company : payload?.company?._id || payload?.company?.id);
            if (cid) {
              activeUserData.companyId = String(cid);
              activeUserData.company = String(cid);
              storage.setObject(CONFIG.STORAGE_KEYS.USER_DATA, activeUserData).catch(() => {});
            }
          }

          logPowerIQRoleDebug(activeUserData.name, activeUserData.role);

          // Reset sound service logout guard before reconnecting socket or receiving alerts
          soundService.resetLogoutState();

          setAuthState({
            isAuthenticated: true,
            isLoading: false,
            user: activeUserData,
            accessToken: activeToken,
            refreshToken: activeRefreshToken ?? null,
            error: null,
          });
          // Connect socket on boot (fire-and-forget)
          if (activeToken) {
            socketService.connect(activeToken).catch((e) =>
              console.warn("[AuthContext] Socket reconnect on boot:", e?.message)
            );
            // Register physical device push token after session restore
            registerDevicePushAfterLogin(activeUserData, activeToken).catch((e) =>
              console.warn("[AuthContext] Push register on boot:", e?.message)
            );
          }
          // Start 500m geofence monitoring for applicable users
          geofenceService
            .startTracking(activeUserData, activeUserData.companyId || undefined, activeUserData.plantId || undefined)
            .catch((e) => console.warn("[AuthContext] Geofence tracking start on boot:", e?.message));
        } else {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch (err) {
        console.warn("[AuthContext] Bootstrap failed:", err);
        setAuthState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    bootstrapAuth();
  }, []);

  // -------------------------------------------------------------------------
  // Login
  // -------------------------------------------------------------------------
  const login = async (credentials: LoginRequest): Promise<boolean> => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    const normalizedEmail = (credentials.email || "").trim().toLowerCase();
    const finalLoginUrl = `${CONFIG.AUTH_BASE_URL}/api/v1/auth/login`;

    // Step 1: Safe request logging (NO passwords logged)
    console.log("MOBILE LOGIN REQUEST", {
      url: finalLoginUrl,
      method: "POST",
      email: normalizedEmail,
      passwordProvided: Boolean(credentials.password),
      passwordLength: credentials.password?.length || 0,
    });

    try {
      const normalizedPayload: LoginRequest = {
        email: normalizedEmail,
        password: credentials.password, // NEVER trim or lowercase password
      };

      const response: any = await authApi.login(normalizedPayload);

      // Step 2: Safe response logging
      console.log("MOBILE LOGIN RESPONSE", {
        status: 200,
        keys: response && typeof response === "object" ? Object.keys(response) : [],
        hasToken: Boolean(
          response?.token ||
          response?.accessToken ||
          response?.data?.token ||
          response?.data?.accessToken
        ),
      });

      // Extract token universally across response shapes
      const accessToken: string =
        response?.accessToken ||
        response?.token ||
        response?.data?.accessToken ||
        response?.data?.token ||
        "";

      const refreshToken: string | null =
        response?.refreshToken ||
        response?.data?.refreshToken ||
        null;

      // Extract user metadata universally, with safe role extraction
      const rawUser =
        response?.userData ||
        response?.user ||
        response?.data?.userData ||
        response?.data?.user;

      const userRole = extractUserRole(rawUser, accessToken);
      const userName = extractUserName(rawUser, accessToken, normalizedEmail);

      const jwtPayload = parseJwtPayload(accessToken);
      const userCompanyId =
        rawUser?.companyId ||
        rawUser?.company_id ||
        (typeof rawUser?.company === "string" ? rawUser.company : rawUser?.company?._id || rawUser?.company?.id) ||
        jwtPayload?.companyId ||
        jwtPayload?.company_id ||
        (typeof jwtPayload?.company === "string" ? jwtPayload.company : jwtPayload?.company?._id || jwtPayload?.company?.id) ||
        null;

      const userData: UserData = {
        id: rawUser?.id || rawUser?._id || "user",
        name: userName,
        email: rawUser?.email || normalizedEmail,
        role: userRole,
        image: rawUser?.image || null,
        companyId: userCompanyId ? String(userCompanyId) : null,
        company: userCompanyId ? String(userCompanyId) : null,
      };

      if (!accessToken) {
        throw new Error("Authentication token was not returned by server.");
      }

      // Persist to storage safely (null-guarded)
      await storage.setItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN, accessToken);

      if (refreshToken != null && refreshToken !== "") {
        await storage.setItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      } else {
        await storage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      }

      await storage.setObject(CONFIG.STORAGE_KEYS.USER_DATA, userData);
      await storage.setItem(LAST_ACTIVE_STORAGE_KEY, String(Date.now()));

      logPowerIQRoleDebug(userData.name, userData.role);

      // Reset sound service logout guard before reconnecting socket or receiving alerts
      soundService.resetLogoutState();

      // Update auth state
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: userData,
        accessToken,
        refreshToken: refreshToken ?? null,
        error: null,
      });

      // Connect Socket.IO (fire-and-forget)
      socketService.connect(accessToken).catch((e) =>
        console.warn("[AuthContext] Socket connect:", e?.message)
      );

      // Register physical device push token after login
      registerDevicePushAfterLogin(userData, accessToken).catch((e) =>
        console.warn("[AuthContext] Push register on login:", e?.message)
      );

      // Start 500m geofence monitoring for applicable users
      geofenceService
        .startTracking(userData, userData.companyId || undefined, userData.plantId || undefined)
        .catch((e) => console.warn("[AuthContext] Geofence tracking start on login:", e?.message));

      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;

      // Step 2 Failure: Safe failure logging
      console.log("MOBILE LOGIN FAILURE", {
        status: status || "Network/Timeout",
        backendData: data,
        message: err?.message,
        code: err?.code,
        url: err?.config?.url,
        baseURL: err?.config?.baseURL,
      });

      let message: string;

      if (status === 400 || status === 401) {
        // Backend specific message (e.g. "Account does not exist or has been removed." or "Invalid email or password")
        message =
          data?.error ||
          data?.message ||
          (Array.isArray(data?.errors) && data?.errors[0]?.msg) ||
          "Incorrect email or password.";
      } else if (status === 403) {
        message =
          data?.error ||
          data?.message ||
          "Account access restricted. Please contact your system administrator.";
      } else if (status === 429) {
        message = "Too many login attempts. Please wait a moment and try again.";
      } else if (status >= 500) {
        message = "Authentication server error. Please try again shortly.";
      } else if (err?.code === "ECONNABORTED") {
        message = "Login request timed out. Check your internet connection.";
      } else if (!err?.response) {
        message = "Unable to connect to authentication service. Check your connection.";
      } else {
        message = err?.message || "Login failed. Please check your credentials.";
      }

      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: message,
      }));

      return false;
    }
  };

  // Keep ref to accessToken so logout has a stable identity
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = authState.accessToken;

  // -------------------------------------------------------------------------
  // Logout — Complete Session & State Wipe
  // -------------------------------------------------------------------------
  const logout = useCallback(async () => {
    // 1. Capture token before clearing storage for backend unregister
    const token =
      accessTokenRef.current ||
      (await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN));

    // 2. Immediately disconnect real-time socket (stops all incoming socket alerts)
    try {
      socketService.disconnect();
    } catch (e) {
      console.warn("[AuthContext] Socket disconnect error:", e);
    }

    // 3. Immediately stop and unload all audio & sirens
    try {
      await soundService.cleanup();
    } catch (e) {
      console.warn("[AuthContext] Stop audio on logout error:", e);
    }

    // 4. Stop background location tracking on logout and clear cached coordinates
    try {
      await geofenceService.stopTracking();
    } catch (e) {
      console.warn("[AuthContext] Stop geofence tracking on logout error:", e);
    }

    // 5. Immediately dismiss all OS notification banners and cancel scheduled alerts
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (e) {
      console.warn("[AuthContext] Dismiss notifications on logout error:", e);
    }

    // 5. Unregister device push on backends while accessToken is still valid
    if (token) {
      try {
        await Promise.race([
          unregisterDevicePush(token),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch (e: any) {
        console.log("[AuthContext] Device push unregister error:", e?.message);
      }
    }

    // 6. Immediately clear all user credentials & active timestamps from storage
    try {
      await storage.removeItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
      await storage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
      await storage.removeItem(CONFIG.STORAGE_KEYS.USER_DATA);
      await storage.removeItem(LAST_ACTIVE_STORAGE_KEY);
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.removeItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
          window.localStorage.removeItem(CONFIG.STORAGE_KEYS.REFRESH_TOKEN);
          window.localStorage.removeItem(CONFIG.STORAGE_KEYS.USER_DATA);
          window.localStorage.removeItem(LAST_ACTIVE_STORAGE_KEY);
        } catch {}
      }
    } catch (e) {
      console.warn("[AuthContext] Clear storage on logout error:", e);
    }

    // 7. Immediately reset auth state to unauthenticated
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      refreshToken: null,
      error: null,
    });

    console.log("[AuthContext] Logged out successfully. Local state cleared.");
  }, []);

  // Register unauthorized callback from API client (triggers clean logout on permanent 401/403)
  useEffect(() => {
    const handler = () => {
      console.warn("[AuthContext] Auto-logging out due to unrecoverable authorization invalidation");
      logout();
    };
    setOnUnauthorizedHandler(handler);
    setCentralUnauthorizedHandler(handler);
    return () => {
      setOnUnauthorizedHandler(null);
      setCentralUnauthorizedHandler(null);
    };
  }, [logout]);

  // Listen to background token rotation and keep React state synchronized
  useEffect(() => {
    const unsubscribe = addTokenRefreshedListener((newToken, newUserData) => {
      setAuthState((prev) => {
        if (!prev.isAuthenticated) return prev;
        return {
          ...prev,
          accessToken: newToken,
          user: newUserData ? { ...prev.user, ...newUserData } : prev.user,
        };
      });
    });
    return () => unsubscribe();
  }, []);

  // Monitor AppState (foreground/background) to check for expiration when user resumes app
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        if (token && isTokenExpired(token)) {
          console.log("[AuthContext] App resumed with expired access token. Attempting silent refresh...");
          try {
            const newToken = await refreshAccessToken();
            setAuthState((prev) => (prev.isAuthenticated ? { ...prev, accessToken: newToken } : prev));
          } catch (refreshErr: any) {
            if (isUnrecoverableAuthError(refreshErr)) {
              console.warn("[AuthContext] App resumed: Token revoked or expired → auto-logging out");
              await logout();
              return;
            }
            console.warn("[AuthContext] App resumed: Token refresh failed due to network/offline. Retaining session.");
          }
        }

        // Update active timestamp (inactivity auto-logout disabled)
        await storage.setItem(LAST_ACTIVE_STORAGE_KEY, String(Date.now()));
      } else if (nextAppState === "background") {
        await storage.setItem(LAST_ACTIVE_STORAGE_KEY, String(Date.now()));
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [logout]);

  const clearError = () => {
    setAuthState((prev) => ({ ...prev, error: null }));
  };

  return (
    <AuthContext.Provider
      value={{ ...authState, login, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
