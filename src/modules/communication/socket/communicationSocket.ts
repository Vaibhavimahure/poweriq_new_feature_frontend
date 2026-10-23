import { io, Socket } from "socket.io-client";
import { CONFIG } from "../../../config/constants";
import { MessageItem } from "../types";

type MessageHandler = (message: MessageItem) => void;
type DeliveredHandler = (data: { messageId: string; conversationId: string; userId: string }) => void;
type ReadHandler = (data: { messageId?: string; conversationId: string; userId: string }) => void;
type TypingHandler = (data: { conversationId: string; userId: string; userName: string }) => void;
type StopTypingHandler = (data: { conversationId: string; userId: string }) => void;
type OnlineHandler = (data: { userId: string }) => void;
type OfflineHandler = (data: { userId: string }) => void;

class CommunicationSocketService {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;
  private currentToken: string | null = null;

  private messageListeners = new Set<MessageHandler>();
  private deliveredListeners = new Set<DeliveredHandler>();
  private readListeners = new Set<ReadHandler>();
  private typingListeners = new Set<TypingHandler>();
  private stopTypingListeners = new Set<StopTypingHandler>();
  private onlineListeners = new Set<OnlineHandler>();
  private offlineListeners = new Set<OfflineHandler>();

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public async connect(token: string): Promise<void> {
    if (!token) return;

    // Already connected with this token
    if (this.socket?.connected && this.currentToken === token) {
      return;
    }

    if (this.isConnecting) return;
    this.isConnecting = true;
    this.currentToken = token;

    try {
      const hostUrl = CONFIG.COMMUNICATION_SOCKET_URL;
      const path = CONFIG.COMMUNICATION_SOCKET_PATH;

      if (!hostUrl) {
        console.log("[CommSocket] Socket URL not configured, skipping socket connect.");
        this.isConnecting = false;
        return;
      }

      console.log("[CommSocket] Connecting to:", hostUrl, "path:", path);

      this.socket = io(hostUrl, {
        path,
        auth: { token: `Bearer ${token}` },
        query: { token: `Bearer ${token}` },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      this.socket.on("connect", () => {
        console.log("[CommSocket] ✅ Connected, socket id:", this.socket?.id);
        this.isConnecting = false;
      });

      this.socket.on("communication:ready", (payload) => {
        console.log("[CommSocket] Ready:", payload);
      });

      this.socket.on("connect_error", (err) => {
        console.warn("[CommSocket] Connect error:", err.message);
        this.isConnecting = false;
      });

      this.socket.on("disconnect", (reason) => {
        console.log("[CommSocket] 🔌 Disconnected:", reason);
        this.isConnecting = false;
      });

      // Bind listen events
      this.socket.on("new_message", (msg: MessageItem) => {
        this.messageListeners.forEach((fn) => fn(msg));
      });

      this.socket.on("message_delivered", (data) => {
        this.deliveredListeners.forEach((fn) => fn(data));
      });

      this.socket.on("message_read", (data) => {
        this.readListeners.forEach((fn) => fn(data));
      });

      this.socket.on("user_typing", (data) => {
        this.typingListeners.forEach((fn) => fn(data));
      });

      this.socket.on("user_typing_stop", (data) => {
        this.stopTypingListeners.forEach((fn) => fn(data));
      });

      this.socket.on("user_online", (data) => {
        this.onlineListeners.forEach((fn) => fn(data));
      });

      this.socket.on("user_offline", (data) => {
        this.offlineListeners.forEach((fn) => fn(data));
      });
    } catch (err: any) {
      console.warn("[CommSocket] Setup error:", err?.message);
      this.isConnecting = false;
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentToken = null;
      console.log("[CommSocket] Disconnected manually.");
    }
    this.isConnecting = false;
  }

  // ── Emit Events ───────────────────────────────────────────────────────────
  public joinConversation(conversationId: string): void {
    if (this.socket?.connected && conversationId) {
      this.socket.emit("join_conversation", { conversationId });
    }
  }

  public leaveConversation(conversationId: string): void {
    if (this.socket?.connected && conversationId) {
      this.socket.emit("leave_conversation", { conversationId });
    }
  }

  public sendMessage(payload: {
    conversationId: string;
    content: string;
    messageType?: string;
    replyTo?: string | null;
    attachments?: any[];
  }): void {
    if (this.socket?.connected) {
      this.socket.emit("send_message", payload);
    }
  }

  public typingStart(conversationId: string): void {
    if (this.socket?.connected && conversationId) {
      this.socket.emit("typing_start", { conversationId });
    }
  }

  public typingStop(conversationId: string): void {
    if (this.socket?.connected && conversationId) {
      this.socket.emit("typing_stop", { conversationId });
    }
  }

  public markRead(conversationId: string, messageId?: string): void {
    if (this.socket?.connected && conversationId) {
      this.socket.emit("mark_read", { conversationId, messageId });
    }
  }

  // ── Listener Subscriptions ────────────────────────────────────────────────
  public onNewMessage(handler: MessageHandler): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  public onMessageDelivered(handler: DeliveredHandler): () => void {
    this.deliveredListeners.add(handler);
    return () => this.deliveredListeners.delete(handler);
  }

  public onMessageRead(handler: ReadHandler): () => void {
    this.readListeners.add(handler);
    return () => this.readListeners.delete(handler);
  }

  public onUserTyping(handler: TypingHandler): () => void {
    this.typingListeners.add(handler);
    return () => this.typingListeners.delete(handler);
  }

  public onUserTypingStop(handler: StopTypingHandler): () => void {
    this.stopTypingListeners.add(handler);
    return () => this.stopTypingListeners.delete(handler);
  }

  public onUserOnline(handler: OnlineHandler): () => void {
    this.onlineListeners.add(handler);
    return () => this.onlineListeners.delete(handler);
  }

  public onUserOffline(handler: OfflineHandler): () => void {
    this.offlineListeners.add(handler);
    return () => this.offlineListeners.delete(handler);
  }
}

export const communicationSocket = new CommunicationSocketService();
