import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { ArrowLeft, Search, Check, Users, User, X } from "lucide-react-native";
import { communicationApi } from "../services/communicationApi";
import { useCommunicationModule } from "../store/CommunicationContext";
import { useAuth } from "../../../context/AuthContext";
import { UserReference } from "../types";
import { useDebounce } from "../hooks/useDebounce";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any, any>;
}

const DEFAULT_PLANT_MEMBERS: UserReference[] = [];

export const UserSearchScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { startPrivateChat, createNewGroup } = useCommunicationModule();

  const mode = route.params?.mode || "chat"; // "chat" | "create_group"
  const isCreateGroup = mode === "create_group";

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserReference[]>(DEFAULT_PLANT_MEMBERS);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserReference[]>([]);
  const [groupName, setGroupName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debouncedQuery = useDebounce(query, 150);

  useEffect(() => {
    let isMounted = true;

    // Filter local directory immediately for instant 0ms response
    const q = (debouncedQuery || "").trim().toLowerCase();
    const localFiltered = DEFAULT_PLANT_MEMBERS.filter((m) => {
      if (m.userId === user?.id) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.role && m.role.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q))
      );
    });

    if (isMounted) {
      setUsers(localFiltered);
    }

    async function loadRemoteUsers() {
      try {
        const remoteList = await communicationApi.searchUsers(debouncedQuery);
        if (isMounted && Array.isArray(remoteList) && remoteList.length > 0) {
          const userMap = new Map<string, UserReference>();
          // Remote first
          remoteList.forEach((u) => {
            if (u.userId !== user?.id) userMap.set(u.userId, u);
          });
          // Local fallback
          localFiltered.forEach((u) => {
            if (!userMap.has(u.userId)) userMap.set(u.userId, u);
          });
          setUsers(Array.from(userMap.values()));
        }
      } catch (err: any) {
        console.warn("[UserSearch] searchUsers error:", err?.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadRemoteUsers();
    return () => {
      isMounted = false;
    };
  }, [debouncedQuery, user?.id]);

  const handleSelectUser = async (targetUser: UserReference) => {
    if (isCreateGroup) {
      const exists = selectedUsers.some((u) => u.userId === targetUser.userId);
      if (exists) {
        setSelectedUsers((prev) => prev.filter((u) => u.userId !== targetUser.userId));
      } else {
        setSelectedUsers((prev) => [...prev, targetUser]);
      }
    } else {
      // Start private chat immediately
      try {
        setIsSubmitting(true);
        const conv = await startPrivateChat(targetUser);
        navigation.replace("ChatScreen", {
          conversationId: conv._id,
          recipient: targetUser,
        });
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Failed to start conversation");
        setIsSubmitting(false);
      }
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert("Validation", "Please enter a group name");
      return;
    }

    if (selectedUsers.length === 0) {
      Alert.alert("Validation", "Please select at least one member");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createNewGroup({
        name: groupName.trim(),
        memberIds: selectedUsers.map((u) => u.userId),
      });

      navigation.replace("GroupChatScreen", {
        conversationId: res.conversation._id,
        groupId: res.group._id,
        groupName: res.group.name,
      });
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to create group");
      setIsSubmitting(false);
    }
  };

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

        <Text style={styles.headerTitle}>
          {isCreateGroup ? "New Group" : "Search Team Members"}
        </Text>

        {isCreateGroup ? (
          <TouchableOpacity
            style={[
              styles.createHeaderBtn,
              (!groupName.trim() || selectedUsers.length === 0 || isSubmitting) &&
                styles.createHeaderBtnDisabled,
            ]}
            onPress={handleCreateGroup}
            disabled={!groupName.trim() || selectedUsers.length === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={styles.createHeaderBtnText}>Create</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Group Name input if in create_group mode */}
      {isCreateGroup && (
        <View style={styles.groupNameSection}>
          <Text style={styles.inputLabel}>Group Name</Text>
          <TextInput
            style={styles.groupNameInput}
            placeholder="e.g. Electrical Maintenance Team"
            placeholderTextColor="#94A3B8"
            value={groupName}
            onChangeText={setGroupName}
            maxLength={60}
          />
          {selectedUsers.length > 0 && (
            <Text style={styles.selectedCountText}>
              {selectedUsers.length} {selectedUsers.length === 1 ? "member" : "members"} selected
            </Text>
          )}
        </View>
      )}

      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or email..."
            placeholderTextColor="#94A3B8"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* User List */}
      <FlatList
        data={users}
        keyExtractor={(item) => item.userId}
        renderItem={({ item }) => {
          const isSelected = selectedUsers.some((u) => u.userId === item.userId);
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
            <TouchableOpacity
              style={styles.userRow}
              onPress={() => handleSelectUser(item)}
              activeOpacity={0.7}
              disabled={isSubmitting}
            >
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{initials}</Text>
              </View>

              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userEmail}>{item.email || item.role || "Operator"}</Text>
              </View>

              {isCreateGroup ? (
                <View
                  style={[
                    styles.checkbox,
                    isSelected && styles.checkboxSelected,
                  ]}
                >
                  {isSelected && <Check size={14} color="#FFFFFF" />}
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#2563EB" />
            </View>
          ) : (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyTitle}>No Members Found</Text>
              <Text style={styles.emptySubtitle}>
                {query.trim()
                  ? `No team members matching "${query.trim()}".`
                  : "Type a name or email to find teammates."}
              </Text>
            </View>
          )
        }
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
  createHeaderBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  createHeaderBtnDisabled: {
    opacity: 0.5,
  },
  createHeaderBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
  },
  groupNameSection: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
    textTransform: "uppercase",
  },
  groupNameInput: {
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0F172A",
  },
  selectedCountText: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "600",
    marginTop: 6,
  },
  searchWrapper: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#0F172A",
    paddingVertical: 4,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userAvatarText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: "#64748B",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  centerContainer: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
});
