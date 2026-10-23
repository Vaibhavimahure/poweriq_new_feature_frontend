import { communicationClient } from "../../../api/communicationClient";
import { Conversation, MessageItem, Group, UserReference } from "../types";

export const communicationApi = {
  // ── Users ─────────────────────────────────────────────────────────────────
  searchUsers: async (query?: string): Promise<UserReference[]> => {
    const res = await communicationClient.get("/users/search", {
      params: { q: query?.trim() || undefined },
    });
    return res.data?.data || [];
  },

  // ── Conversations ─────────────────────────────────────────────────────────
  getConversations: async (): Promise<Conversation[]> => {
    const res = await communicationClient.get("/conversations");
    return res.data?.data || [];
  },

  createPrivateConversation: async (
    recipientId: string,
    recipientName?: string,
    recipientEmail?: string
  ): Promise<{ data: Conversation; isNew: boolean }> => {
    const res = await communicationClient.post("/conversations/private", {
      recipientId,
      recipientName,
      recipientEmail,
    });
    return res.data;
  },

  createGroupConversation: async (params: {
    name: string;
    description?: string;
    memberIds: string[];
    image?: string | null;
  }): Promise<{ conversation: Conversation; group: Group }> => {
    const res = await communicationClient.post("/conversations/group", params);
    return res.data?.data;
  },

  // ── Messages ──────────────────────────────────────────────────────────────
  getMessages: async (
    conversationId: string,
    params?: { limit?: number; beforeMessageId?: string }
  ): Promise<{ data: MessageItem[]; hasMore: boolean }> => {
    const res = await communicationClient.get(`/messages/${conversationId}`, {
      params,
    });
    return {
      data: res.data?.data || [],
      hasMore: Boolean(res.data?.hasMore),
    };
  },

  sendMessage: async (payload: {
    conversationId: string;
    content: string;
    messageType?: "text" | "image" | "document" | "video" | "voice";
    attachments?: Array<{ url: string; fileType: string; fileName: string; fileSize: number }>;
    replyTo?: string | null;
  }): Promise<MessageItem> => {
    const res = await communicationClient.post("/messages", payload);
    return res.data?.data;
  },

  deleteMessage: async (messageId: string): Promise<void> => {
    await communicationClient.delete(`/messages/${messageId}`);
  },

  // ── Groups ────────────────────────────────────────────────────────────────
  getGroups: async (): Promise<Group[]> => {
    const res = await communicationClient.get("/groups");
    return res.data?.data || [];
  },

  createGroup: async (params: {
    name: string;
    description?: string;
    image?: string | null;
    memberIds?: string[];
  }): Promise<{ group: Group; conversation: Conversation }> => {
    const res = await communicationClient.post("/groups", params);
    return res.data?.data;
  },

  getGroupById: async (groupId: string): Promise<Group> => {
    const res = await communicationClient.get(`/groups/${groupId}`);
    return res.data?.data;
  },

  joinGroup: async (groupId: string): Promise<Group> => {
    const res = await communicationClient.post(`/groups/${groupId}/join`);
    return res.data?.data;
  },

  leaveGroup: async (groupId: string): Promise<void> => {
    await communicationClient.post(`/groups/${groupId}/leave`);
  },
};
