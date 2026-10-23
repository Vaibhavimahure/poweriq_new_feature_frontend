/**
 * MainAppNavigator.tsx
 * ----------------------------------------------------------------------------
 * Master Tab Orchestrator for PowerIQ-AI Mobile:
 * Renders the persistent bottom navigation:
 * [ HOME | ALERTS | SEC | DISCUSSIONS | PROFILE ]
 * Handles state-preserving tab switching and correct safe-area container sizing.
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { BottomTabNavigator, BottomTabType } from "./BottomTabNavigator";
import { HomeScreen } from "../features/home/HomeScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { ProductSecScreen } from "../features/sec/ProductSecScreen";
import { DiscussionsScreen } from "../screens/DiscussionsScreen";
import { ProfileScreen } from "../features/profile/ProfileScreen";
import { useAlerts } from "../context/AlertContext";
import { useCommunicationModule } from "../modules/communication/store/CommunicationContext";
import { TabNavigationContext } from "../context/TabNavigationContext";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";

interface MainAppNavigatorProps {
  navigation: NativeStackNavigationProp<RootStackParamList, "Dashboard">;
  route?: any;
}

export const MainAppNavigator: React.FC<MainAppNavigatorProps> = ({ navigation, route }) => {
  const [currentTab, setCurrentTab] = useState<BottomTabType>("Home");

  useEffect(() => {
    if (route?.params?.tab) {
      setCurrentTab(route.params.tab);
    }
  }, [route?.params?.tab, route?.params?.timestamp]);

  const { counters } = useAlerts();
  const { totalUnreadCount: commUnread } = useCommunicationModule();

  const unreadAlertCount =
    (counters?.pending_critical || 0) + (counters?.pending_warning || 0);

  const handleTabPress = (tab: BottomTabType) => {
    setCurrentTab(tab);
  };

  return (
    <TabNavigationContext.Provider value={{ isInTabNavigator: true, currentTab, setCurrentTab }}>
      <View style={styles.container}>
        {/* Tab Screen Views (preserves mounting for snappy switching) */}
        <View style={styles.contentContainer}>
          {currentTab === "Home" && (
            <HomeScreen
              onNavigateToAlerts={() => setCurrentTab("Alerts")}
              onNavigateToSec={() => setCurrentTab("SEC")}
            />
          )}
          {currentTab === "Alerts" && (
            <DashboardScreen navigation={navigation} hideBottomNav={true} initialRouteParams={route?.params} />
          )}
          {currentTab === "SEC" && <ProductSecScreen />}
          {currentTab === "Discussions" && (
            <DiscussionsScreen
              navigation={navigation as any}
              route={{ key: "Discussions", name: "Discussions", params: undefined } as any}
            />
          )}
          {currentTab === "Profile" && <ProfileScreen />}
        </View>

        {/* Persistent Bottom Bar */}
        <BottomTabNavigator
          currentTab={currentTab}
          onTabPress={handleTabPress}
          unreadAlertCount={unreadAlertCount}
          unreadDiscussionCount={commUnread}
        />
      </View>
    </TabNavigationContext.Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  contentContainer: {
    flex: 1,
  },
});
