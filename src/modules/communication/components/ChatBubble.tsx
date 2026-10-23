import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from "react-native";
import { Check, CheckCheck, Reply, Trash2, Copy, CornerDownRight } from "lucide-react-native";
import { MessageItem } from "../types";
import { CONFIG } from "../../../config/constants";

interface Props {
  message: MessageItem;
  isCurrentUser: boolean;
  onReply?: (message: MessageItem) => void;
  onDelete?: (messageId: string) => void;
  onCopy?: (text: string) => void;
}

export const ChatBubble: React.FC<Props> = ({
  message,
  isCurrentUser,
  onReply,
  onDelete,
  onCopy,
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const isDelivered = (message.deliveredTo && message.deliveredTo.length > 1) || false;
  const isRead = (message.readBy && message.readBy.length > 1) || false;

  const handleLongPress = () => {
    if (message.isDeleted) return;
    setShowMenu(true);
  };

  const handleCopy = () => {
    setShowMenu(false);
    onCopy?.(message.content);
  };

  const handleReply = () => {
    setShowMenu(false);
    onReply?.(message);
  };

  const handleDelete = () => {
    setShowMenu(false);
    Alert.alert("Delete Message", "Are you sure you want to delete this message?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete?.(message._id),
      },
    ]);
  };

  return (
    <View
      style={[
        styles.row,
        isCurrentUser ? styles.rowRight : styles.rowLeft,
      ]}
    >
      <TouchableOpacity
        style={[
          styles.bubble,
          isCurrentUser ? styles.bubbleOutgoing : styles.bubbleIncoming,
          message.isDeleted && styles.bubbleDeleted,
        ]}
        onLongPress={handleLongPress}
        activeOpacity={0.85}
      >
        {/* Sender Name in group chat if not current user */}
        {!isCurrentUser && message.senderName && (
          <Text style={styles.senderName}>{message.senderName}</Text>
        )}

        {/* Quoted Reply if present */}
        {message.replyTo && (
          <View
            style={[
              styles.replyQuote,
              isCurrentUser ? styles.replyQuoteOutgoing : styles.replyQuoteIncoming,
            ]}
          >
            <View style={styles.replyQuoteHeader}>
              <CornerDownRight size={12} color={isCurrentUser ? "#93C5FD" : "#2563EB"} />
              <Text
                style={[
                  styles.replyQuoteSender,
                  isCurrentUser ? styles.replyQuoteSenderOutgoing : styles.replyQuoteSenderIncoming,
                ]}
                numberOfLines={1}
              >
                {message.replyTo.senderName}
              </Text>
            </View>
            <Text
              style={[
                styles.replyQuoteText,
                isCurrentUser ? styles.replyQuoteTextOutgoing : styles.replyQuoteTextIncoming,
              ]}
              numberOfLines={2}
            >
              {message.replyTo.content}
            </Text>
          </View>
        )}

        {/* Message Content */}
        <Text
          style={[
            styles.messageText,
            isCurrentUser ? styles.messageTextOutgoing : styles.messageTextIncoming,
            message.isDeleted && styles.messageTextDeleted,
          ]}
        >
          {message.content}
        </Text>

        {/* Timestamp & Status checks */}
        <View style={styles.metaRow}>
          <Text
            style={[
              styles.timeText,
              isCurrentUser ? styles.timeTextOutgoing : styles.timeTextIncoming,
            ]}
          >
            {formatTime(message.createdAt)}
          </Text>

          {isCurrentUser && !message.isDeleted && (
            <View style={styles.statusWrap}>
              {isRead ? (
                <CheckCheck size={14} color="#60A5FA" />
              ) : isDelivered ? (
                <CheckCheck size={14} color="#E2E8F0" />
              ) : (
                <Check size={14} color="#E2E8F0" />
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Action Modal on Long Press */}
      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.actionMenu}>
            <TouchableOpacity style={styles.actionMenuItem} onPress={handleReply}>
              <Reply size={18} color="#0F172A" />
              <Text style={styles.actionMenuText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionMenuItem} onPress={handleCopy}>
              <Copy size={18} color="#0F172A" />
              <Text style={styles.actionMenuText}>Copy Text</Text>
            </TouchableOpacity>

            {isCurrentUser && (
              <TouchableOpacity style={styles.actionMenuItem} onPress={handleDelete}>
                <Trash2 size={18} color="#EF4444" />
                <Text style={[styles.actionMenuText, { color: "#EF4444" }]}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 4,
    paddingHorizontal: 16,
    flexDirection: "row",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "80%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOutgoing: {
    backgroundColor: "#2563EB",
    borderBottomRightRadius: 4,
  },
  bubbleIncoming: {
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  bubbleDeleted: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  senderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
    marginBottom: 4,
  },
  replyQuote: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
  replyQuoteOutgoing: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderLeftColor: "#FFFFFF",
  },
  replyQuoteIncoming: {
    backgroundColor: "#F8FAFC",
    borderLeftColor: "#2563EB",
  },
  replyQuoteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  replyQuoteSender: {
    fontSize: 11,
    fontWeight: "700",
  },
  replyQuoteSenderOutgoing: {
    color: "#FFFFFF",
  },
  replyQuoteSenderIncoming: {
    color: "#2563EB",
  },
  replyQuoteText: {
    fontSize: 12,
  },
  replyQuoteTextOutgoing: {
    color: "#E0E7FF",
  },
  replyQuoteTextIncoming: {
    color: "#64748B",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTextOutgoing: {
    color: "#FFFFFF",
  },
  messageTextIncoming: {
    color: "#0F172A",
  },
  messageTextDeleted: {
    fontStyle: "italic",
    color: "#94A3B8",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    fontWeight: "500",
  },
  timeTextOutgoing: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  timeTextIncoming: {
    color: "#94A3B8",
  },
  statusWrap: {
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  actionMenu: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  actionMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderRadius: 10,
  },
  actionMenuText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
});
