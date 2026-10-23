/**
 * socketService.ts
 * ----------------------------------------------------------------------------
 * Socket.IO client — connects to the DEPLOYED alert backend.
 *
 * Socket host: https://dev.esmbackend.click           (SOCKET_HOST_URL)
 * Socket path: /api/alert/socket.io                  (SOCKET_PATH)
 *
 * Auth mechanism (confirmed from backend index.js):
 *   socket.handshake.auth.token = "Bearer <JWT>"
 *   socket.handshake.query.token = "Bearer <JWT>"   (fallback)
 *
 * The backend calls stripBearer() which strips "Bearer " prefix before
 * calling jwt.verify(), so we pass the full "Bearer <token>" string.
 *
 * Rules:
 *  - Socket MUST NOT open before a valid JWT exists
 *  - Disconnect on logout, clear token
 *  - No duplicate connections (reuse if same token + connected)
 *  - Auto-reconnect is handled by socket.io-client
 *  - Dev override: set SOCKET_HOST_URL_OVERRIDE for local testing
 * ----------------------------------------------------------------------------
 */

import { io, Socket } from "socket.io-client";
import { CONFIG } from "../config/constants";
import { AlertItem, SocketReadyPayload } from "../types/alert";

export type ConnectionStatus =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected"
  | "unauthorized";

type AlertEventListener = (alert: AlertItem) => void;
type StatusEventListener = (status: ConnectionStatus, detail?: string) => void;
type SocketReadyListener = (payload: SocketReadyPayload) => void;

class SocketService {
  private socket: Socket | null = null;
  private status: ConnectionStatus = "disconnected";
  private currentToken: string | null = null;

  private onAlertNewListeners: Set<AlertEventListener> = new Set();
  private onAlertUpdatedListeners: Set<AlertEventListener> = new Set();
  private onStatusListeners: Set<StatusEventListener> = new Set();
  private onSocketReadyListeners: Set<SocketReadyListener> = new Set();

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  private setStatus(newStatus: ConnectionStatus, detail?: string) {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.onStatusListeners.forEach((l) => l(newStatus, detail));
    }
  }

  /**
   * Connect to the deployed Socket.IO server.
   * Must be called ONLY after a valid JWT has been obtained from the auth API.
   * Safe to call multiple times — reuses existing socket if token unchanged.
   *
   * @param token - raw JWT (without "Bearer " prefix; we add it here)
   * @param socketHostOverride - optional URL for local dev (e.g. http://10.0.2.2:9013)
   */
  public async connect(token: string, socketHostOverride?: string): Promise<void> {
    if (!token) {
      console.warn("[SocketService] connect() called without a token — aborted");
      return;
    }

    // Reuse existing connected socket if token is the same
    if (this.socket && this.currentToken === token && this.socket.connected) {
      console.log("[SocketService] Reusing existing connected socket");
      return;
    }

    // Disconnect any stale socket first
    this.disconnect();
    this.currentToken = token;
    this.setStatus("connecting");

    // Use deployed host by default; allow dev override for local testing
    const socketHost = socketHostOverride ?? CONFIG.SOCKET_HOST_URL;
    const socketPath = CONFIG.SOCKET_PATH;

    console.log("[SocketService] Connecting →", socketHost, socketPath, {
      hasToken: Boolean(token),
    });

    try {
      this.socket = io(socketHost, {
        path: socketPath,
        // Backend index.js reads: socket.handshake.auth.token OR socket.handshake.query.token
        // stripBearer() handles the "Bearer " prefix on the server side
        auth: { token: `Bearer ${token}` },
        query: { token: `Bearer ${token}` },
        // Use both transports: WebSocket first, polling as fallback
        transports: ["websocket", "polling"],
        forceNew: true,
        multiplex: false,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        randomizationFactor: 0.5,
        timeout: 20000,
        autoConnect: true,
      });

      this.setupSocketListeners();
    } catch (error) {
      console.error("[SocketService] Initialization error:", error);
      this.setStatus("disconnected", String(error));
    }
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on(CONFIG.SOCKET_EVENTS.CONNECT, () => {
      console.log("[SocketService] ✅ Connected, socket ID:", this.socket?.id);
      this.setStatus("connected");
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.DISCONNECT, (reason) => {
      console.log("[SocketService] Disconnected:", reason);
      if (reason === "io server disconnect") {
        // Server forced disconnect (bad token / no companyId) — don't reconnect
        this.setStatus("disconnected", "Server closed the session");
      } else {
        // Network hiccup — socket.io-client will auto-reconnect
        this.setStatus("reconnecting", reason);
      }
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.CONNECT_ERROR, (err) => {
      const message = err?.message || "Connection error";
      console.log("[SocketService] CONNECT ERROR:", message);

      if (
        message.includes("NO_TOKEN") ||
        message.includes("INVALID_TOKEN") ||
        message.includes("TOKEN_EXPIRED")
      ) {
        this.setStatus("unauthorized", message);
      } else {
        this.setStatus("reconnecting", message);
      }
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.RECONNECT_ATTEMPT, (attempt) => {
      console.log("[SocketService] Reconnect attempt #", attempt);
      this.setStatus("reconnecting");
    });

    // Backend emits socket:ready after verifying JWT + resolving companyId
    this.socket.on(CONFIG.SOCKET_EVENTS.SOCKET_READY, (data: SocketReadyPayload) => {
      console.log("[SocketService] socket:ready →", data);
      if (data?.ok) {
        this.setStatus("connected");
      } else {
        // Backend could not resolve company — session is invalid
        this.setStatus("disconnected", data?.reason || "socket:ready returned ok=false");
      }
      this.onSocketReadyListeners.forEach((l) => l(data));
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.ALERT_NEW, (alert: AlertItem) => {
      console.log("[SocketService] alert:new →", alert?._id, alert?.severity);
      this.onAlertNewListeners.forEach((l) => l(alert));
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.ALERT_UPDATED, (alert: AlertItem) => {
      this.onAlertUpdatedListeners.forEach((l) => l(alert));
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.ALERT_BULK_ACK, (payload: any) => {
      this.onAlertUpdatedListeners.forEach((l) =>
        l({ _id: payload?.did, ...payload } as AlertItem)
      );
    });

    this.socket.on(CONFIG.SOCKET_EVENTS.ALERT_CLEAR, (payload: any) => {
      this.onAlertUpdatedListeners.forEach((l) =>
        l({ _id: payload?.did, is_cleared: true, ...payload } as AlertItem)
      );
    });
  }

  /** Cleanly disconnect and reset. Must be called on logout. */
  public disconnect(): void {
    if (this.socket) {
      console.log("[SocketService] Disconnecting socket");
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.onAlertNewListeners.clear();
    this.onAlertUpdatedListeners.clear();
    this.currentToken = null;
    this.setStatus("disconnected");
  }

  // -------------------------------------------------------------------------
  // Subscription helpers — each returns an unsubscribe function
  // -------------------------------------------------------------------------

  public onAlertNew(callback: AlertEventListener): () => void {
    this.onAlertNewListeners.add(callback);
    return () => this.onAlertNewListeners.delete(callback);
  }

  public onAlertUpdated(callback: AlertEventListener): () => void {
    this.onAlertUpdatedListeners.add(callback);
    return () => this.onAlertUpdatedListeners.delete(callback);
  }

  public onStatusChange(callback: StatusEventListener): () => void {
    this.onStatusListeners.add(callback);
    callback(this.status); // immediate sync
    return () => this.onStatusListeners.delete(callback);
  }

  public onSocketReady(callback: SocketReadyListener): () => void {
    this.onSocketReadyListeners.add(callback);
    return () => this.onSocketReadyListeners.delete(callback);
  }
}

export const socketService = new SocketService();
