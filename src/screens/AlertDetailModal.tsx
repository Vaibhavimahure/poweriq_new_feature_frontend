/**
 * AlertDetailModal.tsx — PowerIQ Alert Telemetry Detail Screen
 * ----------------------------------------------------------------------------
 * Closely matching mobile reference screenshot 2:
 *  - Panel name top header with circular close button
 *  - Severity banner with STATUS: OPEN / STATUS: ACKNOWLEDGED
 *  - Two-column cards: PERFORMANCE METRIC & RECORDED VALUE
 *  - Alert Message card
 *  - Origin & Timestamps card
 *  - Acknowledge Alert section with optional operator note & large blue button
 *  - Fetches from backend by alertId if opened from notification tap
 *  - Driven strictly by backend data
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert as RNAlert,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useAlerts } from "../context/AlertContext";
import { alertApi } from "../api/alertApi";
import { formatAlertDetailDate } from "../utils/dateFormatter";
import {
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  Clock,
  Tag,
  Gauge,
  Check,
  MessageSquare,
  User,
  RotateCcw,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AlertItem, isAlertAcknowledged, isAlertSolved, ApplyScope } from "../types/alert";
import {
  getPerformanceMetricName,
  formatAlertValue,
  formatAlertUnit,
  resolveDisplayPanelName,
} from "../utils/metrics";
import { ResolveModal } from "../components/ResolveModal";
import { UnacknowledgeModal } from "../components/UnacknowledgeModal";
import { UnsolveModal } from "../components/UnsolveModal";
import { getLifecycleAlertId, decorateAlertsWithLifecycle } from "../api/lifecycleApi";
import { useCommunication } from "../context/CommunicationContext";
import { AppHeader } from "../components/common/AppHeader";

type Props = NativeStackScreenProps<RootStackParamList, "AlertDetail">;

const isMeaningful = (val: any): boolean =>
  val !== undefined &&
  val !== null &&
  typeof val === "string" &&
  val.trim() !== "" &&
  val.trim() !== "-" &&
  val.trim().toLowerCase() !== "unknown" &&
  val.trim().toLowerCase() !== "null" &&
  val.trim().toLowerCase() !== "undefined";

const mergeAlertDetails = (
  previous: AlertItem | null,
  incoming: AlertItem | null | undefined
): AlertItem | null => {
  if (!incoming) return previous;
  if (!previous) return incoming;

  return {
    ...previous,
    ...incoming,

    // Keep identifiers even if lifecycle/API update is partial
    _id: incoming._id ?? previous._id,
    alert_id: incoming.alert_id ?? previous.alert_id,

    // Keep canonical alert/device information — NEVER overwrite valid previous data with empty or "-"
    panel_name: isMeaningful(incoming.panel_name)
      ? incoming.panel_name
      : isMeaningful(previous.panel_name)
      ? previous.panel_name
      : incoming.panel_name,
    panel_id: isMeaningful(incoming.panel_id)
      ? incoming.panel_id
      : isMeaningful(previous.panel_id)
      ? previous.panel_id
      : incoming.panel_id,
    panel_location: isMeaningful(incoming.panel_location)
      ? incoming.panel_location
      : isMeaningful(previous.panel_location)
      ? previous.panel_location
      : incoming.panel_location,
    device_id: isMeaningful(incoming.device_id)
      ? incoming.device_id
      : isMeaningful(previous.device_id)
      ? previous.device_id
      : incoming.device_id,

    // Keep metric information
    tag_name: isMeaningful(incoming.tag_name)
      ? incoming.tag_name
      : isMeaningful(previous.tag_name)
      ? previous.tag_name
      : incoming.tag_name,
    metric_key: isMeaningful(incoming.metric_key)
      ? incoming.metric_key
      : isMeaningful(previous.metric_key)
      ? previous.metric_key
      : incoming.metric_key,

    // Keep recorded value
    alert_value:
      incoming.alert_value !== undefined && incoming.alert_value !== null
        ? incoming.alert_value
        : previous.alert_value,

    unit: isMeaningful(incoming.unit)
      ? incoming.unit
      : isMeaningful(previous.unit)
      ? previous.unit
      : incoming.unit,

    // Keep display information
    message: isMeaningful(incoming.message)
      ? incoming.message
      : isMeaningful(previous.message)
      ? previous.message
      : incoming.message,
    severity: isMeaningful(incoming.severity)
      ? incoming.severity
      : isMeaningful(previous.severity)
      ? previous.severity
      : incoming.severity,

    // Keep original timestamps
    ts: incoming.ts ?? previous.ts,
    createdAt: incoming.createdAt ?? previous.createdAt,

    // Keep solved-by lifecycle data
    // Keep solved lifecycle data
solved_user_name:
  incoming.solved_user_name ??
  previous.solved_user_name,

solved_user:
  incoming.solved_user ??
  previous.solved_user,

solved_by:
  incoming.solved_by ??
  previous.solved_by,

clear_user:
  incoming.clear_user ??
  previous.clear_user,
  
solved_ts:
  incoming.solved_ts ??
  previous.solved_ts,

clear_ts:
  incoming.clear_ts ??
  previous.clear_ts,
  };
};

const getResolvedByName = (alert?: AlertItem | null): string => {
  if (!alert) return "Not specified";

  const candidates = [
    alert.solved_user_name,
    alert.solved_user,
    alert.solved_by && alert.solved_by.toLowerCase() === "system"
      ? "System"
      : alert.solved_by,
    alert.clear_user,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed && trimmed.toLowerCase() !== "operator") {
        if (trimmed.toLowerCase() === "system") {
          return "System";
        }
        return trimmed;
      }
    }
  }

  return "Not specified";
};




export const AlertDetailModal: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { alert: initialAlert, alertId } = route.params;
  const {
    acknowledgeAlert,
    unacknowledgeAlert,
    acknowledgeAlertWithScope,
    unacknowledgeAlertWithScope,
    resolveAlertWithScope,
    unsolveAlertWithScope,
    alerts,
  } = useAlerts();

  const targetId = initialAlert?._id || initialAlert?.alert_id || alertId || "";

  // Check if we have it in central alerts state
  const foundAlert = alerts.find(
    (a) => (a._id || a.alert_id) === targetId
  );

 const [currentAlert, setCurrentAlert] = useState<AlertItem | null>(() =>
  mergeAlertDetails(initialAlert || null, foundAlert)
);
 const [isLoadingBackend, setIsLoadingBackend] = useState<boolean>(
  !initialAlert && !foundAlert && Boolean(targetId)
);
  const [note, setNote] = useState("");
  const [isAcking, setIsAcking] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [isUnackModalOpen, setIsUnackModalOpen] = useState(false);
  const [isUnsolveModalOpen, setIsUnsolveModalOpen] = useState(false);

  const { discussions } = useCommunication();
  const [isOpeningDiscussion, setIsOpeningDiscussion] = useState(false);

  const handleDiscuss = () => {
    if (!currentAlert) return;
    const alertIdVal = String(currentAlert._id || currentAlert.alert_id || "");
    if (!alertIdVal) return;

    // 1. If discussion already exists for this alert, open chat directly
    const existing = discussions.find((d) => d.alertId === alertIdVal);
    if (existing) {
      navigation.navigate("DiscussionChat", {
        discussionId: existing._id,
        title: existing.title,
        alertId: alertIdVal,
        alert: currentAlert,
      });
      return;
    }

    // 2. Otherwise open StartDiscussion screen (Mockup 4)
    navigation.navigate("StartDiscussion", {
      alertId: alertIdVal,
      alert: currentAlert,
    });
  };

  useEffect(() => {
    if (!targetId) {
      setIsLoadingBackend(false);
      return;
    }

    let cancelled = false;

    alertApi
      .getAlertById(targetId)
      .then(async (fetched) => {
        if (!cancelled && fetched) {
          try {
            const [decorated] = await decorateAlertsWithLifecycle([fetched]);
            if (!cancelled) {
              setCurrentAlert((prev) =>
                mergeAlertDetails(prev, decorated || fetched)
              );
            }
          } catch {
            if (!cancelled) {
              setCurrentAlert((prev) =>
                mergeAlertDetails(prev, fetched)
              );
            }
          }
        }
      })
      .catch((err) => {
        console.warn(
          "[AlertDetailModal] Error fetching alert:",
          err?.message
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingBackend(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [targetId]);

  useEffect(() => {
    if (!foundAlert) return;

    setCurrentAlert((prev) =>
      mergeAlertDetails(prev, foundAlert)
    );
  }, [foundAlert]);

  if (isLoadingBackend || !currentAlert) {
    return (
      <View style={[styles.container, styles.loadingCenter, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading alert details...</Text>
      </View>
    );
  }

  const severity = (currentAlert.severity || "info").toLowerCase();
  const isSolved = isAlertSolved(currentAlert);
  const isAcked = isAlertAcknowledged(currentAlert) && !isSolved;
  const isOpen = !isAcked && !isSolved;

  const getSeverityMeta = () => {
    switch (severity) {
      case "critical":
        return {
          color: "#DC2626",
          bg: "#FEF2F2",
          border: "#FEE2E2",
          iconBg: "#DC2626",
          icon: <AlertCircle size={15} color="#FFFFFF" />,
          label: "CRITICAL ALERT",
          statusBg: "#FEE2E2",
          statusText: "#DC2626",
        };
      case "warning":
        return {
          color: "#D97706",
          bg: "#FFFBEB",
          border: "#FEF3C7",
          iconBg: "#D97706",
          icon: <AlertTriangle size={15} color="#FFFFFF" />,
          label: "WARNING ALERT",
          statusBg: "#FEF3C7",
          statusText: "#D97706",
        };
      default:
        return {
          color: "#2563EB",
          bg: "#EFF6FF",
          border: "#DBEAFE",
          iconBg: "#2563EB",
          icon: <Info size={15} color="#FFFFFF" />,
          label: "INFO TELEMETRY",
          statusBg: "#DBEAFE",
          statusText: "#2563EB",
        };
    }
  };

  const meta = getSeverityMeta();

  const formatDate = (dateStr?: string | Date | null) => {
    return formatAlertDetailDate(dateStr);
  };

  const handleAcknowledge = async () => {
    if (!currentAlert || isAcking) return;

    setIsAcking(true);

    try {
      const result = await acknowledgeAlertWithScope(
        getLifecycleAlertId(currentAlert),
        "this",
        note.trim() || undefined,
        currentAlert
      );

      const lifecycle = result?.selected_state;
      if (lifecycle) {
        setCurrentAlert((prev) =>
          mergeAlertDetails(prev, {
            ...prev,
            ...lifecycle,
            status: "acknowledged",
            ack_user: lifecycle.ack_user || lifecycle.ack_user_name || (prev?.ack_user || "Operator"),
            ack_user_name: lifecycle.ack_user_name || (prev?.ack_user || "Operator"),
            ack_ts: lifecycle.ack_ts || new Date().toISOString(),
            ack_note: lifecycle.ack_note || note.trim() || undefined,
            acknowledged: true,
          } as AlertItem)
        );
      } else {
        const legacyId = String(currentAlert._id || currentAlert.alert_id || "");
        const refreshed = await alertApi.getAlertById(legacyId).catch(() => null);
        if (refreshed) {
          setCurrentAlert((prev) => mergeAlertDetails(prev, refreshed));
        } else {
          setCurrentAlert((prev) =>
            prev
              ? {
                  ...prev,
                  status: "acknowledged",
                  acknowledged: true,
                  ack_note: note.trim() || undefined,
                }
              : null
          );
        }
      }

      setNote("");

      RNAlert.alert(
        "Success",
        "Alert has been acknowledged successfully."
      );
    } catch (err: any) {
      RNAlert.alert(
        "Error",
        err?.message ||
        "Failed to acknowledge alert"
      );
    } finally {
      setIsAcking(false);
    }
  };

  const handleUnacknowledge = async () => {
    if (!currentAlert || isAcking) return;

    setIsAcking(true);

    try {
      const result = await unacknowledgeAlertWithScope(
        getLifecycleAlertId(currentAlert),
        "this",
        "",
        currentAlert
      );

      const lifecycle = result?.selected_state;
      if (lifecycle) {
        setCurrentAlert((prev) =>
          mergeAlertDetails(prev, {
            ...prev,
            ...lifecycle,
            status: "open",
            acknowledged: false,
            ack_user: null,
            ack_user_id: null,
            ack_ts: null,
            ack_note: null,
            bulk_ack_status: null,
            bulk_ack_user_id: null,
            bulk_ts: null,
          } as AlertItem)
        );
      } else {
        const legacyId = String(currentAlert._id || currentAlert.alert_id || "");
        const refreshed = await alertApi.getAlertById(legacyId).catch(() => null);
        if (refreshed) {
          setCurrentAlert((prev) => mergeAlertDetails(prev, refreshed));
        } else {
          setCurrentAlert((prev) =>
            prev
              ? {
                  ...prev,
                  status: "open",
                  acknowledged: false,
                  ack_user: null,
                  ack_user_id: null,
                  ack_ts: null,
                  ack_note: null,
                  bulk_ack_status: null,
                  bulk_ack_user_id: null,
                  bulk_ts: null,
                }
              : null
          );
        }
      }

      RNAlert.alert(
        "Success",
        "Alert has been unacknowledged."
      );
    } catch (err: any) {
      RNAlert.alert(
        "Error",
        err?.message ||
        "Failed to unacknowledge alert"
      );
    } finally {
      setIsAcking(false);
    }
  };

  const handleConfirmResolve = async (scope: ApplyScope, resolutionNote: string) => {
    if (!currentAlert) return;
    const result = await resolveAlertWithScope(
      getLifecycleAlertId(currentAlert),
      scope,
      resolutionNote,
      currentAlert
    );
    const lifecycle = result?.selected_state;
    if (lifecycle) {
      setCurrentAlert((prev) =>
        mergeAlertDetails(prev, {
          ...prev,
          ...lifecycle,
          status: "cleared",

          is_cleared: true,
          solved: true,
          clear_user: lifecycle.solved_user || lifecycle.solved_by || "Operator",
          clear_ts: lifecycle.solved_ts || new Date().toISOString(),
          solved_ts: lifecycle.solved_ts || new Date().toISOString(),
          clear_note: lifecycle.solve_reason || resolutionNote || undefined,
        } as AlertItem)
      );
    } else {
      const legacyId = String(currentAlert._id || currentAlert.alert_id || "");
      const refreshed = await alertApi.getAlertById(legacyId).catch(() => null);
      if (refreshed) {
        setCurrentAlert((prev) => mergeAlertDetails(prev, refreshed));
      } else {
        setCurrentAlert((prev) => (prev ? { ...prev, is_cleared: true, status: "cleared", solved: true } : null));
      }
    }
    RNAlert.alert("Success", "Alert has been resolved and marked as solved.");
  };

  const handleConfirmUnack = async (scope: ApplyScope, reason: string) => {
    if (!currentAlert) return;
    const result = await unacknowledgeAlertWithScope(
      getLifecycleAlertId(currentAlert),
      scope,
      reason,
      currentAlert
    );
    const lifecycle = result?.selected_state;
    if (lifecycle) {
      setCurrentAlert((prev) =>
        mergeAlertDetails(prev, {
          ...prev,
          ...lifecycle,
          status: "open",
          acknowledged: false,
          ack_user: null,
          ack_user_id: null,
          ack_ts: null,
          ack_note: null,
          bulk_ack_status: null,
          bulk_ack_user_id: null,
          bulk_ts: null,
        } as AlertItem)
      );
    } else {
      const legacyId = String(currentAlert._id || currentAlert.alert_id || "");
      const refreshed = await alertApi.getAlertById(legacyId).catch(() => null);
      if (refreshed) {
        setCurrentAlert((prev) => mergeAlertDetails(prev, refreshed));
      } else {
        setCurrentAlert((prev) =>
          prev
            ? {
                ...prev,
                status: "open",
                acknowledged: false,
                ack_user: null,
                ack_user_id: null,
                ack_ts: null,
                ack_note: null,
                bulk_ack_status: null,
                bulk_ack_user_id: null,
                bulk_ts: null,
              }
            : null
        );
      }
    }
    RNAlert.alert("Success", "Alert has been unacknowledged.");
  };

  const handleConfirmUnsolve = async (scope: ApplyScope, reason: string) => {
    if (!currentAlert) return;
    const result = await unsolveAlertWithScope(
      getLifecycleAlertId(currentAlert),
      scope,
      reason,
      currentAlert
    );
    const lifecycle = result?.selected_state;
    if (lifecycle) {
      setCurrentAlert((prev) =>
        mergeAlertDetails(prev, {
          ...prev,
          ...lifecycle,
          status: lifecycle.acknowledged ? "acknowledged" : "open",
          acknowledged: Boolean(lifecycle.acknowledged),
          is_cleared: false,
          solved: false,
          clear_user: null,
          clear_ts: null,
          clear_note: null,
        } as AlertItem)
      );
    } else {
      const legacyId = String(currentAlert._id || currentAlert.alert_id || "");
      const refreshed = await alertApi.getAlertById(legacyId).catch(() => null);
      if (refreshed) {
        setCurrentAlert((prev) => mergeAlertDetails(prev, refreshed));
      } else {
        setCurrentAlert((prev) =>
          prev
            ? {
                ...prev,
                status: "open",
                is_cleared: false,
                solved: false,
                clear_user: null,
                clear_ts: null,
                clear_note: null,
              }
            : null
        );
      }
    }
    RNAlert.alert("Success", "Alert has been marked as unsolved / reopened.");
  };



  const performanceMetric = getPerformanceMetricName(currentAlert.tag_name);
  const formattedVal = formatAlertValue(currentAlert.alert_value);
  const formattedUnit = formatAlertUnit(currentAlert.unit, currentAlert.tag_name);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      {/* App Header */}
      <AppHeader title={resolveDisplayPanelName(currentAlert, null) || "Alert Details"} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Two-Column Cards: PERFORMANCE METRIC & RECORDED VALUE */}
        <View style={styles.twoColumnRow}>
          {/* Left Card: Performance Metric */}
          <View style={styles.columnCard}>
            <View style={styles.cardHeaderRow}>
              <Tag size={15} color="#2563EB" />
              <Text style={styles.cardHeaderLabel}>PERFORMANCE METRIC</Text>
            </View>
            <Text style={styles.columnCardValue}>
              {performanceMetric}
            </Text>
          </View>

          {/* Right Card: Recorded Value */}
          <View style={styles.columnCard}>
            <View style={styles.cardHeaderRow}>
              <Gauge size={15} color="#2563EB" />
              <Text style={styles.cardHeaderLabel}>RECORDED VALUE</Text>
            </View>
            <Text style={styles.columnCardValue}>
              {formattedVal}
              {formattedUnit ? <Text style={styles.unitText}> {formattedUnit}</Text> : null}
            </Text>
          </View>
        </View>

        {/* 4. Alert Message Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <MessageSquare size={15} color="#2563EB" />
            <Text style={styles.cardHeaderLabel}>ALERT MESSAGE</Text>
          </View>
          <Text style={styles.alertMessageText}>{currentAlert.message}</Text>
        </View>

        {/* 5. Origin & Timestamps Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Clock size={15} color="#2563EB" />
            <Text style={styles.cardHeaderLabel}>ORIGIN & TIMESTAMPS</Text>
          </View>

          <View style={styles.infoTable}>
            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Telemetry Timestamp (ts):</Text>
              <Text style={styles.infoVal}>{formatDate(currentAlert.ts)}</Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoKey}>Created in DB:</Text>
              <Text style={styles.infoVal}>{formatDate(currentAlert.createdAt)}</Text>
            </View>
          </View>
        </View>

        {/* 6. Action Section */}
        {isOpen && (
          <View style={styles.card}>
            <View style={styles.ackSectionHeader}>
              <User size={18} color="#2563EB" />
              <Text style={styles.ackSectionTitle}>Acknowledge Alert</Text>
            </View>
            <Text style={styles.ackSectionSubtitle}>
              Confirm you have reviewed this alert by submitting an acknowledgement.
            </Text>

            <TextInput
              style={styles.noteInput}
              placeholder="Add optional operator note (e.g. Dispatched technician to Chiller)..."
              placeholderTextColor="#94A3B8"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.actionBtnRow}>
              <TouchableOpacity
                onPress={handleAcknowledge}
                disabled={isAcking}
                style={[styles.acknowledgeButton, isAcking && styles.buttonDisabled, { flex: 1 }]}
                activeOpacity={0.88}
              >
                {isAcking ? (
                  <ActivityIndicator color="#2563EB" />
                ) : (
                  <Text style={styles.acknowledgeButtonText}>Acknowledge</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDiscuss}
                disabled={isOpeningDiscussion}
                style={[styles.discussButton, { flex: 1 }]}
                activeOpacity={0.88}
              >
                {isOpeningDiscussion ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <MessageSquare size={16} color="#FFFFFF" />
                    <Text style={styles.discussButtonText}>Discuss</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {isAcked && !isSolved && (
          <View style={styles.card}>
            <View style={styles.ackSectionHeader}>
              <Check size={18} color="#16A34A" strokeWidth={2.5} />
              <Text style={[styles.ackSectionTitle, { color: "#16A34A" }]}>
                Alert Acknowledged
              </Text>
            </View>

            <View style={styles.infoTable}>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Acknowledged By:</Text>
                <Text style={styles.infoVal}>
                  {currentAlert.ack_user || "Operator"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Acknowledged At:</Text>
                <Text style={styles.infoVal}>{formatDate(currentAlert.ack_ts)}</Text>
              </View>

              {currentAlert.ack_note ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Operator Note:</Text>
                  <Text style={styles.infoVal}>{currentAlert.ack_note}</Text>
                </View>
              ) : null}
            </View>

            {/* Mark as Solved Button */}
            <TouchableOpacity
              onPress={() => setIsResolveModalOpen(true)}
              style={styles.markSolvedBtn}
              activeOpacity={0.88}
            >
              <Text style={styles.markSolvedBtnText}>Mark as Solved</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsUnackModalOpen(true)}
              disabled={isAcking}
              style={styles.unackButton}
              activeOpacity={0.8}
            >
              <RotateCcw size={15} color="#475569" />
              <Text style={styles.unackButtonText}>Unacknowledge Alert</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDiscuss}
              disabled={isOpeningDiscussion}
              style={styles.discussSecondaryButton}
              activeOpacity={0.88}
            >
              {isOpeningDiscussion ? (
                <ActivityIndicator color="#2563EB" />
              ) : (
                <>
                  <MessageSquare size={15} color="#2563EB" />
                  <Text style={styles.discussSecondaryButtonText}>Discuss Alert</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {isSolved && (
          <View style={styles.card}>
            <View style={styles.ackSectionHeader}>
              <Check size={18} color="#059669" strokeWidth={2.5} />
              <Text style={[styles.ackSectionTitle, { color: "#059669" }]}>
                Alert Solved / Resolved
              </Text>
            </View>

            <View style={styles.infoTable}>
              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Resolved By:</Text>
                <Text style={styles.infoVal}>
                  {getResolvedByName(currentAlert)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoKey}>Resolved At:</Text>
                {/* <Text style={styles.infoVal}>{formatDate(currentAlert.clear_ts)}</Text> */}
                <Text style={styles.infoVal}>
  {formatDate(
    currentAlert.solved_ts ||
    currentAlert.clear_ts
  )}
</Text>

              </View>

              {currentAlert.clear_note ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoKey}>Resolution Note:</Text>
                  <Text style={styles.infoVal}>{currentAlert.clear_note}</Text>
                </View>
              ) : null}
            </View>

            {/* Reopen / Mark as Unsolved Button */}
            <TouchableOpacity
              onPress={() => setIsUnsolveModalOpen(true)}
              style={styles.unsolveButton}
              activeOpacity={0.8}
            >
              <RotateCcw size={15} color="#475569" />
              <Text style={styles.unsolveButtonText}>Reopen / Mark as Unsolved</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDiscuss}
              disabled={isOpeningDiscussion}
              style={styles.discussSecondaryButton}
              activeOpacity={0.88}
            >
              {isOpeningDiscussion ? (
                <ActivityIndicator color="#2563EB" />
              ) : (
                <>
                  <MessageSquare size={15} color="#2563EB" />
                  <Text style={styles.discussSecondaryButtonText}>Discuss Alert</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Resolve Modal */}
      <ResolveModal
        visible={isResolveModalOpen}
        alert={currentAlert}
        onClose={() => setIsResolveModalOpen(false)}
        onConfirm={handleConfirmResolve}
      />

      {/* Unacknowledge Modal */}
      <UnacknowledgeModal
        visible={isUnackModalOpen}
        alert={currentAlert}
        onClose={() => setIsUnackModalOpen(false)}
        onConfirm={handleConfirmUnack}
      />

      {/* Unsolve Modal */}
      <UnsolveModal
        visible={isUnsolveModalOpen}
        alert={currentAlert}
        onClose={() => setIsUnsolveModalOpen(false)}
        onConfirm={handleConfirmUnsolve}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F6",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 34, // balances close button width
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
    maxWidth: "85%",
  },
  severitySmallIcon: {
    marginTop: 1,
  },
  unsolveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 44,
    borderRadius: 10,
    marginTop: 12,
  },
  unsolveButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  severityBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  severityLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  severityIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  severityBannerText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusChipAck: {
    backgroundColor: "#DCFCE7",
    borderColor: "#BBF7D0",
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  statusChipTextAck: {
    color: "#16A34A",
  },
  statusChipSolved: {
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
  statusChipTextSolved: {
    color: "#059669",
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 12,
  },
  columnCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  cardHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  columnCardValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 22,
  },
  unitText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  alertMessageText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 22,
  },
  infoTable: {
    gap: 10,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  infoKey: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  infoVal: {
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "800",
  },
  ackSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  ackSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  ackSectionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 14,
    lineHeight: 18,
  },
  noteInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    color: "#0F172A",
    minHeight: 76,
    marginBottom: 14,
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#2563EB",
    height: 48,
    borderRadius: 10,
    gap: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acknowledgeButtonText: {
    color: "#2563EB",
    fontSize: 15,
    fontWeight: "700",
  },
  unackButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 12,
  },
  unackButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
  },
  markSolvedBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#16A34A",
    height: 46,
    borderRadius: 10,
    marginTop: 14,
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  }, 
  markSolvedBtnText: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  discussButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    height: 48,
    borderRadius: 10,
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  discussButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  discussSecondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    height: 44,
    borderRadius: 10,
    gap: 8,
    marginTop: 10,
  },
  discussSecondaryButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#2563EB",
  },
});
