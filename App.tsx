import React, { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as Updates from "expo-updates";
import { AuthProvider } from "./src/context/AuthContext";
import { AudioProvider } from "./src/context/AudioContext";
import { AlertProvider } from "./src/context/AlertContext";
import { CommunicationProvider } from "./src/context/CommunicationContext";
import { CommunicationModuleProvider } from "./src/modules/communication/store/CommunicationContext";
import { DateFilterProvider } from "./src/context/DateFilterContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { StatusBar } from "expo-status-bar";
import { initializeNotifications, requestNotificationPermissions } from "./src/config/notifications";
import { navigationRef, navigate, onNavigationReady } from "./src/navigation/navigationRef";
import { AlertItem } from "./src/types/alert";

interface NotificationData {
  alertId?: string;
  alert?: AlertItem;
  discussionId?: string;
  source?: string;
  severity?: string;
}

export default function App() {
  useEffect(() => {
    // 0. Auto-check and reload if new EAS OTA update is available
    async function checkOtaUpdates() {
      try {
        if (!__DEV__) {
          const update = await Updates.checkForUpdateAsync();
          if (update.isAvailable) {
            console.log("[Updates] New OTA update found, fetching and reloading...");
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
          }
        }
      } catch (e: any) {
        console.log("[Updates] OTA update check error:", e?.message);
      }
    }
    checkOtaUpdates();

    // 1. Initialize notification channel and foreground handlers, request permissions
    initializeNotifications()
      .then(() => requestNotificationPermissions())
      .catch((error) =>
        console.warn("[Notifications] Initialization failed:", error?.message)
      );

    // 2. Check if app was opened by tapping a notification (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        const data = response.notification.request.content.data as any;
        if (data?.discussionId || data?.type === "CHAT_MESSAGE" || data?.type === "CHAT_MENTION") {
          setTimeout(() => {
            navigate("DiscussionChat", {
              discussionId: String(data.discussionId),
              alertId: data.alertId,
              title: data.title,
            });
          }, 400);
          return;
        }
        const alertId = data?.alertId || data?.alert?._id || data?.alert?.alert_id;
        if (alertId) {
          console.log("[Notifications] App launched from notification tap:", alertId);
          setTimeout(() => {
            navigate("AlertDetail", { alertId: String(alertId), alert: data?.alert });
          }, 400);
        }
      }
    });

    // 3. Listen for notification taps when app is backgrounded or open
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.discussionId || data?.type === "CHAT_MESSAGE" || data?.type === "CHAT_MENTION") {
        navigate("DiscussionChat", {
          discussionId: String(data.discussionId),
          alertId: data.alertId,
          title: data.title,
        });
        return;
      }
      const alertId = data?.alertId || data?.alert?._id || data?.alert?.alert_id;
      if (alertId) {
        console.log("[Notifications] User tapped notification for alertId:", alertId);
        navigate("AlertDetail", { alertId: String(alertId), alert: data?.alert });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DateFilterProvider>
          <AudioProvider>
            <AlertProvider>
              <CommunicationProvider>
                <CommunicationModuleProvider>
                  <NavigationContainer ref={navigationRef} onReady={onNavigationReady}>
                    <StatusBar style="dark" />
                    <RootNavigator />
                  </NavigationContainer>
                </CommunicationModuleProvider>
              </CommunicationProvider>
            </AlertProvider>
          </AudioProvider>
        </DateFilterProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
