/**
 * ConnectionStatus.tsx — Socket.IO Live Stream Indicator
 * ----------------------------------------------------------------------------
 * Visual pill displaying whether the real-time live alert stream is active.
 * Matches mobile reference styling:
 *  - Light green pill with pulsing dot + icon + "LIVE STREAM"
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity } from "react-native";
import { ConnectionStatus as StatusType } from "../services/socketService";
import { Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react-native";

interface Props {
  status: StatusType;
  detail?: string;
  onRetry?: () => void;
}

export const ConnectionStatus: React.FC<Props> = ({ status, onRetry }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === "connected" || status === "reconnecting") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.35,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          label: "LIVE STREAM",
          color: "#16A34A",
          bg: "#EBF9EE",
          border: "#D1F2D9",
          icon: <Wifi size={11} color="#16A34A" />,
        };
      case "connecting":
      case "reconnecting":
        return {
          label: "CONNECTING",
          color: "#D97706",
          bg: "#FEF3C7",
          border: "#FDE68A",
          icon: <RefreshCw size={11} color="#D97706" />,
        };
      case "unauthorized":
        return {
          label: "AUTH REQUIRED",
          color: "#DC2626",
          bg: "#FEE2E2",
          border: "#FECACA",
          icon: <AlertTriangle size={11} color="#DC2626" />,
        };
      default:
        return {
          label: "OFFLINE",
          color: "#94A3B8",
          bg: "#F1F5F9",
          border: "#E2E8F0",
          icon: <WifiOff size={11} color="#94A3B8" />,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onRetry}
      disabled={status === "connected"}
      style={[
        styles.container,
        { backgroundColor: config.bg, borderColor: config.border },
      ]}
    >
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: config.color, opacity: pulseAnim },
        ]}
      />
      <View style={styles.iconWrapper}>{config.icon}</View>
      <Text style={[styles.label, { color: config.color }]}>
        {config.label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  iconWrapper: {
    marginRight: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
