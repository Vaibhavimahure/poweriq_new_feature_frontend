/**
 * RecentAlertsCard.tsx
 * ----------------------------------------------------------------------------
 * Recent Alerts list card on the Home Screen.
 * Displays recent alerts from the shared alerts response:
 * - Device / machine name
 * - Alert title / tag
 * - Timestamp
 * - Severity pill & status icon
 * - "View All" link
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { AlertTriangle, Clock, ArrowRight, ShieldAlert } from "lucide-react-native";
import { CONFIG } from "../../../config/constants";
import { AlertItem } from "../../../types/alert";
import { formatDistanceToNow } from "date-fns";

interface RecentAlertsCardProps {
  alerts: AlertItem[];
  loading?: boolean;
  onPressViewAll: () => void;
  onSelectAlert: (alert: AlertItem) => void;
}

export const RecentAlertsCard: React.FC<RecentAlertsCardProps> = ({
  alerts,
  loading = false,
  onPressViewAll,
  onSelectAlert,
}) => {
  const displayAlerts = alerts.slice(0, 5);

  const getSeverityStyle = (sev?: string) => {
    const s = String(sev || "").toUpperCase();
    if (s === "CRITICAL") return CONFIG.SEVERITY.CRITICAL;
    if (s === "WARNING") return CONFIG.SEVERITY.WARNING;
    return CONFIG.SEVERITY.INFO;
  };

  const formatTime = (ts?: string | number) => {
    if (!ts) return "recently";
    try {
      const d = typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(ts);
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <ShieldAlert size={18} color={CONFIG.THEME.primary} />
          <Text style={styles.cardTitle}>Recent Alerts</Text>
        </View>

        <TouchableOpacity
          style={styles.viewAllRow}
          onPress={onPressViewAll}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ArrowRight size={14} color={CONFIG.THEME.primary} />
        </TouchableOpacity>
      </View>

      {displayAlerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No recent alerts</Text>
        </View>
      ) : (
        displayAlerts.map((item, index) => {
          const sev = getSeverityStyle(item.severity);
          const isAck = Boolean(item.acknowledged || item.lifecycle_acknowledged);

          const devName = item.panel_name || item.device_id || "Machine";
          const alertDesc = item.message || item.tag_name || "Telemetry Alert";
          const timeVal = item.ts || item.createdAt;

          return (
            <TouchableOpacity
              key={item._id || item.alert_id || String(index)}
              style={[
                styles.alertItem,
                index === displayAlerts.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => onSelectAlert(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.severityBar, { backgroundColor: sev.color }]} />

              <View style={styles.alertContent}>
                <View style={styles.topRow}>
                  <Text style={styles.deviceName} numberOfLines={1}>
                    {devName}
                  </Text>
                  <View style={[styles.sevBadge, { backgroundColor: sev.badgeBg }]}>
                    <Text style={[styles.sevText, { color: sev.badgeText }]}>
                      {item.severity || "Warning"}
                    </Text>
                  </View>
                </View>

                <Text style={styles.alertType} numberOfLines={1}>
                  {alertDesc}
                </Text>

                <View style={styles.bottomMeta}>
                  <View style={styles.timeRow}>
                    <Clock size={11} color={CONFIG.THEME.textMuted} />
                    <Text style={styles.timeText}>{formatTime(timeVal)}</Text>
                  </View>

                  {isAck && (
                    <View style={styles.ackBadge}>
                      <Text style={styles.ackText}>ACK</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })
      )}
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
    marginBottom: 24,
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
  viewAllRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: CONFIG.THEME.primary,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 13,
    color: CONFIG.THEME.textMuted,
  },
  alertItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  severityBar: {
    width: 4,
    height: 36,
    borderRadius: 2,
    marginRight: 10,
  },
  alertContent: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    flex: 1,
  },
  sevBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  sevText: {
    fontSize: 10,
    fontWeight: "700",
  },
  alertType: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginBottom: 4,
  },
  bottomMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
  ackBadge: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  ackText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#166534",
  },
});
