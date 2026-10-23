import React, { createContext, useContext, useState, useEffect } from "react";
import { soundService } from "../services/soundService";
import { AlertSeverity } from "../types/alert";

interface AudioContextType {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  toggleSound: () => Promise<void>;
  toggleHaptics: () => Promise<void>;
  playAlertSound: (severity?: AlertSeverity) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(true);
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(true);

  useEffect(() => {
    setSoundEnabledState(soundService.isSoundEnabled());
    setHapticsEnabledState(soundService.isHapticsEnabled());
  }, []);

  const toggleSound = async () => {
    const nextState = !soundEnabled;
    setSoundEnabledState(nextState);
    await soundService.setSoundEnabled(nextState);
    if (nextState) {
      // Play brief test chime on enable
      await soundService.playAlertSound("info");
    }
  };

  const toggleHaptics = async () => {
    const nextState = !hapticsEnabled;
    setHapticsEnabledState(nextState);
    await soundService.setHapticsEnabled(nextState);
  };

  const playAlertSound = async (severity: AlertSeverity = "info") => {
    await soundService.playAlertSound(severity);
  };

  return (
    <AudioContext.Provider
      value={{
        soundEnabled,
        hapticsEnabled,
        toggleSound,
        toggleHaptics,
        playAlertSound,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
};
