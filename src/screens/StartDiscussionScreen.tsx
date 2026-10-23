import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Platform,
  Alert as RNAlert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import {
  ArrowLeft,
  Search,
  Check,
  AlertCircle,
  AlertTriangle,
  Info,
  Users,
  Factory,
} from "lucide-react-native";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { useCommunication } from "../context/CommunicationContext";
import { communicationApi } from "../api/communicationApi";
import { alertApi } from "../api/alertApi";
import { DiscussionParticipant } from "../types/communication";
import { AlertItem } from "../types/alert";
import { AppHeader } from "../components/common/AppHeader";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "StartDiscussion">;
  route: RouteProp<RootStackParamList, "StartDiscussion">;
}

export const StartDiscussionScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { startAlertDiscussion, startPlantDiscussion } = useCommunication();
  const { alertId, alert } = route.params || {};

  const [alertData, setAlertData] = useState<AlertItem | undefined>(alert);
  const isAlertDiscussion = Boolean(alertId || alert || alertData);

  // Form fields
  const [title, setTitle] = useState(
    alert ? `${alert.panel_name} - ${alert.tag_name}` : ""
  );
  const [description, setDescription] = useState(alert?.message || "");

  useEffect(() => {
    if (!alertData && alertId) {
      alertApi
        .getAlertById(alertId)
        .then((fetched) => {
          if (fetched) {
            setAlertData(fetched);
            if (!title) {
              setTitle(`${fetched.panel_name || "Panel"} - ${fetched.tag_name || "Parameter"}`);
            }
            if (!description) {
              setDescription(fetched.message || "");
            }
          }
        })
        .catch((e) => {
          console.warn("[StartDiscussion] Could not fetch alert details:", e?.message);
        });
    }
  }, [alertId]);
  const [searchUser, setSearchUser] = useState("");
  const [allUsers, setAllUsers] = useState<DiscussionParticipant[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<DiscussionParticipant[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadDirectory() {
      setIsLoadingUsers(true);
      try {
        const users = await communicationApi.searchParticipants();
        if (isMounted && Array.isArray(users) && users.length > 0) {
          setAllUsers(users);
        }
      } catch (err) {
        console.warn("[StartDiscussionScreen] Error loading real users:", err);
      } finally {
        if (isMounted) setIsLoadingUsers(false);
      }
    }
    loadDirectory();
    return () => {
      isMounted = false;
    };
  }, []);

  const toggleParticipant = (participant: DiscussionParticipant) => {
    const exists = selectedParticipants.some((p) => p.userId === participant.userId);
    if (exists) {
      setSelectedParticipants((prev) =>
        prev.filter((p) => p.userId !== participant.userId)
      );
    } else {
      setSelectedParticipants((prev) => [...prev, participant]);
    }
  };

  const effectiveAlert = alert || alertData;

  const handleStart = async () => {
    if (isAlertDiscussion) {
      const targetAlertId = alertId || alert?._id || alert?.alert_id || alertData?._id;
      if (!targetAlertId) {
        const msg = "Alert ID is missing. Cannot start alert discussion.";
        if (Platform.OS === "web") window.alert(msg);
        else RNAlert.alert("Discussion", msg);
        return;
      }

      const alertContext = {
        panelName:
          effectiveAlert?.panel_name ||
          title ||
          `Alert #${String(targetAlertId).slice(-6)}`,
        tagName: effectiveAlert?.tag_name || "Parameter Alert",
        severity: (effectiveAlert?.severity || "critical").toLowerCase(),
        value:
          typeof effectiveAlert?.alert_value === "number"
            ? effectiveAlert.alert_value
            : null,
        unit: effectiveAlert?.unit || "",
        plantName: effectiveAlert?.plant_id || "Plant Utility",
        deviceId: effectiveAlert?.device_id || null,
        message:
          effectiveAlert?.message ||
          description ||
          `Alert discussion for #${targetAlertId}`,
      };

      setIsSubmitting(true);
      try {
        const disc = await startAlertDiscussion(
          String(targetAlertId),
          selectedParticipants,
          alertContext
        );

        const resolvedId =
          disc?._id ||
          (disc as any)?.data?._id ||
          (disc as any)?.discussion?._id;
        const resolvedTitle =
          disc?.title ||
          (disc as any)?.data?.title ||
          (disc as any)?.discussion?.title ||
          alertContext.panelName;
        const resolvedAlertId =
          disc?.alertId ||
          (disc as any)?.data?.alertId ||
          String(targetAlertId);

        if (!resolvedId) {
          throw new Error("Could not resolve discussion identifier from server response.");
        }

        navigation.replace("DiscussionChat", {
          discussionId: resolvedId,
          title: resolvedTitle,
          alertId: resolvedAlertId,
          alert: alertData || undefined,
        });
      } catch (err: any) {
        console.error("[StartDiscussionScreen] Failed to start alert discussion:", err);
        const errMsg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to start discussion. Please check your connection and try again.";
        if (Platform.OS === "web") {
          window.alert(`Discussion Error:\n${errMsg}`);
        } else {
          RNAlert.alert("Discussion", errMsg);
        }
      } finally {
        setIsSubmitting(false);
      }
    } else {
      if (!title.trim()) {
        const msg = "Please enter a discussion title.";
        if (Platform.OS === "web") window.alert(msg);
        else RNAlert.alert("Discussion", msg);
        return;
      }

      setIsSubmitting(true);
      try {
        const disc = await startPlantDiscussion({
          title: title.trim(),
          description: description.trim(),
          participants: selectedParticipants,
        });

        const resolvedId =
          disc?._id ||
          (disc as any)?.data?._id ||
          (disc as any)?.discussion?._id;
        const resolvedTitle =
          disc?.title ||
          (disc as any)?.data?.title ||
          (disc as any)?.discussion?.title ||
          title.trim();

        if (!resolvedId) {
          throw new Error("Could not resolve discussion identifier from server response.");
        }

        navigation.replace("DiscussionChat", {
          discussionId: resolvedId,
          title: resolvedTitle,
        });
      } catch (err: any) {
        console.error("[StartDiscussionScreen] Failed to start plant discussion:", err);
        const errMsg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to start discussion. Please check your connection and try again.";
        if (Platform.OS === "web") {
          window.alert(`Discussion Error:\n${errMsg}`);
        } else {
          RNAlert.alert("Discussion", errMsg);
        }
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      !searchUser.trim() ||
      u.name.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.role.toLowerCase().includes(searchUser.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchUser.toLowerCase()))
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* App Header */}
      <AppHeader title={isAlertDiscussion ? "Start Alert Discussion" : "Start Plant Discussion"} />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Alert Context Preview Card */}
        {isAlertDiscussion && effectiveAlert && (
          <View style={styles.alertPreviewCard}>
            <View style={styles.alertCardHeader}>
              <View
                style={[
                  styles.severityPill,
                  effectiveAlert.severity === "critical"
                    ? styles.severity_crit
                    : effectiveAlert.severity === "warning"
                    ? styles.severity_warn
                    : styles.severity_inf,
                ]}
              >
                {effectiveAlert.severity === "critical" ? (
                  <AlertCircle size={14} color="#DC2626" />
                ) : effectiveAlert.severity === "warning" ? (
                  <AlertTriangle size={14} color="#D97706" />
                ) : (
                  <Info size={14} color="#2563EB" />
                )}
                <Text
                  style={[
                    styles.severityPillText,
                    effectiveAlert.severity === "critical"
                      ? { color: "#DC2626" }
                      : effectiveAlert.severity === "warning"
                      ? { color: "#D97706" }
                      : { color: "#2563EB" },
                  ]}
                >
                  {effectiveAlert.severity?.toUpperCase() || "CRITICAL"}
                </Text>
              </View>
              <Text style={styles.plantNameText}>{effectiveAlert.plant_id || "Facility Plant"}</Text>
            </View>

            <Text style={styles.panelNameText}>{effectiveAlert.panel_name || title || "Equipment Panel"}</Text>
            <Text style={styles.tagMetricText}>
              {effectiveAlert.tag_name || "Parameter Alert"}
              {effectiveAlert.alert_value !== undefined && effectiveAlert.alert_value !== null && (
                <Text style={styles.tagValueText}>: {effectiveAlert.alert_value} {effectiveAlert.unit || ""}</Text>
              )}
            </Text>
          </View>
        )}

        {/* Plant Discussion Form */}
        {!isAlertDiscussion && (
          <View style={styles.formSection}>
            <Text style={styles.sectionLabel}>Discussion Title *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Production line chiller maintenance"
              placeholderTextColor="#94A3B8"
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Provide context, observations, or troubleshooting details..."
              placeholderTextColor="#94A3B8"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        )}

        {/* Add Participants Section */}
        <View style={styles.participantsSection}>
          <View style={styles.participantsHeaderRow}>
            <Users size={18} color="#2563EB" />
            <Text style={styles.participantsHeaderTitle}>Add Participants</Text>
          </View>
          <Text style={styles.participantsHeaderSubtitle}>
            Select users to invite into this discussion thread.
          </Text>

          {/* Search box */}
          <View style={styles.userSearchBar}>
            <Search size={16} color="#94A3B8" />
            <TextInput
              style={styles.userSearchInput}
              placeholder="Search users..."
              placeholderTextColor="#94A3B8"
              value={searchUser}
              onChangeText={setSearchUser}
            />
          </View>

          {/* User / Team Checkbox List */}
          {isLoadingUsers ? (
            <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.usersList}>
              {filteredUsers.map((item) => {
                const isSelected = selectedParticipants.some((p) => p.userId === item.userId);
                return (
                  <TouchableOpacity
                    key={item.userId}
                    style={[styles.userRow, isSelected && styles.userRowSelected]}
                    onPress={() => toggleParticipant(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.userInfo}>
                      <Text style={styles.userNameText}>{item.name}</Text>
                      <Text style={styles.userRoleText}>{item.role}</Text>
                    </View>

                    <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                      {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!isAlertDiscussion && !title.trim()) || isSubmitting
              ? styles.submitBtnDisabled
              : null,
          ]}
          onPress={handleStart}
          disabled={(!isAlertDiscussion && !title.trim()) || isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Start Discussion</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.THEME.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  alertPreviewCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 6,
  },
  alertCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  severityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severity_crit: { backgroundColor: "#FEE2E2" },
  severity_warn: { backgroundColor: "#FEF3C7" },
  severity_inf: { backgroundColor: "#EFF6FF" },
  severityPillText: {
    fontSize: 11,
    fontWeight: "700",
  },
  plantNameText: {
    fontSize: 12,
    color: CONFIG.THEME.textMuted,
  },
  panelNameText: {
    fontSize: 16,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  tagMetricText: {
    fontSize: 14,
    color: CONFIG.THEME.textSecondary,
  },
  tagValueText: {
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  formSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
  },
  textArea: {
    height: 80,
  },
  participantsSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 10,
  },
  participantsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantsHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  participantsHeaderSubtitle: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginBottom: 4,
  },
  userSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 13,
    color: CONFIG.THEME.textPrimary,
    padding: 0,
  },
  usersList: {
    gap: 6,
    marginTop: 4,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "transparent",
  },
  userRowSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  userInfo: {
    flex: 1,
  },
  userNameText: {
    fontSize: 14,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  userRoleText: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginTop: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
