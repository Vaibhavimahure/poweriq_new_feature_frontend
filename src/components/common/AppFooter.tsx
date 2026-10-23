import React from "react";
import { useNavigation } from "@react-navigation/native";
import { BottomTabNavigator, BottomTabType } from "../../navigation/BottomTabNavigator";
import { useAlerts } from "../../context/AlertContext";
import { useCommunicationModule } from "../../modules/communication/store/CommunicationContext";
import { useTabNavigation } from "../../context/TabNavigationContext";

interface AppFooterProps {
  activeTab?: BottomTabType;
}

export const AppFooter: React.FC<AppFooterProps> = ({ activeTab = "none" }) => {
  const { isInTabNavigator } = useTabNavigation();
  const navigation = useNavigation<any>();
  const { counters } = useAlerts();
  const { totalUnreadCount: commUnread } = useCommunicationModule();

  // If already rendered inside MainAppNavigator's persistent bottom bar, do not duplicate
  if (isInTabNavigator) {
    return null;
  }

  const unreadAlertCount =
    (counters?.pending_critical || 0) + (counters?.pending_warning || 0);

  const handleTabPress = (tab: BottomTabType) => {
    navigation.navigate("Dashboard", { tab, timestamp: Date.now() });
  };

  return (
    <BottomTabNavigator
      currentTab={activeTab}
      onTabPress={handleTabPress}
      unreadAlertCount={unreadAlertCount}
      unreadDiscussionCount={commUnread}
    />
  );
};
