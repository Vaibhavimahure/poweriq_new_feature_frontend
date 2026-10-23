import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import { communicationApi } from "../api/communicationApi";
import { communicationSocket } from "../services/communicationSocket";
import {
  DiscussionItem,
  CommunicationMessage,
  DiscussionParticipant,
} from "../types/communication";

interface CommunicationContextType {
  discussions: DiscussionItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  unreadCount: number;
  activeFilterTab: "all" | "alert" | "plant" | "community";
  setActiveFilterTab: (tab: "all" | "alert" | "plant" | "community") => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  fetchDiscussions: (refresh?: boolean) => Promise<void>;
  startAlertDiscussion: (
    alertId: string,
    participants?: DiscussionParticipant[],
    alertContext?: any
  ) => Promise<DiscussionItem>;
  startPlantDiscussion: (params: {
    title: string;
    description: string;
    plantId?: string | null;
    participants?: DiscussionParticipant[];
  }) => Promise<DiscussionItem>;
  markDiscussionAsRead: (discussionId: string, messageId?: string) => Promise<void>;
}

const CommunicationContext = createContext<CommunicationContextType | undefined>(undefined);

export const CommunicationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isAuthenticated, accessToken, user } = useAuth();

  const [discussions, setDiscussions] = useState<DiscussionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeFilterTab, setActiveFilterTab] = useState<
    "all" | "alert" | "plant" | "community"
  >("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const activeDiscussionIdRef = useRef<string | null>(null);

  // Compute unread count
  const unreadCount = discussions.filter((d) => d.isUnread).length;

  const fetchDiscussions = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else if (discussions.length === 0) {
        setIsLoading(true);
      }

      try {
        let typeFilter: "ALERT" | "PLANT" | undefined = undefined;
        if (activeFilterTab === "alert") typeFilter = "ALERT";
        if (activeFilterTab === "plant") typeFilter = "PLANT";

        const res = await communicationApi.listDiscussions({
          type: typeFilter,
          search: searchQuery.trim() || undefined,
        });

        setDiscussions(res.data || []);
      } catch (err: any) {
        console.warn("[CommContext] fetchDiscussions error:", err?.message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [isAuthenticated, activeFilterTab, searchQuery]
  );

  // Re-fetch when tab or search query changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchDiscussions();
    }
  }, [fetchDiscussions, isAuthenticated]);

  // Connect socket when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      communicationSocket.connect(accessToken).catch((e) => {
        console.warn("[CommContext] Socket connect failed:", e?.message);
      });

      // Listen for new messages globally to update lastMessage and unread state
      const unsubMsg = communicationSocket.onMessage((msg: CommunicationMessage) => {
        setDiscussions((prev) => {
          const index = prev.findIndex((d) => d._id === msg.discussionId);
          if (index === -1) return prev;

          const updated = [...prev];
          const isCurrentlyViewing = activeDiscussionIdRef.current === msg.discussionId;
          const isSender = msg.senderUserId === user?.id;

          updated[index] = {
            ...updated[index],
            lastMessage: {
              text: msg.message,
              senderUserId: msg.senderUserId,
              senderName: msg.senderName,
              createdAt: msg.createdAt,
            },
            updatedAt: msg.createdAt,
            isUnread: !isCurrentlyViewing && !isSender ? true : updated[index].isUnread,
          };

          // Re-sort so updated discussion jumps to top
          return updated.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });
      });

      const unsubAct = communicationSocket.onDiscussionActivity(({ discussionId, lastMessage }) => {
        setDiscussions((prev) => {
          const index = prev.findIndex((d) => d._id === discussionId);
          if (index === -1) return prev;
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            lastMessage,
            updatedAt: lastMessage.createdAt || new Date().toISOString(),
          };
          return updated.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        });
      });

      return () => {
        unsubMsg();
        unsubAct();
      };
    } else {
      communicationSocket.disconnect();
      setDiscussions([]);
    }
  }, [isAuthenticated, accessToken, user?.id]);

  const startAlertDiscussion = useCallback(
    async (
      alertId: string,
      participants: DiscussionParticipant[] = [],
      alertContext?: any
    ): Promise<DiscussionItem> => {
      const res = await communicationApi.createAlertDiscussion(alertId, participants, alertContext);
      await fetchDiscussions();
      const disc = (res as any)?.data?.data || (res as any)?.data || (res as any)?.discussion || res;
      return disc as DiscussionItem;
    },
    [fetchDiscussions]
  );

  const startPlantDiscussion = useCallback(
    async (params: {
      title: string;
      description: string;
      plantId?: string | null;
      participants?: DiscussionParticipant[];
    }): Promise<DiscussionItem> => {
      const res = await communicationApi.createPlantDiscussion(params);
      await fetchDiscussions();
      const disc = (res as any)?.data?.data || (res as any)?.data || (res as any)?.discussion || res;
      return disc as DiscussionItem;
    },
    [fetchDiscussions]
  );

  const markDiscussionAsRead = useCallback(
    async (discussionId: string, messageId?: string) => {
      try {
        await communicationApi.markDiscussionAsRead(discussionId, messageId);
        setDiscussions((prev) =>
          prev.map((d) => (d._id === discussionId ? { ...d, isUnread: false } : d))
        );
      } catch (err: any) {
        console.warn("[CommContext] markDiscussionAsRead error:", err?.message);
      }
    },
    []
  );

  return (
    <CommunicationContext.Provider
      value={{
        discussions,
        isLoading,
        isRefreshing,
        unreadCount,
        activeFilterTab,
        setActiveFilterTab,
        searchQuery,
        setSearchQuery,
        fetchDiscussions,
        startAlertDiscussion,
        startPlantDiscussion,
        markDiscussionAsRead,
      }}
    >
      {children}
    </CommunicationContext.Provider>
  );
};

export const useCommunication = (): CommunicationContextType => {
  const context = useContext(CommunicationContext);
  if (!context) {
    throw new Error("useCommunication must be used within a CommunicationProvider");
  }
  return context;
};
