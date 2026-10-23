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
import { ArrowLeft, Users, Info } from "lucide-react-native";
import { useAuth } from "../../../context/AuthContext";
import { communicationApi } from "../services/communicationApi";
import { communicationSocket } from "../socket/communicationSocket";
import { useCommunicationModule } from "../store/CommunicationContext";
import { ChatBubble } from "../components/ChatBubble";
import { MessageInput } from "../components/MessageInput";
import { TypingIndicator } from "../components/TypingIndicator";
import { MessageItem, MessageReplyInfo, Group } from "../types";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any, any>;
}

export const GroupChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { markConversationAsRead } = useCommunicationModule();

  const conversationId: string = route.params?.conversationId;
  const groupId: string = route.params?.groupId;
  const initialGroupName: string = route.params?.groupName || "Group Chat";

  const currentUserId = user?.id || "";

  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageReplyInfo | null>(null);
  const [typingUserName, setTypingUserName] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load group info
  useEffect(() => {
    if (groupId) {
      communicationApi.getGroupById(groupId).then(setGroup).catch(() => {});
    }
  }, [groupId]);

  // Load initial messages
  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    setIsLoading(true);
    try {
      const res = await communicationApi.getMessages(conversationId, { limit: 40 });
      setMessages(res.data);
      setHasMore(res.hasMore);
      markConversationAsRead(conversationId);
    } catch (err: any) {
      console.warn("[GroupChat] getMessages error:", err?.message);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, markConversationAsRead]);

  // Load older messages
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
      console.warn("[GroupChat] loadMoreMessages error:", err?.message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Socket setup
  useEffect(() => {
    if (!conversationId) return;

    communicationSocket.joinConversation(conversationId);
    communicationSocket.markRead(conversationId);

    const unsubMsg = communicationSocket.onNewMessage((msg: MessageItem) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          return [...prev, msg];
        });

        setTypingUserName(null);
        communicationSocket.markRead(conversationId, msg._id);

        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    });

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
      unsubTyping();
      unsubTypingStop();
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [conversationId, currentUserId]);

  const handleSendMessage = async (content: string, replyToId?: string | null) => {
    if (!content.trim() || !conversationId) return;

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

      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? created : m))
      );
    } catch (err: any) {
      console.warn("[GroupChat] sendMessage error:", err?.message);
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
      console.warn("[GroupChat] deleteMessage error:", err?.message);
    }
  };

  const groupTitle = group?.name || initialGroupName;
  const memberCount = group?.members?.length || group?.memberIds?.length || 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
    >
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

        <TouchableOpacity
          style={styles.headerProfile}
          onPress={() => {
            if (groupId) {
              navigation.navigate("GroupInfoScreen", { groupId });
            }
          }}
          activeOpacity={0.7}
        >
          <View style={styles.avatar}>
            <Users size={20} color="#FFFFFF" />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.headerName} numberOfLines={1}>
              {groupTitle}
            </Text>
            <Text style={styles.headerSubtitle}>
              {memberCount > 0
                ? `${memberCount} ${memberCount === 1 ? "member" : "members"}`
                : "Group Info"}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => {
            if (groupId) {
              navigation.navigate("GroupInfoScreen", { groupId });
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Info size={22} color="#2563EB" />
        </TouchableOpacity>
      </View>

      {/* Messages Feed */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>Loading group chat...</Text>
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
              onReply={(m) =>
                setReplyingTo({
                  _id: m._id,
                  senderId: m.senderId,
                  senderName: m.senderName,
                  content: m.content,
                  messageType: m.messageType,
                })
              }
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

      {/* Message Input */}
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#0D9488",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  infoBtn: {
    padding: 6,
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
