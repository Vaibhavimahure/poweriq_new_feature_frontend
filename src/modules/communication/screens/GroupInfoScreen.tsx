import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { ArrowLeft, Users, Shield, LogOut, UserPlus } from "lucide-react-native";
import { useAuth } from "../../../context/AuthContext";
import { communicationApi } from "../services/communicationApi";
import { useCommunicationModule } from "../store/CommunicationContext";
import { Group, GroupMember } from "../types";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any, any>;
}

export const GroupInfoScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { fetchGroups } = useCommunicationModule();

  const groupId: string = route.params?.groupId;
  const currentUserId = user?.id || "";

  const [group, setGroup] = useState<Group | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    async function loadGroup() {
      if (!groupId) return;
      setIsLoading(true);
      try {
        const data = await communicationApi.getGroupById(groupId);
        setGroup(data);
      } catch (err: any) {
        console.warn("[GroupInfo] getGroupById error:", err?.message);
      } finally {
        setIsLoading(false);
      }
    }
    loadGroup();
  }, [groupId]);

  const isMember = group?.memberIds?.includes(currentUserId) || false;
  const isAdmin = group?.adminIds?.includes(currentUserId) || false;

  const handleJoin = async () => {
    if (!groupId) return;
    setIsProcessing(true);
    try {
      const updated = await communicationApi.joinGroup(groupId);
      setGroup((prev) => (prev ? { ...prev, ...updated } : updated));
      await fetchGroups();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to join group");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLeave = () => {
    if (!groupId) return;
    Alert.alert("Leave Group", "Are you sure you want to leave this group?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setIsProcessing(true);
          try {
            await communicationApi.leaveGroup(groupId);
            await fetchGroups();
            navigation.navigate("Dashboard", { tab: "Discussions" } as any);
          } catch (err: any) {
            Alert.alert("Error", err?.message || "Failed to leave group");
            setIsProcessing(false);
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>Group Not Found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const members: GroupMember[] = group.members || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        ListHeaderComponent={
          <View style={styles.groupHero}>
            <View style={styles.groupAvatar}>
              <Users size={36} color="#FFFFFF" />
            </View>

            <Text style={styles.groupName}>{group.name}</Text>
            {group.description ? (
              <Text style={styles.groupDescription}>{group.description}</Text>
            ) : null}

            <View style={styles.badgeRow}>
              <View style={styles.memberPill}>
                <Text style={styles.memberPillText}>
                  {members.length} {members.length === 1 ? "Member" : "Members"}
                </Text>
              </View>
              {isAdmin && (
                <View style={styles.adminPill}>
                  <Shield size={12} color="#2563EB" />
                  <Text style={styles.adminPillText}>You are an Admin</Text>
                </View>
              )}
            </View>

            {/* Actions: Join or Leave */}
            <View style={styles.actionButtonWrap}>
              {isMember ? (
                <TouchableOpacity
                  style={styles.leaveBtn}
                  onPress={handleLeave}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <LogOut size={16} color="#DC2626" />
                  <Text style={styles.leaveBtnText}>Leave Group</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.joinBtn}
                  onPress={handleJoin}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <UserPlus size={16} color="#FFFFFF" />
                  <Text style={styles.joinBtnText}>Join Group</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const initials = item.name
            ? item.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()
            : "U";

          return (
            <View style={styles.memberRow}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{initials}</Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>
                  {item.name} {item.userId === currentUserId ? "(You)" : ""}
                </Text>
                <Text style={styles.memberRole}>{item.email || item.role}</Text>
              </View>

              {item.isAdmin && (
                <View style={styles.adminBadge}>
                  <Shield size={11} color="#2563EB" />
                  <Text style={styles.adminBadgeText}>Admin</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  groupHero: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  groupAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#0D9488",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  groupName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 4,
  },
  groupDescription: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  memberPill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  memberPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  adminPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adminPillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  actionButtonWrap: {
    width: "100%",
    marginTop: 4,
    marginBottom: 8,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  joinBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  leaveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  leaveBtnText: {
    color: "#DC2626",
    fontSize: 15,
    fontWeight: "700",
  },
  sectionHeader: {
    width: "100%",
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  memberAvatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  memberRole: {
    fontSize: 13,
    color: "#64748B",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  backButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  listContent: {
    paddingBottom: 40,
  },
});
