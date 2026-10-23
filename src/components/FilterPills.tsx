/**
 * FilterPills.tsx — Quick Filter Selector (Light Mode)
 * ----------------------------------------------------------------------------
 * Clean pills for selecting Severity and Status in Light Mode.
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { CONFIG } from "../config/constants";

interface Props {
  selectedSeverity: string;
  onSelectSeverity: (sev: string) => void;
  selectedStatus: string;
  onSelectStatus: (stat: string) => void;
}

export const FilterPills: React.FC<Props> = ({
  selectedSeverity,
  onSelectSeverity,
  selectedStatus,
  onSelectStatus,
}) => {
  const severities = [
    { key: "ALL", label: "All Severities" },
    { key: "critical", label: "Critical", color: CONFIG.SEVERITY.CRITICAL.color },
    { key: "warning", label: "Warning", color: CONFIG.SEVERITY.WARNING.color },
    { key: "info", label: "Info", color: CONFIG.SEVERITY.INFO.color },
  ];

  const statuses = [
    { key: "ALL", label: "All Status" },
    { key: "open", label: "Open / Pending" },
    { key: "acknowledged", label: "Acknowledged" },
  ];

  return (
    <View style={styles.container}>
      {/* Severity Filter Row */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        {severities.map((item) => {
          const isSelected = selectedSeverity.toLowerCase() === item.key.toLowerCase();
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onSelectSeverity(item.key)}
              activeOpacity={0.8}
              style={[
                styles.pill,
                isSelected && styles.pillSelected,
                item.color && isSelected && { borderColor: item.color },
              ]}
            >
              {item.color && (
                <View style={[styles.dot, { backgroundColor: item.color }]} />
              )}
              <Text
                style={[
                  styles.pillText,
                  isSelected && styles.pillTextSelected,
                  item.color && isSelected && { color: item.color },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Status Filter Row */}
      <View style={styles.statusRow}>
        {statuses.map((item) => {
          const isSelected = selectedStatus.toLowerCase() === item.key.toLowerCase();
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => onSelectStatus(item.key)}
              activeOpacity={0.8}
              style={[
                styles.statusTab,
                isSelected && styles.statusTabSelected,
              ]}
            >
              <Text
                style={[
                  styles.statusTabText,
                  isSelected && styles.statusTabTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  scrollRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: CONFIG.THEME.bgCard,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    ...CONFIG.THEME.shadowSm,
  },
  pillSelected: {
    backgroundColor: CONFIG.THEME.primaryLight,
    borderColor: CONFIG.THEME.primary,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
  },
  pillTextSelected: {
    color: CONFIG.THEME.primary,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 8,
  },
  statusTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: CONFIG.THEME.bgSubtle,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
  },
  statusTabSelected: {
    backgroundColor: CONFIG.THEME.primaryLight,
    borderColor: CONFIG.THEME.primary,
  },
  statusTabText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
  },
  statusTabTextSelected: {
    color: CONFIG.THEME.primary,
    fontWeight: "700",
  },
});
