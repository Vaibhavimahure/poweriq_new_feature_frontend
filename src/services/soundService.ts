/**
 * soundService.ts — In-App Foreground Audio & Haptic Service
 * ----------------------------------------------------------------------------
 * Handles in-app foreground audio playback and haptics:
 *  - Critical: poweriq_critical.wav & heavy error haptic
 *  - Warning: poweriq_alert.wav & warning haptic
 *  - Fallback: synthesized tone if bundled asset fails to load
 * ----------------------------------------------------------------------------
 */

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as Haptics from "expo-haptics";
import { AlertItem, AlertSeverity } from "../types/alert";
import { storage } from "./storage";
import { CONFIG } from "../config/constants";
import {
  CHANNEL_CRITICAL,
  CHANNEL_WARNING,
  CRITICAL_SOUND_FILE,
  WARNING_SOUND_FILE,
  getOwnerNotificationsEnabled,
  isMdAlert,
  resolveAlertSoundConfig,
} from "../config/notifications";
import { geofenceService } from "./geofenceService";
import { normalizeRole } from "../utils/role";

// ---------------------------------------------------------------------------
// Android Notification Channel Configuration
// ---------------------------------------------------------------------------
export const NOTIFICATION_CHANNEL = {
  critical: CHANNEL_CRITICAL,
  warning: CHANNEL_WARNING,
  id: CHANNEL_CRITICAL.id,
  name: CHANNEL_CRITICAL.name,
  soundResource: "poweriq_critical",
  soundFile: CRITICAL_SOUND_FILE,
  androidRawPath: "android/app/src/main/res/raw/poweriq_critical.wav",
  iosResourceName: "poweriq_critical.wav",
} as const;

// ---------------------------------------------------------------------------
// Severity → Sound Config Map
// ---------------------------------------------------------------------------
export const SEVERITY_SOUND_CONFIG: Record<
  AlertSeverity,
  { usesSound: boolean; label: string; channelId: string; soundFile: string }
> = {
  critical: {
    usesSound: true,
    label: "Critical Alerts",
    channelId: CHANNEL_CRITICAL.id,
    soundFile: CRITICAL_SOUND_FILE,
  },
  warning: {
    usesSound: true,
    label: "Warning Alerts",
    channelId: CHANNEL_WARNING.id,
    soundFile: WARNING_SOUND_FILE,
  },
  info: {
    usesSound: true,
    label: "Info Alerts",
    channelId: CHANNEL_WARNING.id,
    soundFile: WARNING_SOUND_FILE,
  },
};

// ---------------------------------------------------------------------------
// Synthesized PCM WAV fallback tones (if bundled asset fails in Expo Go)
// ---------------------------------------------------------------------------
const generateToneDataUri = (frequency: number, durationSec: number, beeps = 1): string => {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const totalSamples = numSamples * beeps;
  const numChannels = 1;
  const bytesPerSample = 1;
  const subChunk2Size = totalSamples * numChannels * bytesPerSample;
  const chunkSize = 36 + subChunk2Size;

  const buffer = new Uint8Array(44 + subChunk2Size);
  const view = new DataView(buffer.buffer);

  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, chunkSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, subChunk2Size, true);

  let sampleIndex = 44;
  for (let b = 0; b < beeps; b++) {
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const envelope = Math.sin((i / numSamples) * Math.PI);
      const sampleVal = Math.sin(2 * Math.PI * frequency * t) * envelope;
      const byteVal = Math.floor((sampleVal + 1) * 127.5);
      buffer[sampleIndex++] = byteVal;
    }
  }

  let binary = "";
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }

  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");

  return `data:audio/wav;base64,${b64}`;
};

const TONES = {
  critical: generateToneDataUri(880, 0.15, 3),
  warning: generateToneDataUri(587, 0.2, 2),
  info: generateToneDataUri(440, 0.25, 1),
};

// ---------------------------------------------------------------------------
class SoundService {
  private isAudioInitialized = false;
  private soundEnabled = true;
  private hapticsEnabled = true;
  private activeSounds: Audio.Sound[] = [];
  private isLoggedOut = false;

  constructor() {
    this.init();
  }

  public resetLogoutState(): void {
    this.isLoggedOut = false;
    console.log("[SoundService] Logout state reset (user logged in)");
  }

  private async init() {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
      });
      this.isAudioInitialized = true;

      const savedSound = await storage.getItem(CONFIG.STORAGE_KEYS.SOUND_ENABLED);
      if (savedSound !== null) this.soundEnabled = savedSound === "true";

      const savedHaptics = await storage.getItem(CONFIG.STORAGE_KEYS.HAPTICS_ENABLED);
      if (savedHaptics !== null) this.hapticsEnabled = savedHaptics === "true";
    } catch (e) {
      console.warn("Could not set audio mode:", e);
    }
  }

  public async setSoundEnabled(enabled: boolean): Promise<void> {
    this.soundEnabled = enabled;
    await storage.setItem(CONFIG.STORAGE_KEYS.SOUND_ENABLED, String(enabled));
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public isSoundEnabledForSeverity(_severity: AlertSeverity): boolean {
    return this.soundEnabled && SEVERITY_SOUND_CONFIG[_severity]?.usesSound;
  }

  public async setHapticsEnabled(enabled: boolean): Promise<void> {
    this.hapticsEnabled = enabled;
    await storage.setItem(CONFIG.STORAGE_KEYS.HAPTICS_ENABLED, String(enabled));
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  /**
   * playAlertSound — Plays in-app foreground alert sound + haptic.
   *  - MD Alert (Standard roles): poweriq_critical.wav (Harsh siren)
   *  - Other Critical / Warning / Info (Standard roles): poweriq_alert.wav (Chime)
   *  - Owner (Critical, Warning, and MD): poweriq_alert.wav (Chime)
   */
  public async playAlertSound(
    severity: AlertSeverity = "info",
    isOwner: boolean = false,
    alert?: AlertItem | null,
    userRole?: unknown
  ): Promise<void> {
    // 1. Immediate in-memory logout guard
    if (this.isLoggedOut) {
      console.log("[SoundService] Sound suppressed: User is logged out (guard)");
      return;
    }

    // 2. Storage token guard
    try {
      const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) {
        this.isLoggedOut = true;
        console.log("[SoundService] Sound suppressed: User is logged out (no token)");
        return;
      }
    } catch {
      return;
    }

    // Resolve user role
    let effectiveRole = userRole;
    if (!effectiveRole) {
      try {
        const storedUser = await storage.getObject<any>(CONFIG.STORAGE_KEYS.USER_DATA);
        effectiveRole = storedUser?.role;
      } catch {}
    }
    if (!effectiveRole && isOwner) {
      effectiveRole = "owner";
    }

    const geofenceState = geofenceService.getGeofenceStatus();
    const soundConfig = resolveAlertSoundConfig(alert, effectiveRole, geofenceState, severity);

    // SILENT Check per Final Agreed Sound Matrix:
    // If silent, suppress both audio and haptics completely
    if (soundConfig.isSilent) {
      console.log(`[SoundService] Sound suppressed: Role "${normalizeRole(effectiveRole)}" on alert is SILENT per Final Sound Matrix (${soundConfig.reason})`);
      return;
    }

    const shouldUseSiren = soundConfig.isHarshSiren;

    // MD alert siren MUST ALWAYS sound automatically and never be suppressed by a general mute toggle
    if (!shouldUseSiren && !this.soundEnabled) {
      console.log("[SoundService] Non-MD alert sound is currently disabled in user settings");
      return;
    }

    // 3. Vibration / Haptic Feedback
    if (this.hapticsEnabled) {
      try {
        if (shouldUseSiren) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      } catch {
        // Haptics not supported
      }
    }

    try {
      if (!this.isAudioInitialized) await this.init();

      let soundInstance: Audio.Sound | null = null;

      try {
        // Load audio file:
        // Harsh industrial siren ONLY for MD alerts (when not Owner)
        // Gentle chime (poweriq_alert.wav) for everything else (non-MD critical, warnings, owner alerts)
        const assetSource =
          shouldUseSiren
            ? require("../../assets/sounds/poweriq_critical.wav")
            : require("../../assets/sounds/poweriq_alert.wav");

        const { sound } = await Audio.Sound.createAsync(
          assetSource,
          { shouldPlay: false, volume: 1.0 },
          undefined,
          false
        );
        soundInstance = sound;

        // Post-creation guard: did user log out while audio file was loading?
        const tokenAfterLoad = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        if (this.isLoggedOut || !tokenAfterLoad) {
          console.log("[SoundService] Playback aborted: User logged out while audio asset was loading");
          await soundInstance.unloadAsync().catch(() => {});
          return;
        }

        await soundInstance.setVolumeAsync(1.0);
        await soundInstance.playAsync();
      } catch (assetErr) {
        console.warn("[SoundService] Custom asset playback failed, falling back to tone:", assetErr);
        // Graceful fallback to synthesized tone
        const fallbackUri = isOwner ? TONES.warning : (shouldUseSiren ? TONES.critical : (TONES[severity] || TONES.info));
        const { sound } = await Audio.Sound.createAsync(
          { uri: fallbackUri },
          { shouldPlay: false, volume: 1.0 }
        );
        soundInstance = sound;

        const tokenAfterLoad = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        if (this.isLoggedOut || !tokenAfterLoad) {
          console.log("[SoundService] Fallback tone playback aborted: User logged out while loading tone");
          await soundInstance.unloadAsync().catch(() => {});
          return;
        }

        await soundInstance.setVolumeAsync(1.0);
        await soundInstance.playAsync();
      }

      if (soundInstance) {
        this.activeSounds.push(soundInstance);
        soundInstance.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            soundInstance?.unloadAsync();
            this.activeSounds = this.activeSounds.filter((s) => s !== soundInstance);
          }
        });
      }
    } catch (err) {
      console.warn("Error playing alert sound:", err);
    }
  }

  /**
   * playSoundForNotification — Called when a genuinely NEW realtime alert arrives.
   */
  public async playSoundForNotification(
    severity: AlertSeverity,
    source: "socket" | "push" = "socket",
    isOwner: boolean = false,
    alert?: AlertItem | null,
    userRole?: unknown
  ): Promise<void> {
    if (this.isLoggedOut) {
      console.log("[SoundService] Notification sound suppressed: User is logged out");
      return;
    }

    console.log("[PowerIQ Audio Notification]", {
      severity,
      source,
      isOwner,
      userRole,
      isMdAlert: alert ? isMdAlert(alert) : false,
    });

    await this.playAlertSound(severity, isOwner, alert, userRole);
  }

  public async cleanup(): Promise<void> {
    // Immediately flag as logged out so no in-flight or subsequent sounds can play
    this.isLoggedOut = true;
    console.log("[SoundService] Cleaning up active sounds on logout (count:", this.activeSounds.length, ")");

    for (const sound of this.activeSounds) {
      try {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
      } catch {
        // Ignore
      }
    }
    this.activeSounds = [];
  }
}

export const soundService = new SoundService();
