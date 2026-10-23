import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  MessageSquare,
  Search,
  Users,
  Plus,
  ArrowLeft,
  UserPlus,
  MessagesSquare,
  X,
} from "lucide-react-native";
import { useAuth } from "../../../context/AuthContext";
import { useCommunicationModule } from "../store/CommunicationContext";
import { ConversationCard } from "../components/ConversationCard";
import { GroupCard } from "../components/GroupCard";
import { Conversation, Group } from "../types";
import { CONFIG } from "../../../config/constants";
import { AppHeader } from "../../../components/common/AppHeader";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

type TabType = "chats" | "groups";

export const CommunicationHome: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    conversations,
    groups,
    isLoading,
    isRefreshing,
    onlineUserIds,
    fetchConversations,
    fetchGroups,
  } = useCommunicationModule();

  const [activeTab, setActiveTab] = useState<TabType>("chats");
  const [searchQuery, setSearchQuery] = useState("");

  const currentUserId = user?.id || "";

  const handleRefresh = async () => {
    await Promise.all([fetchConversations(true), fetchGroups()]);
  };

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;

    return conversations.filter((c) => {
      let name = "";
      if (c.type === "GROUP") {
        name = (c.groupId as any)?.name || "";
      } else {
        const other =
          c.otherParticipant ||
          c.participants.find((p) => p.userId !== currentUserId);
        name = other?.name || "";
      }
      const lastMsg = c.lastMessage?.content || "";
      return name.toLowerCase().includes(q) || lastMsg.toLowerCase().includes(q);
    });
  }, [conversations, searchQuery, currentUserId]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  const handleOpenConversation = (conv: Conversation) => {
    if (conv.type === "GROUP") {
      navigation.navigate("GroupChatScreen", {
        conversationId: conv._id,
        groupId: typeof conv.groupId === "string" ? conv.groupId : (conv.groupId as any)?._id,
        groupName: (conv.groupId as any)?.name || "Group",
      });
    } else {
      const otherUser =
        conv.otherParticipant ||
        conv.participants.find((p) => p.userId !== currentUserId) ||
        conv.participants[0];

      navigation.navigate("ChatScreen", {
        conversationId: conv._id,
        recipient: otherUser,
      });
    }
  };

  const handleOpenGroup = (group: Group) => {
    if (group.conversationId) {
      navigation.navigate("GroupChatScreen", {
        conversationId: group.conversationId,
        groupId: group._id,
        groupName: group.name,
      });
    } else {
      // Group info to join/view
      navigation.navigate("GroupInfoScreen", {
        groupId: group._id,
      });
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <AppHeader title="Communication" />

      {/* Search Bar */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Search size={18} color="#94A3B8" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === "chats"
                ? "Search conversations or messages..."
                : "Search groups..."
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color="#64748B" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Segmented Tabs */}
      <View style={styles.tabsWrapper}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "chats" && styles.tabBtnActive]}
          onPress={() => setActiveTab("chats")}
          activeOpacity={0.8}
        >
          <MessageSquare
            size={16}
            color={activeTab === "chats" ? "#2563EB" : "#64748B"}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "chats" && styles.tabBtnTextActive,
            ]}
          >
            Chats ({conversations.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "groups" && styles.tabBtnActive]}
          onPress={() => setActiveTab("groups")}
          activeOpacity={0.8}
        >
          <Users
            size={16}
            color={activeTab === "groups" ? "#2563EB" : "#64748B"}
          />
          <Text
            style={[
              styles.tabBtnText,
              activeTab === "groups" && styles.tabBtnTextActive,
            ]}
          >
            Groups ({groups.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content List */}
      {activeTab === "chats" ? (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => {
            const otherUser =
              item.otherParticipant ||
              item.participants.find((p) => p.userId !== currentUserId);
            const isOnline = otherUser ? onlineUserIds.has(otherUser.userId) : false;

            return (
              <ConversationCard
                conversation={item}
                currentUserId={currentUserId}
                isOnline={isOnline}
                onPress={() => handleOpenConversation(item)}
              />
            );
          }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#2563EB"]}
              tintColor="#2563EB"
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.emptySubtitle}>Loading conversations...</Text>
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <View style={styles.emptyIconCircle}>
                  <MessagesSquare size={32} color="#2563EB" />
                </View>
                <Text style={styles.emptyTitle}>No Conversations Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Start a private chat by searching team members or create a group.
                </Text>
                <TouchableOpacity
                  style={styles.startChatBtn}
                  onPress={() => navigation.navigate("UserSearchScreen")}
                  activeOpacity={0.8}
                >
                  <UserPlus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.startChatBtnText}>Find Team Members</Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlatList
          data={filteredGroups}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <GroupCard group={item} onPress={() => handleOpenGroup(item)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#2563EB"]}
              tintColor="#2563EB"
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
              </View>
            ) : (
              <View style={styles.centerContainer}>
                <View style={styles.emptyIconCircle}>
                  <Users size={32} color="#2563EB" />
                </View>
                <Text style={styles.emptyTitle}>No Groups Joined</Text>
                <Text style={styles.emptySubtitle}>
                  Create a new group to collaborate with teammates.
                </Text>
                <TouchableOpacity
                  style={styles.startChatBtn}
                  onPress={() => navigation.navigate("UserSearchScreen", { mode: "create_group" })}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.startChatBtnText}>Create New Group</Text>
                </TouchableOpacity>
              </View>
            )
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 12 }]}
        onPress={() =>
          navigation.navigate("UserSearchScreen", {
            mode: activeTab === "groups" ? "create_group" : "chat",
          })
        }
        activeOpacity={0.85}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>
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
  headerActionBtn: {
    padding: 4,
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
  tabsWrapper: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabBtnTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 80,
  },
  centerContainer: {
    paddingVertical: 60,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  startChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  startChatBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
});
