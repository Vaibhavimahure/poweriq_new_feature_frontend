import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { MainAppNavigator } from "./MainAppNavigator";
import { MachineAnalyticsScreen } from "../features/machine/MachineAnalyticsScreen";
import { FavoriteMachineScreen } from "../features/favorite/FavoriteMachineScreen";
import { PlantAvoidableLossesScreen } from "../features/losses/PlantAvoidableLossesScreen";
import { DemandAnalysisScreen } from "../features/demand/DemandAnalysisScreen";
import { LfiScreen } from "../features/lfi/LfiScreen";
import { ProductSecScreen } from "../features/sec/ProductSecScreen";
import { ProductLogsScreen } from "../features/sec/ProductLogsScreen";
import { AddProductionLogScreen } from "../features/sec/AddProductionLogScreen";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { AlertDetailModal } from "../screens/AlertDetailModal";
import { SettingsScreen } from "../screens/SettingsScreen";

// New Communication Module Screens
import { CommunicationHome } from "../modules/communication/screens/CommunicationHome";
import { ChatScreen } from "../modules/communication/screens/ChatScreen";
import { GroupChatScreen } from "../modules/communication/screens/GroupChatScreen";
import { UserSearchScreen } from "../modules/communication/screens/UserSearchScreen";
import { GroupInfoScreen } from "../modules/communication/screens/GroupInfoScreen";

// Legacy Discussion Screens (Preserved)
import { DiscussionsScreen } from "../screens/DiscussionsScreen";
import { DiscussionChatScreen } from "../screens/DiscussionChatScreen";
import { StartDiscussionScreen } from "../screens/StartDiscussionScreen";
import { DiscussionParticipantsScreen } from "../screens/DiscussionParticipantsScreen";
import { CommunityQuestionDetailScreen } from "../screens/CommunityQuestionDetailScreen";
import { AskCommunityQuestionScreen } from "../screens/AskCommunityQuestionScreen";
import { CONFIG } from "../config/constants";

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={CONFIG.THEME.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      id={undefined}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: CONFIG.THEME.bgLight },
        animation: "fade",
      }}
    >
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Dashboard" component={MainAppNavigator} />
          <Stack.Screen
            name="MachineAnalytics"
            component={MachineAnalyticsScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="FavoriteMachine"
            component={FavoriteMachineScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="PlantAvoidableLosses"
            component={PlantAvoidableLossesScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="DemandAnalysis"
            component={DemandAnalysisScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="LfiAnalysis"
            component={LfiScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ProductSec"
            component={ProductSecScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="ProductLogs"
            component={ProductLogsScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="AddProductionLog"
            component={AddProductionLogScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="Profile"
            component={ProfileScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="Alerts"
            component={DashboardScreen}
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="AlertDetail"
            component={AlertDetailModal}
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />

          {/* ── New Communication Module Screens ──────────────────── */}
          <Stack.Screen
            name="CommunicationHome"
            component={DiscussionsScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="ChatScreen"
            component={ChatScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="GroupChatScreen"
            component={GroupChatScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="UserSearchScreen"
            component={UserSearchScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="GroupInfoScreen"
            component={GroupInfoScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />

          {/* ── Legacy Communication Screens (Preserved) ─────────── */}
          <Stack.Screen
            name="Discussions"
            component={DiscussionsScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="DiscussionChat"
            component={DiscussionChatScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="StartDiscussion"
            component={StartDiscussionScreen}
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
          <Stack.Screen
            name="DiscussionParticipants"
            component={DiscussionParticipantsScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="CommunityQuestionDetail"
            component={CommunityQuestionDetailScreen}
            options={{
              presentation: "card",
              animation: "slide_from_right",
            }}
          />
          <Stack.Screen
            name="AskCommunityQuestion"
            component={AskCommunityQuestionScreen}
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: CONFIG.THEME.bgLight,
    alignItems: "center",
    justifyContent: "center",
  },
});
