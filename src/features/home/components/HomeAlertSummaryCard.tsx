/**
 * HomeAlertSummaryCard.tsx
 * ----------------------------------------------------------------------------
 * Alert Summary Card on Home screen displaying:
 * - Total Alerts
 * - Pending Critical
 * - Pending Warning
 * - Total Solved
 * - Acknowledged (ack_critical + ack_warning)
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { AlertTriangle, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react-native";
import { CONFIG } from "../../../config/constants";
import { CardSkeleton } from "../../../components/common/LoadingSkeleton";

interface AlertSummaryData {
  total?: number;
  pendingCritical?: number;
  pendingWarning?: number;
  totalSolved?: number;
  acknowledged?: number;
}

interface HomeAlertSummaryCardProps {
  summary: AlertSummaryData;
  loading?: boolean;
  onPressViewAll?: () => void;
}

export const HomeAlertSummaryCard: React.FC<HomeAlertSummaryCardProps> = ({
  summary,
  loading = false,
  onPressViewAll,
}) => {
  if (loading) {
    return <CardSkeleton height={190} />;
  }

  const {
    total = 0,
    pendingCritical = 0,
    pendingWarning = 0,
    totalSolved = 0,
    acknowledged = 0,
  } = summary;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <AlertCircle size={18} color={CONFIG.THEME.primary} />
          <Text style={styles.cardTitle}>Alert Summary</Text>
        </View>

        {onPressViewAll && (
          <TouchableOpacity onPress={onPressViewAll} activeOpacity={0.7}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Grid of Alert Counters */}
      <View style={styles.grid}>
        {/* Total Alerts */}
        <View style={[styles.tile, { borderColor: "#CBD5E1" }]}>
          <Text style={styles.tileNumber}>{total}</Text>
          <Text style={styles.tileLabel}>Total</Text>
        </View>

        {/* Pending Critical */}
        <View style={[styles.tile, { borderColor: CONFIG.SEVERITY.CRITICAL.border, backgroundColor: CONFIG.SEVERITY.CRITICAL.bgLight }]}>
          <View style={styles.tileIconRow}>
            <AlertCircle size={13} color={CONFIG.SEVERITY.CRITICAL.color} />
            <Text style={[styles.tileNumber, { color: CONFIG.SEVERITY.CRITICAL.color }]}>
              {pendingCritical}
            </Text>
          </View>
          <Text style={[styles.tileLabel, { color: CONFIG.SEVERITY.CRITICAL.colorDark }]}>Critical</Text>
        </View>

        {/* Pending Warning */}
        <View style={[styles.tile, { borderColor: CONFIG.SEVERITY.WARNING.border, backgroundColor: CONFIG.SEVERITY.WARNING.bgLight }]}>
          <View style={styles.tileIconRow}>
            <AlertTriangle size={13} color={CONFIG.SEVERITY.WARNING.color} />
            <Text style={[styles.tileNumber, { color: CONFIG.SEVERITY.WARNING.color }]}>
              {pendingWarning}
            </Text>
          </View>
          <Text style={[styles.tileLabel, { color: CONFIG.SEVERITY.WARNING.colorDark }]}>Warning</Text>
        </View>

        {/* Total Solved */}
        <View style={[styles.tile, { borderColor: "#BBF7D0", backgroundColor: "#F0FDF4" }]}>
          <View style={styles.tileIconRow}>
            <CheckCircle2 size={13} color="#16A34A" />
            <Text style={[styles.tileNumber, { color: "#16A34A" }]}>{totalSolved}</Text>
          </View>
          <Text style={[styles.tileLabel, { color: "#166534" }]}>Solved</Text>
        </View>

        {/* Acknowledged */}
        <View style={[styles.tile, { borderColor: "#BFDBFE", backgroundColor: "#EFF6FF" }]}>
          <View style={styles.tileIconRow}>
            <ShieldCheck size={13} color="#2563EB" />
            <Text style={[styles.tileNumber, { color: "#2563EB" }]}>{acknowledged}</Text>
          </View>
          <Text style={[styles.tileLabel, { color: "#1E40AF" }]}>Acked</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    ...CONFIG.THEME.shadowCard,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: CONFIG.THEME.primary,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    marginHorizontal: 2,
    backgroundColor: "#F8FAFC",
  },
  tileIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  tileNumber: {
    fontSize: 16,
    fontWeight: "800",
    color: CONFIG.THEME.textPrimary,
  },
  tileLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
    marginTop: 2,
  },
});
