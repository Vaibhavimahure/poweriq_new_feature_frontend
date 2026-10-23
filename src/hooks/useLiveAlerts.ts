import { useEffect } from "react";
import { useAlerts } from "../context/AlertContext";
import { socketService } from "../services/socketService";
import { useAuth } from "../context/AuthContext";
import { AlertItem } from "../types/alert";

/**
 * Custom hook providing direct access to the live alert stream,
 * socket connection status, and custom subscription handlers.
 */
export const useLiveAlerts = (options?: {
  onNewAlert?: (alert: AlertItem) => void;
  onAlertUpdated?: (alert: AlertItem) => void;
}) => {
  const { accessToken } = useAuth();
  const alertContext = useAlerts();

  useEffect(() => {
    if (!options?.onNewAlert && !options?.onAlertUpdated) return;

    let unsubNew: (() => void) | undefined;
    let unsubUp: (() => void) | undefined;

    if (options.onNewAlert) {
      unsubNew = socketService.onAlertNew(options.onNewAlert);
    }
    if (options.onAlertUpdated) {
      unsubUp = socketService.onAlertUpdated(options.onAlertUpdated);
    }

    return () => {
      unsubNew?.();
      unsubUp?.();
    };
  }, [options?.onNewAlert, options?.onAlertUpdated]);

  const reconnect = async () => {
    if (accessToken) {
      await socketService.connect(accessToken);
    }
  };

  return {
    ...alertContext,
    reconnect,
    isConnected: alertContext.connectionStatus === "connected",
    isReconnecting: alertContext.connectionStatus === "reconnecting",
  };
};
