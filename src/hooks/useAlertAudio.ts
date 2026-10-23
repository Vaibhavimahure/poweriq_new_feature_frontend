import { useAudio } from "../context/AudioContext";
import { AlertSeverity } from "../types/alert";

/**
 * Custom notification audio hook to play distinct sounds based on alert severity.
 */
export const useAlertAudio = () => {
  const { soundEnabled, hapticsEnabled, toggleSound, toggleHaptics, playAlertSound } = useAudio();

  const playCriticalSound = () => playAlertSound("critical");
  const playWarningSound = () => playAlertSound("warning");
  const playInfoSound = () => playAlertSound("info");

  const notifyAlert = (severity: AlertSeverity) => {
    return playAlertSound(severity);
  };

  return {
    soundEnabled,
    hapticsEnabled,
    toggleSound,
    toggleHaptics,
    notifyAlert,
    playCriticalSound,
    playWarningSound,
    playInfoSound,
  };
};
