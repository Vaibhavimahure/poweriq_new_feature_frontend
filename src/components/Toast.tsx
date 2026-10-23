/**
 * Toast.tsx — In-App Live Alert Notification Banner (Light Mode)
 * ----------------------------------------------------------------------------
 * Slides in smoothly from top when a genuinely new realtime alert is received.
 * ----------------------------------------------------------------------------
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from "react-native";
import { AlertItem } from "../types/alert";
import { CONFIG } from "../config/constants";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  alert: AlertItem | null;
  onPress: (alert: AlertItem) => void;
  onDismiss: () => void;
}

export const AlertToast: React.FC<Props> = ({ alert, onPress, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (alert) {
      Animated.spring(slideAnim, {
        toValue: insets.top + 10,
        friction: 7,
        tension: 50,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        handleDismiss();
      }, 6000);

      return () => clearTimeout(timer);
    } else {
      Animated.timing(slideAnim, {
        toValue: -150,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [alert, insets.top]);

  const handleDismiss = () => {
    Animated.timing(slideAnim, {
      toValue: -150,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  if (!alert) return null;

  const severity = (alert.severity || "info").toLowerCase();
  const isCritical = severity === "critical";

  const getIcon = () => {
    if (isCritical) return <AlertCircle size={18} color={CONFIG.SEVERITY.CRITICAL.color} />;
    if (severity === "warning") return <AlertTriangle size={18} color={CONFIG.SEVERITY.WARNING.color} />;
    return <Info size={18} color={CONFIG.SEVERITY.INFO.color} />;
  };

  const getBorderColor = () => {
    if (isCritical) return CONFIG.SEVERITY.CRITICAL.color;
    if (severity === "warning") return CONFIG.SEVERITY.WARNING.color;
    return CONFIG.SEVERITY.INFO.color;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          borderLeftColor: getBorderColor(),
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => {
          handleDismiss();
          onPress(alert);
        }}
        style={styles.inner}
      >
        <View style={styles.iconContainer}>{getIcon()}</View>

        <View style={styles.textContainer}>
          <View style={styles.headerRow}>
            <Text
              style={[
                styles.tagline,
                { color: isCritical ? CONFIG.SEVERITY.CRITICAL.color : CONFIG.THEME.primary },
              ]}
            >
              NEW REAL-TIME ALERT
            </Text>
            <Text style={styles.panelName} numberOfLines={1}>
              {alert.panel_name}
            </Text>
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {alert.message}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={CONFIG.THEME.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    zIndex: 9999,
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    borderLeftWidth: 4,
    ...CONFIG.THEME.shadowCard,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  iconContainer: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
    gap: 6,
  },
  tagline: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  panelName: {
    fontSize: 13,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    flex: 1,
  },
  message: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});
