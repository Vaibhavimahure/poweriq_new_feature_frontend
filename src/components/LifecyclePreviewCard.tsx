/**
 * LifecyclePreviewCard.tsx — PowerIQ Alert Lifecycle Preview Card
 * ----------------------------------------------------------------------------
 * Displays live impact preview from the deployed Telemetry Lifecycle service:
 *   - Live matching & eligible alert counts (backend source of truth)
 *   - Proper singular/plural: "1 matching alert · 1 eligible" vs "X matching alerts · Y eligible"
 *   - Standardized subtext: "Same panel + same metric + same severity, up to the selected alert timestamp."
 *   - Loading state: "Checking matching alerts..." with spinner
 *   - Error state: "Unable to load matching alert preview." with Retry action
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { Info, AlertCircle, RotateCcw, AlertTriangle } from "lucide-react-native";
import { LifecycleActionPreviewResult } from "../api/lifecycleApi";

interface Props {
  loading: boolean;
  error: string | null;
  preview: LifecycleActionPreviewResult | null;
  onRetry: () => void;
}

export const LifecyclePreviewCard: React.FC<Props> = ({
  loading,
  error,
  preview,
  onRetry,
}) => {
  if (loading) {
    return (
      <View style={styles.cardContainer}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Checking matching alerts...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.cardContainer, styles.cardError]}>
        <View style={styles.errorContent}>
          <View style={styles.errorRow}>
            <AlertCircle size={15} color="#DC2626" />
            <Text style={styles.errorText}>Unable to load matching alert preview.</Text>
          </View>
          <TouchableOpacity
            onPress={onRetry}
            style={styles.retryBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <RotateCcw size={12} color="#DC2626" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!preview) {
    return null;
  }

  const matching = Number(preview.matching_alerts ?? 0);
  const eligible = Number(preview.eligible_alerts ?? 0);
  const blockedUnack = Number(preview.blocked_unacknowledged ?? 0);

  const matchingText = `${matching} matching alert${matching === 1 ? "" : "s"}`;
  const eligibleText = `${eligible} eligible for this action`;
  const isZeroEligible = eligible === 0;

  return (
    <View style={[styles.cardContainer, isZeroEligible && styles.cardWarning]}>
      <View style={styles.headerRow}>
        {isZeroEligible ? (
          <AlertTriangle size={15} color="#D97706" style={styles.infoIcon} />
        ) : (
          <Info size={15} color="#2563EB" style={styles.infoIcon} />
        )}
        <Text style={[styles.primaryCountText, isZeroEligible && styles.warningCountText]}>
          {matchingText} · {eligibleText}
        </Text>
      </View>

      <Text style={styles.scopeDescriptionText}>
        Same panel + same metric + same severity, up to the selected alert timestamp.
      </Text>

      {preview.action === "solve" && blockedUnack > 0 && (
        <Text style={styles.blockedText}>
          {blockedUnack} matching alert{blockedUnack === 1 ? "" : "s"} cannot be solved because they are not acknowledged.
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
    marginBottom: 16,
  },
  cardWarning: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  cardError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  loadingText: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
  },
  errorContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  errorText: {
    fontSize: 12.5,
    color: "#DC2626",
    fontWeight: "600",
    flex: 1,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryBtnText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#DC2626",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  infoIcon: {
    marginTop: 0.5,
  },
  primaryCountText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E40AF",
    flex: 1,
  },
  warningCountText: {
    color: "#B45309",
  },
  scopeDescriptionText: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 4,
    lineHeight: 16,
  },
  blockedText: {
    fontSize: 11.5,
    color: "#D97706",
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 16,
  },
});
