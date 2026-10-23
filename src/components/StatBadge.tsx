/**
 * StatBadge.tsx — PowerIQ Summary Metric Card
 * ----------------------------------------------------------------------------
 * Industrial summary telemetry card matching mobile reference screenshot:
 *  - Colored icon box on left
 *  - Bold count on top row
 *  - Clear metric description label
 *  - Distinctive colored bottom accent bar
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { Text, StyleSheet, TouchableOpacity, View } from "react-native";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
} from "lucide-react-native";

interface Props {
  label: string;
  count: number | string;
  type:
    | "total"
    | "critical"
    | "warning"
    | "ack"
    | "all_solved"
    | "solved_by_system"
    | "unsolved_critical"
    | "unsolved_warning";
  isActive?: boolean;
  onPress?: () => void;
}

export const StatBadge: React.FC<Props> = ({
  label,
  count,
  type,
  isActive = false,
  onPress,
}) => {
  const getScheme = () => {
    switch (type) {
      case "total":
        return {
          color: "#2563EB",
          iconBg: "#2563EB",
          bottomBar: "#2563EB",
          icon: <Layers size={16} color="#FFFFFF" />,
        };
      case "critical":
        return {
          color: "#DC2626",
          iconBg: "#DC2626",
          bottomBar: "#DC2626",
          icon: <AlertCircle size={16} color="#FFFFFF" />,
        };
      case "unsolved_critical":
        return {
          color: "#E11D48",
          iconBg: "#E11D48",
          bottomBar: "#E11D48",
          icon: <AlertCircle size={16} color="#FFFFFF" />,
        };
      case "warning":
      case "unsolved_warning":
        return {
          color: "#D97706",
          iconBg: "#F59E0B",
          bottomBar: "#F59E0B",
          icon: <AlertTriangle size={16} color="#FFFFFF" />,
        };
      case "all_solved":
      case "ack":
        return {
          color: "#16A34A",
          iconBg: "#16A34A",
          bottomBar: "#16A34A",
          icon: <CheckCircle2 size={16} color="#FFFFFF" />,
        };
      case "solved_by_system":
        return {
          color: "#0891B2",
          iconBg: "#0891B2",
          bottomBar: "#0891B2",
          icon: <Cpu size={16} color="#FFFFFF" />,
        };
      default:
        return {
          color: "#64748B",
          iconBg: "#64748B",
          bottomBar: "#64748B",
          icon: <AlertCircle size={16} color="#FFFFFF" />,
        };
    }
  };

  const scheme = getScheme();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[
        styles.card,
        isActive && styles.activeCard,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: scheme.iconBg }]}>
          {scheme.icon}
        </View>
        <Text style={[styles.count, { color: scheme.color }]}>
          {count !== undefined && count !== null ? count : "-"}
        </Text>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.bottomBar, { backgroundColor: scheme.bottomBar }]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    minWidth: 128,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
    overflow: "hidden",
  },
  activeCard: {
    borderColor: "#D1D5DB",
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontSize: 22,
    fontWeight: "800",
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3.5,
  },
});
