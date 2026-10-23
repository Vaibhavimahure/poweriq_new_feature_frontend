/**
 * AudioToggle.tsx — Quick Sound Toggle Button
 * ----------------------------------------------------------------------------
 * Tappable square header action button matching reference screenshot.
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { TouchableOpacity, StyleSheet, View } from "react-native";
import { useAudio } from "../context/AudioContext";
import { Volume2, VolumeX } from "lucide-react-native";

export const AudioToggle: React.FC = () => {
  const { soundEnabled, toggleSound } = useAudio();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={toggleSound}
      style={[
        styles.button,
        soundEnabled ? styles.buttonActive : styles.buttonMuted,
      ]}
    >
      {soundEnabled ? (
        <Volume2 size={19} color="#2563EB" />
      ) : (
        <VolumeX size={19} color="#94A3B8" />
      )}
      {soundEnabled && <View style={styles.activeDot} />}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  buttonActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
  },
  buttonMuted: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  activeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16A34A",
  },
});
