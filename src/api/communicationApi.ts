import { communicationClient } from "./communicationClient";
import { authApi } from "./authApi";
import { storage } from "../services/storage";
import { CONFIG } from "../config/constants";
import {
  DiscussionItem,
  CommunicationMessage,
  DiscussionParticipant,
  CommunityQuestion,
  CommunityQuestionDetail,
  CommunityAnswer,
  CommunityAttachment,
} from "../types/communication";

export const communicationApi = {
  // --- Discussions ---
  createAlertDiscussion: async (
    alertId: string,
    participants: DiscussionParticipant[] = [],
    alertContext?: any
  ): Promise<{ data: DiscussionItem; isNew: boolean }> => {
    const res = await communicationClient.post("/api/v1/discussions", {
      type: "ALERT",
      alertId,
      participants,
      alertContext,
    });
    return res.data;
  },

  createPlantDiscussion: async (params: {
    title: string;
    description: string;
    plantId?: string | null;
    participants?: DiscussionParticipant[];
  }): Promise<{ data: DiscussionItem; isNew: boolean }> => {
    const res = await communicationClient.post("/api/v1/discussions", {
      type: "PLANT",
      ...params,
    });
    return res.data;
  },

  listDiscussions: async (params?: {
    type?: "ALERT" | "PLANT";
    plantId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: DiscussionItem[]; pagination: any }> => {
    const res = await communicationClient.get("/api/v1/discussions", { params });
    return res.data;
  },

  getDiscussionById: async (id: string): Promise<DiscussionItem> => {
    const res = await communicationClient.get(`/api/v1/discussions/${id}`);
    return res.data.data;
  },

  markDiscussionAsRead: async (id: string, messageId?: string): Promise<void> => {
    await communicationClient.post(`/api/v1/discussions/${id}/read`, { messageId });
  },

  // --- Messages ---
  getMessages: async (
    discussionId: string,
    params?: { page?: number; limit?: number; beforeMessageId?: string }
  ): Promise<CommunicationMessage[]> => {
    const res = await communicationClient.get(`/api/v1/discussions/${discussionId}/messages`, {
      params,
    });
    return res.data.data;
  },

  sendMessage: async (
    discussionId: string,
    message: string,
    senderImage?: string | null
  ): Promise<CommunicationMessage> => {
    const res = await communicationClient.post(`/api/v1/discussions/${discussionId}/messages`, {
      message,
      senderImage,
    });
    return res.data.data;
  },

  editMessage: async (messageId: string, message: string): Promise<CommunicationMessage> => {
    const res = await communicationClient.patch(`/api/v1/messages/${messageId}`, { message });
    return res.data.data;
  },

  deleteMessage: async (messageId: string): Promise<CommunicationMessage> => {
    const res = await communicationClient.delete(`/api/v1/messages/${messageId}`);
    return res.data.data;
  },

  // --- Participants ---
  getParticipants: async (
    discussionId: string
  ): Promise<{ creatorUserId: string; count: number; participants: DiscussionParticipant[] }> => {
    const res = await communicationClient.get(`/api/v1/discussions/${discussionId}/participants`);
    return res.data.data;
  },

  addParticipant: async (
    discussionId: string,
    participant: Partial<DiscussionParticipant>
  ): Promise<DiscussionParticipant> => {
    const res = await communicationClient.post(
      `/api/v1/discussions/${discussionId}/participants`,
      participant
    );
    return res.data.data;
  },

  removeParticipant: async (discussionId: string, userId: string): Promise<void> => {
    await communicationClient.delete(`/api/v1/discussions/${discussionId}/participants/${userId}`);
  },

  searchParticipants: async (query?: string, companyId?: string): Promise<DiscussionParticipant[]> => {
    // 1. Primary: communication service's own participant search endpoint
    // It has direct read access to all users in the Auth database scoped by company,
    // and works for any authenticated user (production, operator, manager, admin).
    try {
      const res = await communicationClient.get("/api/v1/participants/search", {
        params: { q: query },
      });
      const data = res.data?.data;
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (err: any) {
      console.warn("[communicationApi] /participants/search call failed, trying auth API:", err?.message);
    }

    // 2. Secondary fallback: authApi.getAllUsers (works if user has admin privileges)
    try {
      let resolvedCompanyId = companyId;
      if (!resolvedCompanyId) {
        const userData = await storage.getObject<any>(CONFIG.STORAGE_KEYS.USER_DATA);
        resolvedCompanyId =
          userData?.companyId ||
          userData?.company ||
          (typeof userData?.company === "object" ? userData?.company?._id : undefined);
      }

      if (!resolvedCompanyId) {
        const token = await storage.getItem(CONFIG.STORAGE_KEYS.ACCESS_TOKEN);
        if (token) {
          try {
            const parts = token.split(".");
            if (parts.length >= 2) {
              const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
              let json = "";
              if (typeof atob === "function") {
                json = decodeURIComponent(
                  atob(base64)
                    .split("")
                    .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                    .join("")
                );
              }
              if (json) {
                const payload = JSON.parse(json);
                resolvedCompanyId =
                  payload?.companyId ||
                  payload?.company_id ||
                  (typeof payload?.company === "string" ? payload.company : payload?.company?._id);
              }
            }
          } catch {}
        }
      }

      // Fetch users from the deployed auth API (/api/v1/user/getAllUsers)
      const rawUsers = await authApi.getAllUsers(resolvedCompanyId);

      const mappedUsers: DiscussionParticipant[] = (rawUsers || []).map((u: any) => {
        const roleStr =
          u.role?.displayName ||
          u.role?.name ||
          (typeof u.role === "string" ? u.role : "") ||
          "Member";

        return {
          userId: String(u._id || u.id || u.userId),
          name: u.name || u.displayName || u.email || "Team Member",
          role: roleStr,
          email: u.email || "",
          isTeam: false,
        };
      });

      const q = (query || "").trim().toLowerCase();
      if (!q) {
        return mappedUsers;
      }

      return mappedUsers.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q) ||
          (p.email && p.email.toLowerCase().includes(q))
      );
    } catch (err) {
      console.warn("[communicationApi] searchParticipants fallback failed:", err);
      return [];
    }
  },

  // --- Global Community (PowerIQ User) ---
  listCommunityQuestions: async (params?: {
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: CommunityQuestion[]; pagination: any }> => {
    const res = await communicationClient.get("/api/v1/community/questions", { params });
    return res.data;
  },

  getCommunityQuestionById: async (id: string): Promise<CommunityQuestionDetail> => {
    const res = await communicationClient.get(`/api/v1/community/questions/${id}`);
    return res.data.data;
  },

  createCommunityQuestion: async (data: {
    title: string;
    description: string;
    category: string;
    attachments?: CommunityAttachment[];
  }): Promise<CommunityQuestion> => {
    const res = await communicationClient.post("/api/v1/community/questions", data);
    return res.data.data;
  },

  updateCommunityQuestion: async (
    questionId: string,
    data: {
      title?: string;
      description?: string;
      category?: string;
      attachments?: CommunityAttachment[];
    }
  ): Promise<CommunityQuestion> => {
    const res = await communicationClient.patch(`/api/v1/community/questions/${questionId}`, data);
    return res.data.data;
  },

  postCommunityAnswer: async (
    questionId: string,
    payload: string | { answerText: string; attachments?: CommunityAttachment[] }
  ): Promise<CommunityAnswer> => {
    const body = typeof payload === "string" ? { answerText: payload } : payload;
    const res = await communicationClient.post(
      `/api/v1/community/questions/${questionId}/answers`,
      body
    );
    return res.data.data;
  },

  updateCommunityAnswer: async (
    answerId: string,
    data: {
      answerText?: string;
      attachments?: CommunityAttachment[];
    }
  ): Promise<CommunityAnswer> => {
    const res = await communicationClient.patch(`/api/v1/community/answers/${answerId}`, data);
    return res.data.data;
  },

  voteHelpful: async (
    targetType: "QUESTION" | "ANSWER",
    targetId: string
  ): Promise<{ targetId: string; targetType: string; hasVoted: boolean; helpfulVotes: number }> => {
    const endpoint =
      targetType === "QUESTION"
        ? `/api/v1/community/questions/${targetId}/vote`
        : `/api/v1/community/answers/${targetId}/vote`;
    const res = await communicationClient.post(endpoint, { targetType });
    return res.data.data;
  },

  updateDiscussion: async (
    id: string,
    data: Partial<DiscussionItem>
  ): Promise<DiscussionItem> => {
    const res = await communicationClient.patch(`/api/v1/discussions/${id}`, data);
    return res.data.data;
  },

  resolveDiscussion: async (id: string): Promise<DiscussionItem> => {
    const res = await communicationClient.post(`/api/v1/discussions/${id}/resolve`);
    return res.data.data;
  },

  closeDiscussion: async (id: string): Promise<DiscussionItem> => {
    const res = await communicationClient.post(`/api/v1/discussions/${id}/close`);
    return res.data.data;
  },

  voteAnswerHelpful: async (
    answerId: string
  ): Promise<{ targetId: string; hasVoted: boolean; helpfulVotes: number }> => {
    const res = await communicationClient.post(`/api/v1/community/answers/${answerId}/helpful`);
    return res.data.data;
  },

  saveAnswer: async (answerId: string): Promise<{ answerId: string; isSaved: boolean }> => {
    const res = await communicationClient.post(`/api/v1/community/answers/${answerId}/save`);
    return res.data.data;
  },

  getSavedAnswers: async (): Promise<any[]> => {
    const res = await communicationClient.get("/api/v1/community/answers/saved");
    return res.data.data;
  },

  getMyCommunityQuestions: async (): Promise<CommunityQuestion[]> => {
    const res = await communicationClient.get("/api/v1/community/my-questions");
    return res.data.data;
  },

  getPlantMembers: async (
    plantId: string,
    search?: string
  ): Promise<DiscussionParticipant[]> => {
    const res = await communicationClient.get(`/api/v1/plants/${plantId}/members`, {
      params: { search },
    });
    return res.data.data;
  },

  registerPushToken: async (
    token: string,
    platform: string = "android",
    deviceId?: string | null,
    accessToken?: string | null
  ): Promise<any> => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      const res = await communicationClient.post(
        "/api/v1/push/register",
        {
          fcmToken: token,
          expoPushToken: token,
          platform,
          deviceId,
        },
        { headers }
      );
      return res.data;
    } catch (e: any) {
      console.warn("[Communication Push] Token register warning:", e?.message);
    }
  },

  unregisterPushToken: async (
    token?: string | null,
    accessToken?: string | null
  ): Promise<void> => {
    try {
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      await communicationClient.post(
        "/api/v1/push/unregister",
        {
          fcmToken: token,
          expoPushToken: token,
        },
        { headers }
      );
    } catch (e: any) {
      console.warn("[Communication Push] Token unregister warning:", e?.message);
    }
  },
};
