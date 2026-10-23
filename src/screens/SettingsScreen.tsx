/**
 * SettingsScreen.tsx — PowerIQ Settings & Notification Configuration
 * ---------------------------------------------------------------------------
 * Displays the Notification Sound configuration panel:
 *  - Sound file identity (poweriq_alert.wav)
 *  - Play Test Sound button (same sound path as real alerts)
 *  - Per-severity sound status (Critical / Warning / Info)
 *  - Android channel ID & sound resource info
 *  - iOS resource bundle info
 *  - Master mute toggle
 * ---------------------------------------------------------------------------
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
  AppState,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ChevronLeft,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Play,
  Check,
  AlertTriangle,
  Info,
  Zap,
  Smartphone,
  Apple,
  ShieldAlert,
  ExternalLink,
  MapPin,
  Crosshair,
} from "lucide-react-native";
import { geofenceService, isValidCoordinates } from "../services/geofenceService";
import { GeofenceStateSnapshot, GeofenceCoordinates } from "../types/geofence";
import { CONFIG } from "../config/constants";
import { RootStackParamList } from "../types/navigation";
import { AppFooter } from "../components/common/AppFooter";
import { AppHeader } from "../components/common/AppHeader";
import { soundService, NOTIFICATION_CHANNEL, SEVERITY_SOUND_CONFIG } from "../services/soundService";
import { useAudio } from "../context/AudioContext";
import {
  getDefaultSeveritySoundPreference,
  getSeveritySoundPreference,
  sendTestNotification,
  setSeveritySoundPreference,
  getOwnerNotificationsEnabled,
  setOwnerNotificationsEnabled,
  CHANNEL_CRITICAL,
} from "../config/notifications";
import { dndService } from "../services/dndService";
import { storage } from "../services/storage";
import { useAuth } from "../context/AuthContext";
import { isNotificationEligibleRole, isOwnerRole, normalizeRole, getRoleLabel } from "../utils/role";
import {
  sendRemoteTestPush,
  registerDevicePushAfterLogin,
  unregisterDevicePush,
} from "../services/pushNotificationService";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "Settings">;
}

// ---------------------------------------------------------------------------
// Row / Section helpers
// ---------------------------------------------------------------------------
const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

const InfoRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, mono && styles.infoValueMono]}>{value}</Text>
  </View>
);

const Divider = () => <View style={styles.divider} />;

// ---------------------------------------------------------------------------
// Severity badge row
// ---------------------------------------------------------------------------
const SeverityRow: React.FC<{
  severity: "critical" | "warning" | "info";
  soundEnabled: boolean;
  preferenceEnabled: boolean;
  onToggle: () => void;
}> = ({ severity, soundEnabled, preferenceEnabled, onToggle }) => {
  const config = SEVERITY_SOUND_CONFIG[severity];

  const icon =
    severity === "critical" ? (
      <Zap size={16} color={CONFIG.SEVERITY.CRITICAL.color} />
    ) : severity === "warning" ? (
      <AlertTriangle size={16} color={CONFIG.SEVERITY.WARNING.color} />
    ) : (
      <Info size={16} color={CONFIG.SEVERITY.INFO.color} />
    );

  const accentColor =
    severity === "critical"
      ? CONFIG.SEVERITY.CRITICAL.color
      : severity === "warning"
      ? CONFIG.SEVERITY.WARNING.color
      : CONFIG.SEVERITY.INFO.color;

  const on = soundEnabled && preferenceEnabled && config.usesSound;

  return (
    <View style={[styles.severityRow, { borderLeftColor: accentColor }]}>
      <View style={styles.severityRowLeft}>
        {icon}
        <Text style={styles.severityRowLabel}>{config.label}</Text>
      </View>
      <Switch
        value={preferenceEnabled}
        onValueChange={onToggle}
        trackColor={{ false: CONFIG.THEME.border, true: CONFIG.THEME.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
};

// ---------------------------------------------------------------------------
// Official Plant Location Card
// ---------------------------------------------------------------------------
const PlantLocationCard: React.FC<{
  geofenceSnap: GeofenceStateSnapshot;
  isAdmin: boolean;
  plantNameFallback?: string;
  isCapturingLocation: boolean;
  isSavingPlantLocation: boolean;
  capturedCoords: GeofenceCoordinates | null;
  onCaptureLocation: () => void;
  onSavePlantLocation: () => void;
}> = ({
  geofenceSnap,
  isAdmin,
  plantNameFallback,
  isCapturingLocation,
  isSavingPlantLocation,
  capturedCoords,
  onCaptureLocation,
  onSavePlantLocation,
}) => {
  const plantName =
    geofenceSnap.plantLocation?.name || plantNameFallback || "Main Manufacturing Plant";

  return (
    <>
      <SectionHeader title="OFFICIAL PLANT LOCATION" />
      <View style={styles.card}>
        <View style={styles.plantHeaderRow}>
          <View style={styles.plantIconWrap}>
            <MapPin size={22} color={CONFIG.THEME.primary} />
          </View>
          <View style={styles.plantHeaderTextWrap}>
            <Text style={styles.plantNameText}>{plantName}</Text>
            <Text style={styles.plantSubText}>Geofence Radius: 500m</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              geofenceSnap.status === "inside"
                ? styles.statusBadgeInside
                : geofenceSnap.status === "outside"
                ? styles.statusBadgeOutside
                : styles.statusBadgeUnknown,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                geofenceSnap.status === "inside"
                  ? styles.statusBadgeTextInside
                  : geofenceSnap.status === "outside"
                  ? styles.statusBadgeTextOutside
                  : styles.statusBadgeTextUnknown,
              ]}
            >
              {geofenceSnap.status === "inside"
                ? "Inside 500m"
                : geofenceSnap.status === "outside"
                ? "Outside 500m"
                : "Unknown"}
            </Text>
          </View>
        </View>

        <Divider />

        <InfoRow
          label="Official Coordinates"
          value={
            geofenceSnap.plantLocation &&
            isValidCoordinates(
              geofenceSnap.plantLocation.latitude,
              geofenceSnap.plantLocation.longitude
            )
              ? `${geofenceSnap.plantLocation.latitude.toFixed(6)}, ${geofenceSnap.plantLocation.longitude.toFixed(6)}`
              : "Not configured on backend"
          }
          mono
        />
        <Divider />
        <InfoRow label="Plant Name" value={plantName} />
        <Divider />
        <InfoRow label="Geofence Radius" value="500m" />
        <Divider />
        <InfoRow
          label="Current Distance"
          value={
            geofenceSnap.distanceMeters !== null
              ? geofenceSnap.distanceMeters > 1000
                ? `${(geofenceSnap.distanceMeters / 1000).toFixed(2)} km`
                : `${Math.round(geofenceSnap.distanceMeters)} m`
              : "—"
          }
        />
        <Divider />
        <InfoRow
          label="GPS Accuracy"
          value={
            geofenceSnap.currentCoords?.accuracy !== undefined &&
            geofenceSnap.currentCoords?.accuracy !== null
              ? `±${geofenceSnap.currentCoords.accuracy.toFixed(1)}m`
              : "—"
          }
          mono
        />
        <Divider />
        <InfoRow
          label="Last Location Fix"
          value={
            geofenceSnap.lastUpdated
              ? new Date(geofenceSnap.lastUpdated).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "No update yet"
          }
        />

        {isAdmin && (
          <>
            <Divider />
            <View style={styles.adminActionContainer}>
              <Text style={styles.adminSectionTitle}>ADMINISTRATOR GEOFENCE CONTROLS</Text>
              <Text style={styles.adminHelpText}>
                Stand at the plant centroid or gate, capture device GPS, and save as official plant coordinates for attendance and alert siren controls.
              </Text>

              <TouchableOpacity
                style={styles.adminActionBtn}
                onPress={onCaptureLocation}
                disabled={isCapturingLocation}
                activeOpacity={0.8}
              >
                {isCapturingLocation ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Crosshair size={18} color="#FFFFFF" />
                )}
                <Text style={styles.adminActionBtnText}>
                  {isCapturingLocation ? "Acquiring GPS Fix…" : "Capture Current Location"}
                </Text>
              </TouchableOpacity>

              {capturedCoords && (
                <View style={styles.capturedCoordsBox}>
                  <Text style={styles.capturedCoordsTitle}>Captured Position:</Text>
                  <Text style={styles.capturedCoordsText}>
                    Lat: {capturedCoords.latitude.toFixed(6)}, Lng: {capturedCoords.longitude.toFixed(6)} (±{capturedCoords.accuracy ? capturedCoords.accuracy.toFixed(1) : "?"}m)
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.adminSaveBtn,
                  (!capturedCoords && !geofenceSnap.currentCoords) && styles.playBtnDisabled,
                ]}
                onPress={onSavePlantLocation}
                disabled={isSavingPlantLocation || (!capturedCoords && !geofenceSnap.currentCoords)}
                activeOpacity={0.8}
              >
                {isSavingPlantLocation ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Check size={18} color="#FFFFFF" />
                )}
                <Text style={styles.adminSaveBtnText}>
                  {isSavingPlantLocation
                    ? "Saving to Backend…"
                    : geofenceSnap.plantLocation
                    ? "Update Official Plant Location"
                    : "Save Official Plant Location"}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </>
  );
};

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export const SettingsScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { soundEnabled, hapticsEnabled, toggleSound, toggleHaptics } = useAudio();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playConfirmed, setPlayConfirmed] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [isTestingRemoteCritical, setIsTestingRemoteCritical] = useState(false);
  const [isTestingRemoteWarning, setIsTestingRemoteWarning] = useState(false);
  const [preferences, setPreferences] = useState({
    critical: getDefaultSeveritySoundPreference("critical"),
    warning: getDefaultSeveritySoundPreference("warning"),
    info: getDefaultSeveritySoundPreference("info"),
  });
  const [criticalOverride, setCriticalOverride] = useState(false);
  const [dndAccessGranted, setDndAccessGranted] = useState(false);
  const [isChannelBypassing, setIsChannelBypassing] = useState(false);

  React.useEffect(() => {
    Promise.all([
      getSeveritySoundPreference("critical"),
      getSeveritySoundPreference("warning"),
      getSeveritySoundPreference("info"),
    ]).then(([critical, warning, info]) => setPreferences({ critical, warning, info }));
  }, []);

  const checkDndStatus = React.useCallback(async () => {
    if (Platform.OS !== "android") return;
    try {
      const [granted, savedOverride, channelBypassing] = await Promise.all([
        dndService.isDndAccessGranted(),
        dndService.isCriticalOverrideEnabled(),
        dndService.isCriticalChannelBypassingDnd(CHANNEL_CRITICAL.id),
      ]);
      setDndAccessGranted(granted);
      setIsChannelBypassing(channelBypassing);

      if (granted && savedOverride) {
        setCriticalOverride(true);
        await dndService.setCriticalOverrideEnabled(true);
      } else if (!granted && savedOverride) {
        setCriticalOverride(false);
        await dndService.setCriticalOverrideEnabled(false);
      } else {
        setCriticalOverride(savedOverride);
      }
    } catch (e) {
      console.warn("[Settings] checkDndStatus error:", e);
    }
  }, []);

  React.useEffect(() => {
    checkDndStatus();

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        checkDndStatus();
      }
    });

    return () => sub.remove();
  }, [checkDndStatus]);

  const handleToggleCriticalOverride = async (value: boolean) => {
    if (value) {
      const granted = await dndService.isDndAccessGranted();
      if (!granted) {
        Alert.alert(
          "Do Not Disturb Access Required",
          "To allow Critical plant alarms to sound when your phone is in Do Not Disturb mode, Android requires Notification Policy Access.\n\nWarning alerts will always respect normal Silent/DND mode.\n\nWould you like to open Android Settings now to grant access?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: async () => {
                await storage.setItem(CONFIG.STORAGE_KEYS.CRITICAL_ALERT_OVERRIDE, "true");
                await dndService.openDndSettings();
              },
            },
          ]
        );
        return;
      }
      setCriticalOverride(true);
      await dndService.setCriticalOverrideEnabled(true);
      await checkDndStatus();
    } else {
      setCriticalOverride(false);
      await dndService.setCriticalOverrideEnabled(false);
      await checkDndStatus();
    }
  };

  const { user, accessToken } = useAuth();
  const rawRole = user?.role || (user as any)?.roleName || (user as any)?.role_name || "";
  const canonicalRole = normalizeRole(rawRole);
  const displayRole = getRoleLabel(canonicalRole);
  const isEligible = isNotificationEligibleRole(canonicalRole);
  const isOwner = isOwnerRole(canonicalRole);
  const isAdmin = ["admin", "super admin", "owner", "management", "plant manager"].includes(canonicalRole);

  const [geofenceSnap, setGeofenceSnap] = useState<GeofenceStateSnapshot>(() =>
    geofenceService.getSnapshot()
  );
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [isSavingPlantLocation, setIsSavingPlantLocation] = useState(false);
  const [capturedCoords, setCapturedCoords] = useState<GeofenceCoordinates | null>(null);

  React.useEffect(() => {
    const unsub = geofenceService.subscribe((snap) => {
      setGeofenceSnap(snap);
    });
    const compId = user?.companyId || (user?.company as string);
    if (!geofenceSnap.plantLocation && compId) {
      geofenceService.fetchOfficialPlantCoordinates(compId);
    }
    return unsub;
  }, [user?.companyId, user?.company]);

  const handleCaptureLocation = async () => {
    if (isCapturingLocation) return;
    setIsCapturingLocation(true);
    try {
      const coords = await geofenceService.captureCurrentLocation();
      setCapturedCoords(coords);
      Alert.alert(
        "Location Captured",
        `Current GPS position acquired:\n\nLatitude: ${coords.latitude.toFixed(6)}\nLongitude: ${coords.longitude.toFixed(6)}\nAccuracy: ±${coords.accuracy ? coords.accuracy.toFixed(1) : "?"}m\n\nTap "Save Official Plant Location" to save as official plant coordinates.`
      );
    } catch (err: any) {
      Alert.alert("Capture Failed", err?.message || "Could not acquire current GPS fix.");
    } finally {
      setIsCapturingLocation(false);
    }
  };

  const handleSavePlantLocation = async () => {
    const targetCoords = capturedCoords || geofenceSnap.currentCoords;
    if (!targetCoords) {
      Alert.alert("No Location", "Please tap 'Capture Current Location' first.");
      return;
    }
    setIsSavingPlantLocation(true);
    try {
      const plantName = geofenceSnap.plantLocation?.name || (user?.plant as string) || "Main Manufacturing Plant";
      await geofenceService.saveOfficialPlantLocation({
        latitude: targetCoords.latitude,
        longitude: targetCoords.longitude,
        radiusMeters: 500,
        accuracy: targetCoords.accuracy,
        name: plantName,
      });
      setCapturedCoords(null);
      Alert.alert("Success", "Official plant location saved successfully with 500m geofence radius.");
    } catch (err: any) {
      Alert.alert("Save Failed", err?.message || "Failed to save official plant location.");
    } finally {
      setIsSavingPlantLocation(false);
    }
  };

  const [ownerNotificationsEnabled, setOwnerNotificationsEnabledState] = useState<boolean>(true);

  React.useEffect(() => {
    getOwnerNotificationsEnabled().then(setOwnerNotificationsEnabledState);
  }, []);

  const handleToggleOwnerNotifications = async (value: boolean) => {
    setOwnerNotificationsEnabledState(value);
    await setOwnerNotificationsEnabled(value);
    if (value !== soundEnabled) {
      toggleSound();
    }
    try {
      if (value) {
        if (user && accessToken) {
          await registerDevicePushAfterLogin(user, accessToken);
        }
      } else {
        await unregisterDevicePush(accessToken);
      }
    } catch (e) {
      console.warn("[Settings] Toggle owner push registration error:", e);
    }
  };

  const handlePlayTestSound = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    setPlayConfirmed(false);
    try {
      // Play exactly the same sound path used for real incoming alerts
      await soundService.playAlertSound("critical", isOwner);
      setPlayConfirmed(true);
      setTimeout(() => setPlayConfirmed(false), 2000);
    } catch (e) {
      console.warn("[Settings] Test sound error:", e);
    } finally {
      setIsPlaying(false);
    }
  };

  const toggleSeverity = async (severity: "critical" | "warning" | "info") => {
    const enabled = !preferences[severity];
    setPreferences((current) => ({ ...current, [severity]: enabled }));
    await setSeveritySoundPreference(severity, enabled);
  };

  const handleSendRemoteCriticalPush = async () => {
    if (isTestingRemoteCritical) return;
    if (!accessToken) {
      Alert.alert("Authentication Required", "Please log in again to test remote push.");
      return;
    }
    setIsTestingRemoteCritical(true);
    try {
      await sendRemoteTestPush("critical", accessToken);
      Alert.alert(
        "Remote Critical Push Dispatched",
        "The local backend has dispatched a Critical Expo Push notification via FCM.\n\nNow background, lock, or swipe away (kill) the app to test system notification delivery and the poweriq_critical.wav siren!"
      );
    } catch (error: any) {
      console.warn("[Settings] Remote Critical Push error:", error?.message);
      Alert.alert(
        "Remote Push Failed",
        error?.response?.data?.message ||
          error?.message ||
          "Could not reach local backend push test endpoint."
      );
    } finally {
      setIsTestingRemoteCritical(false);
    }
  };

  const handleSendRemoteWarningPush = async () => {
    if (isTestingRemoteWarning) return;
    if (!accessToken) {
      Alert.alert("Authentication Required", "Please log in again to test remote push.");
      return;
    }
    setIsTestingRemoteWarning(true);
    try {
      await sendRemoteTestPush("warning", accessToken);
      Alert.alert(
        "Remote Warning Push Dispatched",
        "The local backend has dispatched a Warning Expo Push notification via FCM.\n\nVerify that poweriq_alert.wav plays and the poweriq_warning_v4 channel is used."
      );
    } catch (error: any) {
      console.warn("[Settings] Remote Warning Push error:", error?.message);
      Alert.alert(
        "Remote Push Failed",
        error?.response?.data?.message ||
          error?.message ||
          "Could not reach local backend push test endpoint."
      );
    } finally {
      setIsTestingRemoteWarning(false);
    }
  };

  const handleSendTestNotification = async () => {
    if (isSendingNotification) return;
    setIsSendingNotification(true);
    try {
      await soundService.playAlertSound("critical");
      await sendTestNotification();
    } catch (error) {
      console.warn("[Settings] Test notification error:", error);
    } finally {
      setIsSendingNotification(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* Header */}
      <AppHeader title="Settings" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {isOwner ? (
          <>
            {/* ── ACCOUNT ─────────────────────────────────────────── */}
            <SectionHeader title="ACCOUNT" />
            <View style={styles.card}>
              <InfoRow label="User" value={user?.name || user?.email || "Logged In"} />
              <Divider />
              <InfoRow label="Role" value={displayRole} />
            </View>

            <PlantLocationCard
              geofenceSnap={geofenceSnap}
              isAdmin={isAdmin}
              plantNameFallback={user?.plant || undefined}
              isCapturingLocation={isCapturingLocation}
              isSavingPlantLocation={isSavingPlantLocation}
              capturedCoords={capturedCoords}
              onCaptureLocation={handleCaptureLocation}
              onSavePlantLocation={handleSavePlantLocation}
            />

            {/* ── NOTIFICATIONS ───────────────────────────────────── */}
            <SectionHeader title="NOTIFICATIONS" />
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleRowLeft}>
                  {ownerNotificationsEnabled ? (
                    <Volume2 size={20} color={CONFIG.THEME.primary} />
                  ) : (
                    <VolumeX size={20} color={CONFIG.THEME.textMuted} />
                  )}
                  <View style={styles.toggleRowText}>
                    <Text style={styles.toggleRowTitle}>Notification Sounds</Text>
                    <Text style={styles.toggleRowSub}>
                      {ownerNotificationsEnabled
                        ? "On — alert chime plays for all alerts"
                        : "Off — silent, no alert sounds"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={ownerNotificationsEnabled}
                  onValueChange={handleToggleOwnerNotifications}
                  trackColor={{ false: CONFIG.THEME.border, true: CONFIG.THEME.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <Divider />

              <View style={styles.toggleRow}>
                <View style={styles.toggleRowLeft}>
                  <Smartphone size={20} color={CONFIG.THEME.textSecondary} />
                  <View style={styles.toggleRowText}>
                    <Text style={styles.toggleRowTitle}>Vibration</Text>
                    <Text style={styles.toggleRowSub}>
                      {hapticsEnabled ? "Vibrate on new alerts" : "No vibration"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={toggleHaptics}
                  trackColor={{ false: CONFIG.THEME.border, true: CONFIG.THEME.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* ── TEST SOUND ──────────────────────────────────────── */}
            <SectionHeader title="TEST SOUND" />
            <View style={styles.card}>
              <TouchableOpacity
                style={[
                  styles.playBtn,
                  !ownerNotificationsEnabled && styles.playBtnDisabled,
                ]}
                onPress={handlePlayTestSound}
                disabled={isPlaying || !ownerNotificationsEnabled}
                activeOpacity={0.8}
              >
                {isPlaying ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.playBtnText}>Playing Chime…</Text>
                  </>
                ) : playConfirmed ? (
                  <>
                    <Check size={18} color="#FFFFFF" />
                    <Text style={styles.playBtnText}>Sound Played ✓</Text>
                  </>
                ) : (
                  <>
                    <Play size={18} color="#FFFFFF" />
                    <Text style={styles.playBtnText}>Play Test Sound</Text>
                  </>
                )}
              </TouchableOpacity>

              {!ownerNotificationsEnabled && (
                <Text style={styles.muteNote}>
                  Turn on Notification Sounds above to test.
                </Text>
              )}
            </View>
          </>
        ) : (
          <>
            {/* ── ACCOUNT STATUS ──────────────────────────────────── */}
            <SectionHeader title="ACCOUNT & SIREN STATUS" />

            <View style={styles.card}>
              <InfoRow label="User" value={user?.name || user?.email || "Logged In"} />
              <Divider />
              <InfoRow label="Role" value={displayRole} />
              <Divider />
              <InfoRow
                label="Siren Voice"
                value={isEligible ? "Enabled (Receives Siren)" : "Excluded"}
              />
            </View>

            <PlantLocationCard
              geofenceSnap={geofenceSnap}
              isAdmin={isAdmin}
              plantNameFallback={user?.plant || undefined}
              isCapturingLocation={isCapturingLocation}
              isSavingPlantLocation={isSavingPlantLocation}
              capturedCoords={capturedCoords}
              onCaptureLocation={handleCaptureLocation}
              onSavePlantLocation={handleSavePlantLocation}
            />

        {/* ── NOTIFICATIONS ───────────────────────────────────── */}
        <SectionHeader title="NOTIFICATIONS" />

        <View style={styles.card}>
          {/* Master Sound Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              {soundEnabled ? (
                <Volume2 size={20} color={CONFIG.THEME.primary} />
              ) : (
                <VolumeX size={20} color={CONFIG.THEME.textMuted} />
              )}
              <View style={styles.toggleRowText}>
                <Text style={styles.toggleRowTitle}>Alert Sounds</Text>
                <Text style={styles.toggleRowSub}>
                  {soundEnabled ? "Enabled — plays on new alerts" : "Muted — silent for all alerts"}
                </Text>
              </View>
            </View>
            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{ false: CONFIG.THEME.border, true: CONFIG.THEME.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Divider />

          {/* Haptics Toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <Smartphone size={20} color={CONFIG.THEME.textSecondary} />
              <View style={styles.toggleRowText}>
                <Text style={styles.toggleRowTitle}>Haptic Feedback</Text>
                <Text style={styles.toggleRowSub}>
                  {hapticsEnabled ? "Vibration on new alerts" : "No vibration"}
                </Text>
              </View>
            </View>
            <Switch
              value={hapticsEnabled}
              onValueChange={toggleHaptics}
              trackColor={{ false: CONFIG.THEME.border, true: CONFIG.THEME.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* ── CRITICAL ALERT OVERRIDE (DND) ──────────────────────── */}
        <SectionHeader title="CRITICAL ALERT OVERRIDE (DND)" />

        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleRowLeft}>
              <ShieldAlert
                size={22}
                color={criticalOverride && dndAccessGranted ? CONFIG.SEVERITY.CRITICAL.color : CONFIG.THEME.textMuted}
              />
              <View style={styles.toggleRowText}>
                <Text style={styles.toggleRowTitle}>Critical Alert Override</Text>
                <Text style={styles.toggleRowSub}>
                  {criticalOverride && dndAccessGranted
                    ? "Active — Critical alarms bypass Do Not Disturb"
                    : !dndAccessGranted
                    ? "Opt-in — Requires Android DND access permission"
                    : "Disabled — Critical alarms respect Silent/DND"}
                </Text>
              </View>
            </View>
            <Switch
              value={criticalOverride && dndAccessGranted}
              onValueChange={handleToggleCriticalOverride}
              trackColor={{ false: CONFIG.THEME.border, true: CONFIG.SEVERITY.CRITICAL.color }}
              thumbColor="#FFFFFF"
            />
          </View>

          <Divider />

          {/* Explanation Info Rows */}
          <InfoRow
            label="Critical Alarms"
            value={criticalOverride && dndAccessGranted ? "Bypasses DND (Harsh siren)" : "Respects DND / Silent"}
          />
          <InfoRow
            label="Warning Alerts"
            value="Respects DND / Silent (Always)"
          />
          <InfoRow
            label="DND Policy Access"
            value={dndAccessGranted ? "Granted (System Authorized)" : "Not Granted (Tap to configure)"}
          />
          {Platform.OS === "android" && (
            <InfoRow
              label="Channel DND Bypass"
              value={isChannelBypassing ? `Enabled on ${CHANNEL_CRITICAL.id}` : "Disabled"}
            />
          )}

          {Platform.OS === "android" && (
            <>
              <Divider />
              <View style={styles.channelActionRow}>
                <TouchableOpacity
                  style={styles.channelConfigBtn}
                  onPress={() => dndService.openChannelSettings(CHANNEL_CRITICAL.id)}
                >
                  <Text style={styles.channelConfigBtnText}>Open Channel Settings</Text>
                  <ExternalLink size={14} color={CONFIG.THEME.primary} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
                {!dndAccessGranted && (
                  <TouchableOpacity
                    style={[styles.channelConfigBtn, { borderColor: CONFIG.SEVERITY.CRITICAL.color }]}
                    onPress={() => dndService.openDndSettings()}
                  >
                    <Text style={[styles.channelConfigBtnText, { color: CONFIG.SEVERITY.CRITICAL.color }]}>Grant DND Access</Text>
                    <ExternalLink size={14} color={CONFIG.SEVERITY.CRITICAL.color} style={{ marginLeft: 6 }} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>

        {/* ── NOTIFICATION SOUND ──────────────────────────────── */}
        <SectionHeader title="NOTIFICATION SOUND" />

        <View style={styles.card}>
          {/* Sound identity */}
          <View style={styles.soundIdentityRow}>
            <View style={styles.soundIconWrap}>
              <Bell size={22} color={CONFIG.THEME.primary} />
            </View>
            <View style={styles.soundIdentityText}>
              <Text style={styles.soundName}>
                {isOwner ? "Owner Alert Tone (Chime)" : "PowerIQ Alert Tone"}
              </Text>
              <Text style={styles.soundFile}>
                {isOwner ? "poweriq_alert.wav (Both Critical & Warning)" : NOTIFICATION_CHANNEL.soundFile}
              </Text>
            </View>
            <View style={styles.soundActiveBadge}>
              <Check size={12} color={CONFIG.THEME.success} />
              <Text style={styles.soundActiveBadgeText}>Active</Text>
            </View>
          </View>

          <Divider />

          {/* Play Test Sound */}
          <TouchableOpacity
            style={[
              styles.playBtn,
              !soundEnabled && styles.playBtnDisabled,
            ]}
            onPress={handlePlayTestSound}
            disabled={isPlaying}
            activeOpacity={0.8}
          >
            {isPlaying ? (
              <>
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={styles.playBtnText}>Playing…</Text>
              </>
            ) : playConfirmed ? (
              <>
                <Check size={18} color="#FFFFFF" />
                <Text style={styles.playBtnText}>Sound Played ✓</Text>
              </>
            ) : (
              <>
                <Play size={18} color="#FFFFFF" />
                <Text style={styles.playBtnText}>Play Test Sound</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: CONFIG.SEVERITY.CRITICAL.color, marginTop: 12 }]}
            onPress={handleSendRemoteCriticalPush}
            disabled={isTestingRemoteCritical}
            activeOpacity={0.8}
          >
            {isTestingRemoteCritical ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Zap size={18} color="#FFFFFF" />
            )}
            <Text style={styles.playBtnText}>
              {isTestingRemoteCritical ? "Dispatching…" : "Test Critical Push (Remote via Backend)"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.playBtn, { backgroundColor: "#D97706", marginTop: 8 }]}
            onPress={handleSendRemoteWarningPush}
            disabled={isTestingRemoteWarning}
            activeOpacity={0.8}
          >
            {isTestingRemoteWarning ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <AlertTriangle size={18} color="#FFFFFF" />
            )}
            <Text style={styles.playBtnText}>
              {isTestingRemoteWarning ? "Dispatching…" : "Test Warning Push (Remote via Backend)"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { marginTop: 8 }]}
            onPress={handleSendTestNotification}
            disabled={isSendingNotification}
          >
            {isSendingNotification ? (
              <ActivityIndicator size="small" color={CONFIG.THEME.primary} />
            ) : (
              <Bell size={18} color={CONFIG.THEME.primary} />
            )}
            <Text style={styles.secondaryBtnText}>
              {isSendingNotification ? "Testing…" : "Test Local Critical Notification"}
            </Text>
          </TouchableOpacity>

          {!soundEnabled && (
            <Text style={styles.muteNote}>
              ⚠ Enable "Alert Sounds" above to test.
            </Text>
          )}
        </View>

        {/* ── PER-SEVERITY SOUND STATUS ────────────────────────── */}
        <SectionHeader title="SOUND PER SEVERITY" />

        <View style={styles.card}>
          <SeverityRow severity="critical" soundEnabled={soundEnabled} preferenceEnabled={preferences.critical} onToggle={() => toggleSeverity("critical")} />
          <Divider />
          <SeverityRow severity="warning" soundEnabled={soundEnabled} preferenceEnabled={preferences.warning} onToggle={() => toggleSeverity("warning")} />
          <Divider />
          <SeverityRow severity="info" soundEnabled={soundEnabled} preferenceEnabled={preferences.info} onToggle={() => toggleSeverity("info")} />
        </View>

        <TouchableOpacity style={styles.systemSettingsBtn} onPress={() => Linking.openSettings()}>
          <Smartphone size={17} color={CONFIG.THEME.primary} />
          <Text style={styles.systemSettingsText}>Open System Notification Settings</Text>
        </TouchableOpacity>

        {/* ── ANDROID CHANNEL CONFIG ───────────────────────────── */}
        <SectionHeader title="ANDROID — NOTIFICATION CHANNEL" />

        <View style={styles.card}>
          <InfoRow label="Channel ID"     value={NOTIFICATION_CHANNEL.id}              mono />
          <Divider />
          <InfoRow label="Channel Name"   value={NOTIFICATION_CHANNEL.name} />
          <Divider />
          <InfoRow label="Sound Resource" value={NOTIFICATION_CHANNEL.soundResource}   mono />
          <Divider />
          <InfoRow label="Raw File Path"  value={NOTIFICATION_CHANNEL.androidRawPath}  mono />
          <Divider />
          <View style={styles.noteBox}>
            <AlertTriangle size={14} color={CONFIG.SEVERITY.WARNING.color} />
            <Text style={styles.noteText}>
              Android caches notification channels after first creation. If you
              change the sound during development, you must either{" "}
              <Text style={styles.noteTextBold}>uninstall and reinstall</Text> the app,
              or use a new channel ID (e.g. <Text style={styles.inlineCode}>poweriq_alert_v2</Text>).
            </Text>
          </View>
        </View>

        {/* ── iOS CONFIGURATION ────────────────────────────────── */}
        <SectionHeader title="iOS — NOTIFICATION SOUND" />

        <View style={styles.card}>
          <InfoRow label="Bundle Filename" value={NOTIFICATION_CHANNEL.iosResourceName} mono />
          <Divider />
          <InfoRow
            label="Bundle Location"
            value="iOS Target → Copy Bundle Resources"
          />
          <Divider />
          <InfoRow label="Sound Key"       value={NOTIFICATION_CHANNEL.soundFile}        mono />
          <Divider />
          <View style={styles.noteBox}>
            <Info size={14} color={CONFIG.SEVERITY.INFO.color} />
            <Text style={styles.noteText}>
              The file <Text style={styles.inlineCode}>poweriq_alert.wav</Text> must be listed
              under the iOS target's "Copy Bundle Resources" build phase. For Expo managed
              workflow, add it to the <Text style={styles.inlineCode}>expo-notifications</Text> plugin
              config or use a development build (EAS Build).
            </Text>
          </View>
        </View>

        {/* ── PLATFORM NOTE ────────────────────────────────────── */}
        <View style={styles.platformRow}>
          <View style={[styles.platformChip, { borderColor: "#34D399" }]}>
            <Smartphone size={14} color={CONFIG.THEME.success} />
            <Text style={[styles.platformChipText, { color: CONFIG.THEME.success }]}>
              Android Channel: {NOTIFICATION_CHANNEL.id}
            </Text>
          </View>
          <View style={[styles.platformChip, { borderColor: "#60A5FA" }]}>
            <Apple size={14} color="#2563EB" />
            <Text style={[styles.platformChipText, { color: "#2563EB" }]}>
              iOS Sound: {NOTIFICATION_CHANNEL.iosResourceName}
            </Text>
          </View>
        </View>
        </>
      )}
      </ScrollView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.THEME.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: CONFIG.THEME.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: CONFIG.THEME.bgSubtle,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  scroll: {
    padding: 16,
    gap: 0,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: CONFIG.THEME.textMuted,
    letterSpacing: 0.8,
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    overflow: "hidden",
    ...(CONFIG.THEME.shadowCard as any),
  },
  divider: {
    height: 1,
    backgroundColor: CONFIG.THEME.border,
    marginHorizontal: 14,
  },
  // Toggle rows
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
  toggleRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  toggleRowText: {
    flex: 1,
  },
  toggleRowTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  toggleRowSub: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginTop: 2,
  },
  // Sound identity
  soundIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  soundIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: CONFIG.THEME.primaryLight,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  soundIdentityText: {
    flex: 1,
  },
  soundName: {
    fontSize: 15,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  soundFile: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 2,
  },
  soundActiveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  soundActiveBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: CONFIG.THEME.success,
  },
  // Play button
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 14,
    marginTop: 14,
    backgroundColor: CONFIG.THEME.primary,
    height: 48,
    borderRadius: 10,
  },
  playBtnDisabled: {
    opacity: 0.45,
  },
  playBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    margin: 14,
    minHeight: 48,
    borderWidth: 1,
    borderColor: CONFIG.THEME.primary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnText: {
    color: CONFIG.THEME.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  systemSettingsBtn: {
    marginTop: 16,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  systemSettingsText: {
    color: CONFIG.THEME.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  muteNote: {
    textAlign: "center",
    fontSize: 12,
    color: CONFIG.SEVERITY.WARNING.color,
    marginBottom: 12,
    marginHorizontal: 16,
  },
  // Severity rows
  severityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderLeftWidth: 3,
  },
  severityRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  severityRowLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  severityBadgeOn: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },
  severityBadgeOff: {
    backgroundColor: CONFIG.THEME.bgSubtle,
    borderColor: CONFIG.THEME.border,
  },
  severityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  severityBadgeTextOn: {
    color: CONFIG.THEME.success,
  },
  severityBadgeTextOff: {
    color: CONFIG.THEME.textMuted,
  },
  // Info rows
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 14,
    gap: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    fontWeight: "500",
    flex: 1,
  },
  infoValue: {
    fontSize: 12,
    color: CONFIG.THEME.textPrimary,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  infoValueMono: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    color: CONFIG.THEME.primary,
  },
  // Note box
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    backgroundColor: "#FFFBEB",
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    lineHeight: 18,
  },
  noteTextBold: {
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  inlineCode: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    color: CONFIG.THEME.primary,
  },
  // Platform chips
  platformRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  platformChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: CONFIG.THEME.bgCard,
  },
  platformChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  channelActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  channelConfigBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    backgroundColor: "#F8FAFC",
  },
  channelConfigBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.primary,
  },
  // Plant geofence card styles
  plantHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  plantIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  plantHeaderTextWrap: {
    flex: 1,
  },
  plantNameText: {
    fontSize: 15,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  plantSubText: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeInside: {
    backgroundColor: "#DCFCE7",
  },
  statusBadgeOutside: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeUnknown: {
    backgroundColor: "#F1F5F9",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusBadgeTextInside: {
    color: "#166534",
  },
  statusBadgeTextOutside: {
    color: "#92400E",
  },
  statusBadgeTextUnknown: {
    color: "#64748B",
  },
  adminActionContainer: {
    padding: 16,
    backgroundColor: "#FAFAFA",
  },
  adminSectionTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: CONFIG.THEME.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  adminHelpText: {
    fontSize: 12,
    color: CONFIG.THEME.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  adminActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  adminActionBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  capturedCoordsBox: {
    padding: 10,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 8,
  },
  capturedCoordsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
  },
  capturedCoordsText: {
    fontSize: 12,
    color: "#1E3A8A",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginTop: 2,
  },
  adminSaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16A34A",
    paddingVertical: 12,
    borderRadius: 8,
  },
  adminSaveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
});
