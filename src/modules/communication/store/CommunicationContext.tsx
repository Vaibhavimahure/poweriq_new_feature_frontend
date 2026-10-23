import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "../../../context/AuthContext";
import { communicationApi } from "../services/communicationApi";
import { communicationSocket } from "../socket/communicationSocket";
import { Conversation, Group, MessageItem, UserReference } from "../types";

interface CommunicationContextType {
  conversations: Conversation[];
  groups: Group[];
  isLoading: boolean;
  isRefreshing: boolean;
  totalUnreadCount: number;
  onlineUserIds: Set<string>;
  fetchConversations: (refresh?: boolean) => Promise<void>;
  fetchGroups: () => Promise<void>;
  startPrivateChat: (recipient: UserReference) => Promise<Conversation>;
  createNewGroup: (params: {
    name: string;
    description?: string;
    memberIds: string[];
  }) => Promise<{ group: Group; conversation: Conversation }>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
}

const CommunicationContext = createContext<CommunicationContextType | undefined>(undefined);

export const CommunicationModuleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, accessToken, user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const activeConversationIdRef = useRef<string | null>(null);

  // Compute total unread count
  const totalUnreadCount = conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);

  // Fetch conversations
  const fetchConversations = useCallback(
    async (refresh = false) => {
      if (!isAuthenticated) return;
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);

      try {
        const data = await communicationApi.getConversations();
        setConversations(data);
      } catch (err: any) {
        console.warn("[CommunicationStore] fetchConversations error:", err?.message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isAuthenticated]
  );

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await communicationApi.getGroups();
      setGroups(data);
    } catch (err: any) {
      console.warn("[CommunicationStore] fetchGroups error:", err?.message);
    }
  }, [isAuthenticated]);

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
      fetchGroups();
    }
  }, [fetchConversations, fetchGroups, isAuthenticated]);

  // Socket connection & real-time listeners
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      communicationSocket.connect(accessToken).catch((e) => {
        console.warn("[CommunicationStore] Socket connect error:", e?.message);
      });

      // Handle new incoming messages
      const unsubNewMsg = communicationSocket.onNewMessage((msg: MessageItem) => {
        setConversations((prev) => {
          const index = prev.findIndex((c) => c._id === msg.conversationId);
          const isCurrentlyViewing = activeConversationIdRef.current === msg.conversationId;
          const isSender = msg.senderId === user?.id;

          if (index === -1) {
            // Re-fetch conversations if brand new
            fetchConversations();
            return prev;
          }

          const updated = [...prev];
          const target = updated[index];
          const prevUnread = target.unreadCount || 0;
          const newUnread = !isCurrentlyViewing && !isSender ? prevUnread + 1 : prevUnread;

          updated[index] = {
            ...target,
            lastMessage: {
              content: msg.content,
              senderId: msg.senderId,
              senderName: msg.senderName,
              messageType: msg.messageType,
              createdAt: msg.createdAt,
            },
            unreadCount: newUnread,
            updatedAt: msg.createdAt,
          };

          return updated.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });
      });

      // Handle presence: online
      const unsubOnline = communicationSocket.onUserOnline(({ userId }) => {
        setOnlineUserIds((prev) => new Set([...prev, userId]));
      });

      // Handle presence: offline
      const unsubOffline = communicationSocket.onUserOffline(({ userId }) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      });

      return () => {
        unsubNewMsg();
        unsubOnline();
        unsubOffline();
      };
    } else {
      communicationSocket.disconnect();
      setConversations([]);
      setGroups([]);
    }
  }, [isAuthenticated, accessToken, user?.id, fetchConversations]);

  // Start private chat
  const startPrivateChat = useCallback(
    async (recipient: UserReference): Promise<Conversation> => {
      const res = await communicationApi.createPrivateConversation(
        recipient.userId,
        recipient.name,
        recipient.email
      );
      await fetchConversations();
      return res.data;
    },
    [fetchConversations]
  );

  // Create new group
  const createNewGroup = useCallback(
    async (params: {
      name: string;
      description?: string;
      memberIds: string[];
    }): Promise<{ group: Group; conversation: Conversation }> => {
      const res = await communicationApi.createGroup(params);
      await Promise.all([fetchConversations(), fetchGroups()]);
      return res;
    },
    [fetchConversations, fetchGroups]
  );

  // Mark conversation read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    try {
      communicationSocket.markRead(conversationId);
      setConversations((prev) =>
        prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err: any) {
      console.warn("[CommunicationStore] markConversationAsRead error:", err?.message);
    }
  }, []);

  return (
    <CommunicationContext.Provider
      value={{
        conversations,
        groups,
        isLoading,
        isRefreshing,
        totalUnreadCount,
        onlineUserIds,
        fetchConversations,
        fetchGroups,
        startPrivateChat,
        createNewGroup,
        markConversationAsRead,
      }}
    >
      {children}
    </CommunicationContext.Provider>
  );
};

export const useCommunicationModule = (): CommunicationContextType => {
  const context = useContext(CommunicationContext);
  if (!context) {
    throw new Error("useCommunicationModule must be used within CommunicationModuleProvider");
  }
  return context;
};
