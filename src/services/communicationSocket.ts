import { io, Socket } from "socket.io-client";
import { CONFIG } from "../config/constants";
import { CommunicationMessage, DiscussionParticipant } from "../types/communication";

type MessageHandler = (message: CommunicationMessage) => void;
type MessageUpdateHandler = (message: CommunicationMessage) => void;
type MessageDeleteHandler = (data: { messageId: string; discussionId: string }) => void;
type ParticipantHandler = (data: { discussionId: string; participant: DiscussionParticipant }) => void;
type ParticipantRemovedHandler = (data: { discussionId: string; userId: string }) => void;
type TypingHandler = (data: { discussionId: string; userId: string; userName: string }) => void;
type StopTypingHandler = (data: { discussionId: string; userId: string }) => void;
type DiscussionActivityHandler = (data: { discussionId: string; lastMessage: any }) => void;

class CommunicationSocketService {
  private socket: Socket | null = null;
  private isConnecting: boolean = false;

  private messageHandlers = new Set<MessageHandler>();
  private messageUpdateHandlers = new Set<MessageUpdateHandler>();
  private messageDeleteHandlers = new Set<MessageDeleteHandler>();
  private participantAddedHandlers = new Set<ParticipantHandler>();
  private participantRemovedHandlers = new Set<ParticipantRemovedHandler>();
  private typingHandlers = new Set<TypingHandler>();
  private stopTypingHandlers = new Set<StopTypingHandler>();
  private activityHandlers = new Set<DiscussionActivityHandler>();

  public async connect(token: string): Promise<void> {
    if (this.socket?.connected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      const hostUrl = CONFIG.COMMUNICATION_SOCKET_URL;
      const path = CONFIG.COMMUNICATION_SOCKET_PATH;

      console.log("[CommSocket] Connecting to:", hostUrl, "path:", path);

      this.socket = io(hostUrl, {
        path,
        auth: { token: `Bearer ${token}` },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000,
        timeout: 10000,
      });

      this.socket.on("connect", () => {
        console.log("[CommSocket] ✅ Connected, id:", this.socket?.id);
        this.isConnecting = false;
      });

      this.socket.on("communication:ready", (payload) => {
        console.log("[CommSocket] Ready:", payload);
      });

      this.socket.on("connect_error", (err) => {
        console.warn("[CommSocket] Connection error:", err.message);
        this.isConnecting = false;
      });

      this.socket.on("disconnect", (reason) => {
        console.log("[CommSocket] 🔌 Disconnected:", reason);
        this.isConnecting = false;
      });

      // Bind incoming events to registered listeners
      this.socket.on("discussion:message", (msg: CommunicationMessage) => {
        this.messageHandlers.forEach((h) => h(msg));
      });

      this.socket.on("discussion:message_updated", (msg: CommunicationMessage) => {
        this.messageUpdateHandlers.forEach((h) => h(msg));
      });

      this.socket.on("discussion:message_deleted", (data) => {
        this.messageDeleteHandlers.forEach((h) => h(data));
      });

      this.socket.on("discussion:participant_added", (data) => {
        this.participantAddedHandlers.forEach((h) => h(data));
      });

      this.socket.on("discussion:participant_removed", (data) => {
        this.participantRemovedHandlers.forEach((h) => h(data));
      });

      this.socket.on("discussion:typing", (data) => {
        this.typingHandlers.forEach((h) => h(data));
      });

      this.socket.on("discussion:stop_typing", (data) => {
        this.stopTypingHandlers.forEach((h) => h(data));
      });

      this.socket.on("discussion:activity", (data) => {
        this.activityHandlers.forEach((h) => h(data));
      });
    } catch (e: any) {
      console.warn("[CommSocket] Setup error:", e?.message);
      this.isConnecting = false;
    }
  }

  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log("[CommSocket] Disconnected manually.");
    }
    this.isConnecting = false;
  }

  public joinDiscussion(discussionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit("discussion:join", { discussionId });
    }
  }

  public leaveDiscussion(discussionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit("discussion:leave", { discussionId });
    }
  }

  public emitTyping(discussionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit("discussion:typing", { discussionId });
    }
  }

  public emitStopTyping(discussionId: string): void {
    if (this.socket?.connected) {
      this.socket.emit("discussion:stop_typing", { discussionId });
    }
  }

  // Listener subscriptions
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  public onMessageUpdated(handler: MessageUpdateHandler): () => void {
    this.messageUpdateHandlers.add(handler);
    return () => this.messageUpdateHandlers.delete(handler);
  }

  public onMessageDeleted(handler: MessageDeleteHandler): () => void {
    this.messageDeleteHandlers.add(handler);
    return () => this.messageDeleteHandlers.delete(handler);
  }

  public onParticipantAdded(handler: ParticipantHandler): () => void {
    this.participantAddedHandlers.add(handler);
    return () => this.participantAddedHandlers.delete(handler);
  }

  public onParticipantRemoved(handler: ParticipantRemovedHandler): () => void {
    this.participantRemovedHandlers.add(handler);
    return () => this.participantRemovedHandlers.delete(handler);
  }

  public onTyping(handler: TypingHandler): () => void {
    this.typingHandlers.add(handler);
    return () => this.typingHandlers.delete(handler);
  }

  public onStopTyping(handler: StopTypingHandler): () => void {
    this.stopTypingHandlers.add(handler);
    return () => this.stopTypingHandlers.delete(handler);
  }

  public onDiscussionActivity(handler: DiscussionActivityHandler): () => void {
    this.activityHandlers.add(handler);
    return () => this.activityHandlers.delete(handler);
  }
}

export const communicationSocket = new CommunicationSocketService();
