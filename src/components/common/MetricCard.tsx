/**
 * MetricCard.tsx
 * ----------------------------------------------------------------------------
 * Reusable PowerIQ metric tile component for KPI summaries.
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ArrowUpRight, ArrowDownRight } from "lucide-react-native";
import { CONFIG } from "../../config/constants";

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  subValue?: string;
  delta?: number | null;
  deltaSuffix?: string;
  deltaInverted?: boolean; // if true, higher delta is worse (e.g. losses)
  color?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  style?: any;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  subValue,
  delta,
  deltaSuffix = "%",
  deltaInverted = false,
  color = CONFIG.THEME.primary,
  icon,
  onPress,
  style,
}) => {
  const displayVal = value !== null && value !== undefined && value !== "" ? String(value) : "—";

  const renderDelta = () => {
    if (delta === null || delta === undefined || !Number.isFinite(delta)) return null;

    const isPositive = delta > 0;
    const isNeutral = delta === 0;

    let isGood = isPositive;
    if (deltaInverted) isGood = !isPositive;

    const badgeColor = isNeutral
      ? CONFIG.THEME.textMuted
      : isGood
      ? CONFIG.THEME.success
      : CONFIG.THEME.danger;

    const badgeBg = isNeutral
      ? CONFIG.THEME.bgSubtle
      : isGood
      ? "#DCFCE7"
      : "#FEE2E2";

    return (
      <View style={[styles.deltaBadge, { backgroundColor: badgeBg }]}>
        {isPositive ? (
          <ArrowUpRight size={12} color={badgeColor} />
        ) : (
          <ArrowDownRight size={12} color={badgeColor} />
        )}
        <Text style={[styles.deltaText, { color: badgeColor }]}>
          {Math.abs(delta).toFixed(1)}
          {deltaSuffix}
        </Text>
      </View>
    );
  };

  const Content = (
    <View style={[styles.card, style]}>
      <View style={styles.topRow}>
        <View style={styles.labelContainer}>
          <View style={[styles.colorBar, { backgroundColor: color }]} />
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </View>
        {icon}
      </View>

      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={1}>
          {displayVal}
        </Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>

      <View style={styles.bottomRow}>
        {renderDelta()}
        {subValue ? (
          <Text style={styles.subValue} numberOfLines={1}>
            {subValue}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 14,
    ...CONFIG.THEME.shadowCard,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  colorBar: {
    width: 3,
    height: 14,
    borderRadius: 2,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
    flex: 1,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  value: {
    fontSize: 20,
    fontWeight: "800",
    color: CONFIG.THEME.textPrimary,
  },
  unit: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
    marginLeft: 4,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 18,
  },
  deltaBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: "700",
    marginLeft: 2,
  },
  subValue: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
});
