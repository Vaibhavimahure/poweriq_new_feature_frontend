

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { AlertItem, AlertSeverity, isAlertAcknowledged, isAlertSolved } from "../types/alert";
import { formatDistanceToNow } from "date-fns";
import { formatAlertCardDate } from "../utils/dateFormatter";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  ChevronRight,
  Calendar,
  MoreVertical,
} from "lucide-react-native";
import {
  getPerformanceMetricName,
  formatAlertValue,
  formatAlertUnit,
} from "../utils/metrics";

interface Props {
  alert: AlertItem;
  onPress: () => void;
  onAcknowledgePress: (alert: AlertItem) => void;
  onMarkAsSolvedPress: (alert: AlertItem) => void;
}

export const AlertCard: React.FC<Props> = ({
  alert,
  onPress,
  onAcknowledgePress,
  onMarkAsSolvedPress,
}) => {
  const severity: AlertSeverity = (alert.severity || "info").toLowerCase() as AlertSeverity;
  const isAcked = isAlertAcknowledged(alert);
  const isSolved = isAlertSolved(alert);

  const getSeverityMeta = () => {
    switch (severity) {
      case "critical":
        return {
          color: "#DC2626",
          badgeBg: "#FEE2E2",
          badgeText: "#DC2626",
          icon: <AlertCircle size={13} color="#DC2626" />,
          label: "CRITICAL",
        };
      case "warning":
        return {
          color: "#D97706",
          badgeBg: "#FEF3C7",
          badgeText: "#D97706",
          icon: <AlertTriangle size={13} color="#D97706" />,
          label: "WARNING",
        };
      default:
        return {
          color: "#2563EB",
          badgeBg: "#DBEAFE",
          badgeText: "#2563EB",
          icon: <Info size={13} color="#2563EB" />,
          label: "INFO",
        };
    }
  };

  const meta = getSeverityMeta();

  // Parse timestamps safely
  const parseDate = (ts: string | Date | undefined) => {
    if (!ts) return new Date();
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  };

  const alertDate = parseDate(alert.ts || alert.createdAt);

  const timeAgo = () => {
    try {
      return formatDistanceToNow(alertDate, { addSuffix: true });
    } catch {
      return "Recently";
    }
  };

  const formattedDateTime = () => {
    return formatAlertCardDate(alert.ts || alert.createdAt);
  };

  const performanceMetric = getPerformanceMetricName(alert.tag_name);
  const formattedVal = formatAlertValue(alert.alert_value);
  const formattedUnit = formatAlertUnit(alert.unit, alert.tag_name);

  return (
    <View style={[styles.card, isSolved && styles.cardSolved]}>
      {/* 1. Top Meta Row: Severity + Acknowledged/Solved + Timestamp + Dots */}
      <View style={styles.topRow}>
        <View style={styles.badgeGroup}>
          <View style={[styles.severityBadge, { backgroundColor: meta.badgeBg }]}>
            {meta.icon}
            <Text style={[styles.severityText, { color: meta.badgeText }]}>
              {meta.label}
            </Text>
          </View>

          {isAcked && !isSolved && (
            <View style={styles.ackBadge}>
              <CheckCircle2 size={12} color="#16A34A" />
              <Text style={styles.ackBadgeText}>ACKNOWLEDGED</Text>
            </View>
          )}

          {isSolved && (
            <View style={styles.solvedBadge}>
              <CheckCircle2 size={12} color="#059669" />
              <Text style={styles.solvedBadgeText}>SOLVED</Text>
            </View>
          )}
        </View>

        <View style={styles.topRight}>
          <View style={styles.timeWrapper}>
            <Clock size={13} color="#64748B" />
            <Text style={styles.timeAgoText}>{timeAgo()}</Text>
          </View>
          <TouchableOpacity
            style={styles.moreBtn}
            onPress={onPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MoreVertical size={16} color="#64748B" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Panel Name */}
      <Text style={styles.panelName} numberOfLines={1}>
        {alert.panel_name || "Unknown Panel"}
      </Text>

      {/* 3. Performance Metric & Value Box */}
      <View style={styles.metricContainer}>
        <View style={styles.metricLeft}>
          <Text style={styles.metricLabel}>PERFORMANCE METRIC</Text>
          <Text style={styles.metricTag} numberOfLines={1}>
            {performanceMetric}
          </Text>
        </View>

        <View style={styles.metricRight}>
          <Text style={styles.metricLabel}>VALUE</Text>
          <Text style={styles.metricValue} numberOfLines={1}>
            {formattedVal}
            {formattedUnit ? (
              <Text style={styles.metricUnit}> {formattedUnit}</Text>
            ) : null}
          </Text>
        </View>
      </View>

      {/* 4. Alert Message */}
      <Text style={styles.messageText} numberOfLines={2}>
        {alert.message}
      </Text>

      {/* 5. Footer: Exact Timestamp & Action Buttons */}
      <View style={styles.footerRow}>
        <View style={styles.dateTimeWrapper}>
          <Calendar size={13} color="#64748B" />
          <Text style={styles.exactTimeText}>{formattedDateTime()}</Text>
        </View>

        <View style={styles.actionGroup}>
          {/* Unacknowledged: Acknowledge button (Text only, no check/tick icon) */}
          {!isAcked && !isSolved && (
            <TouchableOpacity
              onPress={() => onAcknowledgePress(alert)}
              style={styles.ackBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.ackBtnText}>Acknowledge</Text>
            </TouchableOpacity>
          )}

          {/* Acknowledged + Not Solved: Mark as Solved button */}
          {isAcked && !isSolved && (
            <TouchableOpacity
              onPress={() => onMarkAsSolvedPress(alert)}
              style={styles.solvedBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.solvedBtnText}>Mark as Solved</Text>
            </TouchableOpacity>
          )}

          {/* Details Button */}
          <TouchableOpacity
            onPress={onPress}
            style={styles.detailsBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.detailsBtnText}>Details</Text>
            <ChevronRight size={15} color="#2563EB" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
  },
  cardSolved: {
    borderBottomWidth: 3.5,
    borderBottomColor: "#16A34A",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    gap: 4.5,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  ackBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    gap: 4.5,
  },
  ackBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#16A34A",
    letterSpacing: 0.5,
  },
  solvedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    gap: 4.5,
  },
  solvedBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.5,
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4.5,
  },
  timeAgoText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  moreBtn: {
    padding: 2,
  },
  panelName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  metricContainer: {
    flexDirection: "row",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  metricLeft: {
    flex: 1.2,
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
    paddingRight: 12,
  },
  metricRight: {
    flex: 1,
    paddingLeft: 12,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  metricTag: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  messageText: {
    fontSize: 13,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 14,
    fontWeight: "400",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  dateTimeWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  exactTimeText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  actionGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  ackBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  ackBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#2563EB",
  },
  solvedBtn: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#86EFAC",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  solvedBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16A34A",
  },
  detailsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  detailsBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
});
