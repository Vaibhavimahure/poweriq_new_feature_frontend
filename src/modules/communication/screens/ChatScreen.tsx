import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { useAuth } from "../../../context/AuthContext";
import { communicationApi } from "../services/communicationApi";
import { communicationSocket } from "../socket/communicationSocket";
import { useCommunicationModule } from "../store/CommunicationContext";
import { ChatBubble } from "../components/ChatBubble";
import { MessageInput } from "../components/MessageInput";
import { TypingIndicator } from "../components/TypingIndicator";
import { MessageItem, MessageReplyInfo, UserReference } from "../types";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any, any>;
}

export const ChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { onlineUserIds, markConversationAsRead } = useCommunicationModule();

  const conversationId: string = route.params?.conversationId;
  const recipient: UserReference = route.params?.recipient;

  const currentUserId = user?.id || "";
  const isRecipientOnline = recipient ? onlineUserIds.has(recipient.userId) : false;

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageReplyInfo | null>(null);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const res = await communicationApi.getMessages(conversationId, { limit: 40 });
      setMessages(res.data);
      setHasMore(res.hasMore);
      // Mark read
      markConversationAsRead(conversationId);
    } catch (err: any) {
      console.warn("[ChatScreen] getMessages error:", err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, markConversationAsRead]);

  // Load more older messages
  const loadMoreMessages = async () => {
    if (!hasMore || isLoadingMore || messages.length === 0) return;
    setIsLoadingMore(true);
    try {
      const oldestId = messages[0]?._id;
      const res = await communicationApi.getMessages(conversationId, {
        limit: 30,
        beforeMessageId: oldestId,
      });
      if (res.data.length > 0) {
        setMessages((prev) => [...res.data, ...prev]);
      }
      setHasMore(res.hasMore);
    } catch (err: any) {
      console.warn("[ChatScreen] loadMoreMessages error:", err?.message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Socket room join & listeners
  useEffect(() => {
    if (!conversationId) return;

    communicationSocket.joinConversation(conversationId);
    communicationSocket.markRead(conversationId);

    // Incoming new message listener
    const unsubMsg = communicationSocket.onNewMessage((msg: MessageItem) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });

        // Clear typing indicator if sender sent message
        setTypingUserName(null);

        // Mark as read immediately if chat is currently open
        communicationSocket.markRead(conversationId, msg._id);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

    // Read receipt listener
    const unsubRead = communicationSocket.onMessageRead((data) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((m) => {
            if (!m.readBy?.includes(data.userId)) {
              return {
                ...m,
                readBy: [...(m.readBy || []), data.userId],
                deliveredTo: [...(m.deliveredTo || []), data.userId],
              };
            }
            return m;
          })
        );
      }
    });

    // Typing listener
    const unsubTyping = communicationSocket.onUserTyping((data) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        setTypingUserName(data.userName || "Someone");
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setTypingUserName(null);
        }, 3000);
      }
    });

    const unsubTypingStop = communicationSocket.onUserTypingStop((data) => {
      if (data.conversationId === conversationId && data.userId !== currentUserId) {
        setTypingUserName(null);
      }
    });

    return () => {
      communicationSocket.leaveConversation(conversationId);
      unsubMsg();
      unsubRead();
      unsubTyping();
      unsubTypingStop();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversationId, currentUserId]);

  const handleSendMessage = async (content: string, replyToId?: string | null) => {
    if (!content.trim() || !conversationId) return;

    // Optimistic message
    const tempId = "temp_" + Date.now();
    const optimisticMsg: MessageItem = {
      _id: tempId,
      conversationId,
      senderId: currentUserId,
      senderName: user?.name || "Me",
      messageType: "text",
      content: content.trim(),
      replyTo: replyingTo || null,
      deliveredTo: [currentUserId],
      readBy: [currentUserId],
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyingTo(null);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    try {
      const created = await communicationApi.sendMessage({
        conversationId,
        content: content.trim(),
        messageType: "text",
        replyTo: replyToId,
      });

      // Replace optimistic message with actual backend record
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? created : m))
      );
    } catch (err: any) {
      console.warn("[ChatScreen] sendMessage error:", err?.message);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await communicationApi.deleteMessage(messageId);
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId
            ? { ...m, isDeleted: true, content: "This message was deleted" }
            : m
        )
      );
    } catch (err: any) {
      console.warn("[ChatScreen] deleteMessage error:", err?.message);
    }
  };

  const handleReplyMessage = (msg: MessageItem) => {
    setReplyingTo({
      _id: msg._id,
      senderId: msg.senderId,
      senderName: msg.senderName,
      content: msg.content,
      messageType: msg.messageType,
    });
  };

  const initials = recipient?.name
    ? recipient.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "U";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerProfile}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            {isRecipientOnline && <View style={styles.onlineBadge} />}
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {recipient?.name || "Chat"}
            </Text>
            <Text
              style={[
                styles.headerStatus,
                isRecipientOnline ? styles.headerStatusOnline : styles.headerStatusOffline,
              ]}
            >
              {isRecipientOnline ? "Online" : recipient?.role || "Offline"}
            </Text>
          </View>
        </View>

        <View style={{ width: 36 }} />
      </View>

      {/* Messages Feed */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <ChatBubble
              message={item}
              isCurrentUser={item.senderId === currentUserId}
              onReply={handleReplyMessage}
              onDelete={handleDeleteMessage}
            />
          )}
          ListHeaderComponent={
            isLoadingMore ? (
              <View style={styles.loadMoreLoader}>
                <ActivityIndicator size="small" color="#2563EB" />
              </View>
            ) : null
          }
          onScroll={(e) => {
            if (e.nativeEvent.contentOffset.y <= 20 && hasMore && !isLoadingMore) {
              loadMoreMessages();
            }
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (!isLoadingMore) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Typing Indicator */}
      {typingUserName && <TypingIndicator userName={typingUserName} />}

      {/* Message Input Bar */}
      <MessageInput
        onSendMessage={handleSendMessage}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onTypingStart={() => communicationSocket.typingStart(conversationId)}
        onTypingStop={() => communicationSocket.typingStop(conversationId)}
      />
    </KeyboardAvoidingView>
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
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    padding: 6,
    marginRight: 4,
  },
  headerProfile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  avatarWrapper: {
    position: "relative",
    marginRight: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  onlineBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: "#16A34A",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerStatus: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  headerStatusOnline: {
    color: "#16A34A",
  },
  headerStatusOffline: {
    color: "#94A3B8",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    color: "#64748B",
  },
  listContent: {
    paddingVertical: 12,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  loadMoreLoader: {
    paddingVertical: 8,
    alignItems: "center",
  },
});
