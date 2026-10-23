/**
 * BottomTabNavigator.tsx
 * ----------------------------------------------------------------------------
 * Persistent PowerIQ-AI mobile bottom navigation:
 * HOME | ALERTS | SEC | DISCUSSIONS | PROFILE
 * (SEC replaces the "Plants" tab from the design)
 * Includes proper safe-area padding and active tab indicators.
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, AlertTriangle, Zap, MessageSquare, User } from "lucide-react-native";
import { CONFIG } from "../config/constants";

export type BottomTabType = "Home" | "Alerts" | "SEC" | "Discussions" | "Profile" | "none";

interface BottomTabNavigatorProps {
  currentTab: BottomTabType;
  onTabPress: (tab: BottomTabType) => void;
  unreadAlertCount?: number;
  unreadDiscussionCount?: number;
}

export const BottomTabNavigator: React.FC<BottomTabNavigatorProps> = ({
  currentTab,
  onTabPress,
  unreadAlertCount = 0,
  unreadDiscussionCount = 0,
}) => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === "ios" ? 16 : 8);

  const tabs: Array<{
    key: BottomTabType;
    label: string;
    icon: (color: string, size: number) => React.ReactNode;
    badgeCount?: number;
  }> = [
    {
      key: "Home",
      label: "Home",
      icon: (color, size) => <Home size={size} color={color} />,
    },
    {
      key: "Alerts",
      label: "Alerts",
      icon: (color, size) => <AlertTriangle size={size} color={color} />,
      badgeCount: unreadAlertCount,
    },
    {
      key: "SEC",
      label: "SEC",
      icon: (color, size) => <Zap size={size} color={color} />,
    },
    {
      key: "Discussions",
      label: "Discussions",
      icon: (color, size) => <MessageSquare size={size} color={color} />,
      badgeCount: unreadDiscussionCount,
    },
    {
      key: "Profile",
      label: "Profile",
      icon: (color, size) => <User size={size} color={color} />,
    },
  ];

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: bottomPadding }]}>
      <View style={styles.tabRow}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.key;
          const iconColor = isActive ? CONFIG.THEME.primary : CONFIG.THEME.textMuted;

          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabButton}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={styles.iconWrapper}>
                {tab.icon(iconColor, 22)}
              </View>

              <Text
                style={[
                  styles.tabLabel,
                  { color: iconColor, fontWeight: isActive ? "700" : "500" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabBarContainer: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderTopWidth: 1,
    borderTopColor: CONFIG.THEME.border,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  iconWrapper: {
    position: "relative",
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CONFIG.THEME.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "800",
  },
});
