import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert as RNAlert,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import {
  ArrowLeft,
  Users,
  UserPlus,
  Trash2,
  Search,
  Check,
  ShieldCheck,
} from "lucide-react-native";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { useAuth } from "../context/AuthContext";
import { communicationApi } from "../api/communicationApi";
import { DiscussionParticipant } from "../types/communication";
import { AppHeader } from "../components/common/AppHeader";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "DiscussionParticipants">;
  route: RouteProp<RootStackParamList, "DiscussionParticipants">;
}

export const DiscussionParticipantsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { discussionId } = route.params;

  const [participants, setParticipants] = useState<DiscussionParticipant[]>([]);
  const [creatorUserId, setCreatorUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Add modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchDirectory, setSearchDirectory] = useState("");
  const [directoryUsers, setDirectoryUsers] = useState<DiscussionParticipant[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const loadParticipants = async () => {
    try {
      const res = await communicationApi.getParticipants(discussionId);
      setParticipants(res.participants);
      setCreatorUserId(res.creatorUserId);
    } catch (err: any) {
      console.warn("Failed to load participants:", err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadParticipants();
  }, [discussionId]);

  const openAddModal = async () => {
    setIsAddModalOpen(true);
    setIsLoadingDirectory(true);
    try {
      const users = await communicationApi.searchParticipants();
      setDirectoryUsers(users);
    } catch (err) {
      console.warn("Error loading directory:", err);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  const handleAddParticipant = async (p: DiscussionParticipant) => {
    try {
      await communicationApi.addParticipant(discussionId, p);
      setIsAddModalOpen(false);
      await loadParticipants();
    } catch (err: any) {
      RNAlert.alert("Error", err?.message || "Failed to add participant");
    }
  };

  const handleRemoveParticipant = (targetUserId: string, name: string) => {
    RNAlert.alert("Remove Participant", `Are you sure you want to remove ${name} from this discussion?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await communicationApi.removeParticipant(discussionId, targetUserId);
            await loadParticipants();
          } catch (err: any) {
            RNAlert.alert("Error", err?.message || "Failed to remove participant");
          }
        },
      },
    ]);
  };

  const isCreator = user?.id === creatorUserId || user?.role === "admin";

  const renderParticipantItem = ({ item }: { item: DiscussionParticipant }) => {
    const isOwner = item.userId === creatorUserId;
    const canRemove = (isCreator && !isOwner) || item.userId === user?.id;

    return (
      <View style={styles.participantRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.participantInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.participantName}>{item.name}</Text>
            {isOwner && (
              <View style={styles.ownerBadge}>
                <ShieldCheck size={12} color="#2563EB" />
                <Text style={styles.ownerBadgeText}>Owner</Text>
              </View>
            )}
          </View>
          <Text style={styles.participantRole}>
            {item.role || "Operator"}{item.email ? ` • ${item.email}` : ""}
          </Text>
        </View>

        {canRemove && !isOwner && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemoveParticipant(item.userId, item.name)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash2 size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* App Header */}
      <AppHeader title={`Participants (${participants.length})`} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={participants}
          keyExtractor={(item) => item.userId}
          renderItem={renderParticipantItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Add Participant Modal */}
      <Modal visible={isAddModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Participant</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalSearchBox}>
              <Search size={16} color="#94A3B8" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search directory..."
                placeholderTextColor="#94A3B8"
                value={searchDirectory}
                onChangeText={setSearchDirectory}
              />
            </View>

            {isLoadingDirectory ? (
              <ActivityIndicator size="small" color="#2563EB" style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={directoryUsers.filter(
                  (u) =>
                    !participants.some((p) => p.userId === u.userId) &&
                    (!searchDirectory.trim() ||
                      u.name.toLowerCase().includes(searchDirectory.toLowerCase()) ||
                      u.role.toLowerCase().includes(searchDirectory.toLowerCase()) ||
                      (u.email && u.email.toLowerCase().includes(searchDirectory.toLowerCase())))
                )}
                keyExtractor={(item) => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.directoryRow}
                    onPress={() => handleAddParticipant(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.avatarSmall}>
                      <Text style={styles.avatarSmallText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.directoryName}>{item.name}</Text>
                      <Text style={styles.directoryRole}>{item.role}</Text>
                    </View>
                    <UserPlus size={16} color="#2563EB" />
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ gap: 8, paddingVertical: 10 }}
                ListEmptyComponent={
                  <Text style={styles.emptyDirectoryText}>No users found.</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
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
  addBtnHeader: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    gap: 8,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  participantInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantName: {
    fontSize: 14,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  ownerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
  },
  participantRole: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    marginTop: 2,
  },
  removeBtn: {
    padding: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  modalCloseText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "600",
  },
  modalSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
    padding: 0,
  },
  directoryRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 8,
    gap: 10,
  },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarSmallText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  directoryName: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  directoryRole: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
  emptyDirectoryText: {
    textAlign: "center",
    fontSize: 13,
    color: CONFIG.THEME.textMuted,
    marginTop: 20,
  },
});
