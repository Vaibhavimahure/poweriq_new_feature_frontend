import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Users, User, ChevronRight } from "lucide-react-native";
import { Conversation, UserReference } from "../types";
import { CONFIG } from "../../../config/constants";

interface Props {
  conversation: Conversation;
  currentUserId: string;
  isOnline?: boolean;
  onPress: () => void;
}

export const ConversationCard: React.FC<Props> = ({
  conversation,
  currentUserId,
  isOnline = false,
  onPress,
}) => {
  const isGroup = conversation.type === "GROUP";

  // Determine display title & avatar initials
  let title = "Conversation";
  let initials = "C";

  if (isGroup) {
    title = (conversation.groupId as any)?.name || "Group Chat";
    initials = title.slice(0, 2).toUpperCase();
  } else {
    const otherUser =
      conversation.otherParticipant ||
      conversation.participants.find((p) => p.userId !== currentUserId) ||
      conversation.participants[0];

    if (otherUser) {
      title = otherUser.name || "User";
      initials = title
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
    }
  }

  const formatTimestamp = (ts?: string) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) {
        return d.toLocaleDateString([], { weekday: "short" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  const lastMessageText = conversation.lastMessage?.content || "No messages yet";
  const timestamp = formatTimestamp(
    conversation.lastMessage?.createdAt || conversation.updatedAt
  );
  const unreadCount = conversation.unreadCount || 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar with status indicator */}
      <View style={styles.avatarWrapper}>
        <View style={[styles.avatar, isGroup ? styles.avatarGroup : styles.avatarPrivate]}>
          {isGroup ? (
            <Users size={20} color="#FFFFFF" />
          ) : (
            <Text style={styles.avatarText}>{initials || "U"}</Text>
          )}
        </View>
        {!isGroup && isOnline && <View style={styles.onlineBadge} />}
      </View>

      {/* Content */}
      <View style={styles.infoWrapper}>
        <View style={styles.headerRow}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.timeText, unreadCount > 0 && styles.timeTextUnread]}>
            {timestamp}
          </Text>
        </View>

        <View style={styles.snippetRow}>
          <Text
            style={[styles.snippetText, unreadCount > 0 && styles.snippetTextUnread]}
            numberOfLines={1}
          >
            {lastMessageText}
          </Text>

          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarPrivate: {
    backgroundColor: "#2563EB",
  },
  avatarGroup: {
    backgroundColor: "#0D9488",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  onlineBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  infoWrapper: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  titleText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
  timeTextUnread: {
    color: "#2563EB",
    fontWeight: "700",
  },
  snippetRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  snippetText: {
    fontSize: 14,
    color: "#64748B",
    flex: 1,
    marginRight: 8,
  },
  snippetTextUnread: {
    color: "#0F172A",
    fontWeight: "600",
  },
  unreadBadge: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
