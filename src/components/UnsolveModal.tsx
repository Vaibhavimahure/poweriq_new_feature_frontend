import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AlertItem, ApplyScope } from "../types/alert";
import { getPerformanceMetricName, formatAlertValue, formatAlertUnit, resolveDisplayPanelName } from "../utils/metrics";
import { X, AlertCircle, AlertTriangle, Info, RotateCcw } from "lucide-react-native";
import { previewLifecycleAction, LifecycleActionPreviewResult } from "../api/lifecycleApi";
import { LifecyclePreviewCard } from "./LifecyclePreviewCard";

interface Props {
  visible: boolean;
  alert: AlertItem | null;
  onClose: () => void;
  onConfirm: (scope: ApplyScope, note: string) => Promise<void>;
}

export const UnsolveModal: React.FC<Props> = ({
  visible,
  alert,
  onClose,
  onConfirm,
}) => {
  const [note, setNote] = useState("");
  const [scope, setScope] = useState<ApplyScope>("this");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<LifecycleActionPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setNote("");
      setScope("this");
      setErrorMessage(null);
      setIsSubmitting(false);
      setPreview(null);
      setPreviewError(null);
    }
  }, [visible, alert]);

  // Live action preview from backend
  const fetchPreview = useCallback(() => {
    if (!visible || !alert) return;
    setIsPreviewLoading(true);
    setPreviewError(null);

    previewLifecycleAction(alert, "unsolve", scope)
      .then((res) => {
        setPreview(res);
      })
      .catch((err) => {
        setPreview(null);
        setPreviewError(err?.message || "Unable to load matching alert preview.");
      })
      .finally(() => {
        setIsPreviewLoading(false);
      });
  }, [visible, alert, scope]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  if (!alert) return null;

  const severity = (alert.severity || "info").toLowerCase();

  const getSeverityBadge = () => {
    switch (severity) {
      case "critical":
        return {
          bg: "#FEE2E2",
          text: "#DC2626",
          icon: <AlertCircle size={12} color="#DC2626" />,
          label: "CRITICAL",
        };
      case "warning":
        return {
          bg: "#FEF3C7",
          text: "#D97706",
          icon: <AlertTriangle size={12} color="#D97706" />,
          label: "WARNING",
        };
      default:
        return {
          bg: "#DBEAFE",
          text: "#2563EB",
          icon: <Info size={12} color="#2563EB" />,
          label: "INFO",
        };
    }
  };

  const badge = getSeverityBadge();
  const metricName = getPerformanceMetricName(alert.tag_name);
  const formattedVal = formatAlertValue(alert.alert_value);
  const formattedUnit = formatAlertUnit(alert.unit, alert.tag_name);

  const isEligible = preview ? (preview.eligible_alerts ?? 0) > 0 : true;
  const isNoteProvided = note.trim().length > 0;
  const canSubmit = !isSubmitting && !isPreviewLoading && isEligible && isNoteProvided;

  const handleSubmit = async () => {
    if (!note.trim()) {
      setErrorMessage("Please enter a reason for reopening.");
      return;
    }
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(scope, note.trim());
      onClose();
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to reopen alert. Please try again.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scopes: { id: ApplyScope; label: string; desc: string }[] = [
    { id: "this", label: "This Alert", desc: "Reopen only this selected alert" },
    { id: "today", label: "Today", desc: "Reopen alerts from today" },
    { id: "week", label: "Last 1 Week", desc: "Reopen alerts from the past 7 days" },
    { id: "all_prev", label: "All Previous", desc: "Reopen all previous alerts" },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isSubmitting) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={styles.modalTitle}>Mark as Unsolved</Text>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              style={styles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Dynamic Alert Summary Box */}
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Panel:</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {resolveDisplayPanelName(alert, preview)}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Performance Metric:</Text>
                <Text style={styles.summaryValue} numberOfLines={1}>
                  {metricName}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Alert Value:</Text>
                <Text style={styles.summaryValueHighlight}>
                  {formattedVal} {formattedUnit}
                </Text>
              </View>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Severity:</Text>
                <View style={[styles.severityPill, { backgroundColor: badge.bg }]}>
                  {badge.icon}
                  <Text style={[styles.severityPillText, { color: badge.text }]}>
                    {badge.label}
                  </Text>
                </View>
              </View>
            </View>

            {/* Error Banner if API fails */}
            {errorMessage && (
              <View style={styles.errorBox}>
                <AlertCircle size={15} color="#DC2626" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            {/* Reason Textarea */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Reason for Reopening <Text style={styles.requiredAsterisk}>*</Text>
              </Text>
              <TextInput
                style={styles.textarea}
                placeholder="Add reason for marking as unsolved/reopening..."
                placeholderTextColor="#94A3B8"
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!isSubmitting}
              />
            </View>

            {/* Apply to Radio Selector */}
            <View style={styles.scopeSection}>
              <Text style={styles.inputLabel}>Apply to:</Text>
              <View style={styles.scopeList}>
                {scopes.map((item) => {
                  const isSelected = scope === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.scopeItem, isSelected && styles.scopeItemActive]}
                      onPress={() => setScope(item.id)}
                      activeOpacity={0.7}
                      disabled={isSubmitting}
                    >
                      <View
                        style={[styles.radioCircle, isSelected && styles.radioCircleActive]}
                      >
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                      <View style={styles.scopeTextGroup}>
                        <Text
                          style={[styles.scopeLabel, isSelected && styles.scopeLabelActive]}
                        >
                          {item.label}
                        </Text>
                        <Text style={styles.scopeDesc}>{item.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Lifecycle Impact Preview */}
              <LifecyclePreviewCard
                loading={isPreviewLoading}
                error={previewError}
                preview={preview}
                onRetry={fetchPreview}
              />
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSubmitting}
              style={styles.cancelBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={[
                styles.confirmBtn,
                !canSubmit && styles.btnDisabled,
              ]}
              activeOpacity={0.88}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Mark as Unsolved</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxHeight: "88%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  closeBtn: {
    padding: 4,
  },
  summaryBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 12.5,
    color: "#64748B",
    fontWeight: "500",
  },
  summaryValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F172A",
    maxWidth: "60%",
    textAlign: "right",
  },
  summaryValueHighlight: {
    fontSize: 13,
    fontWeight: "800",
    color: "#2563EB",
  },
  severityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  severityPillText: {
    fontSize: 11,
    fontWeight: "800",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    flex: 1,
    fontWeight: "500",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  requiredAsterisk: {
    color: "#DC2626",
    fontWeight: "800",
  },
  textarea: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: "#0F172A",
    minHeight: 74,
  },
  scopeSection: {
    marginBottom: 16,
  },
  scopeList: {
    gap: 8,
    marginTop: 4,
  },
  scopeItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  scopeItemActive: {
    borderColor: "#475569",
    backgroundColor: "#F1F5F9",
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleActive: {
    borderColor: "#475569",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#475569",
  },
  scopeTextGroup: {
    flex: 1,
  },
  scopeLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  scopeLabelActive: {
    color: "#0F172A",
  },
  scopeDesc: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 1,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 44,
    borderRadius: 10,
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flex: 1.4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#475569",
    height: 44,
    borderRadius: 10,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
