/**
 * AppHeader.tsx
 * ----------------------------------------------------------------------------
 * Unified, professional PowerIQ-AI mobile header component.
 * Matches the reference design (Edge-to-edge white navbar):
 * - Left: Hamburger Menu icon (or back button on detail screens)
 * - Brand Group (left-aligned): PowerIQ emblem + "PowerIQ-AI" + "Smart Energy. Smarter Decisions."
 * - Right: Notification Bell (with alert dot indicator) + Profile Avatar
 * ----------------------------------------------------------------------------
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Menu, Bell, User, ArrowLeft } from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import { CONFIG } from "../../config/constants";
import { useNavigation } from "@react-navigation/native";
import { SidebarDrawer } from "./SidebarDrawer";

interface AppHeaderProps {
  onMenuPress?: () => void;
  onNotificationPress?: () => void;
  onProfilePress?: () => void;
  unreadAlertCount?: number;
  title?: string;
  showBack?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onMenuPress,
  onNotificationPress,
  onProfilePress,
  unreadAlertCount = 0,
  title,
  showBack = false,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const displayName = user?.name || (user as any)?.username || "User";
  const initials = displayName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const canGoBack = showBack || (title && navigation.canGoBack());

  const handleMenuOrBack = () => {
    if (canGoBack) {
      navigation.goBack();
    } else if (onMenuPress) {
      onMenuPress();
    } else {
      setIsDrawerOpen(true);
    }
  };

  const handleNotification = () => {
    if (onNotificationPress) {
      onNotificationPress();
    } else {
      navigation.navigate("Dashboard", { tab: "Alerts", timestamp: Date.now() });
    }
  };

  const handleProfile = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      navigation.navigate("Dashboard", { tab: "Profile", timestamp: Date.now() });
    }
  };

  const isBrandHeader = !title || title === "PowerIQ-AI";

  return (
    <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 10) }]}>
      <View style={styles.contentRow}>
        {/* Left Section: Menu or Back + Brand/Title */}
        <View style={styles.leftGroup}>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={handleMenuOrBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
            accessibilityLabel={canGoBack ? "Back" : "Menu"}
          >
            {canGoBack ? (
              <ArrowLeft size={24} color="#0F172A" strokeWidth={2.2} />
            ) : (
              <Menu size={25} color="#0F172A" strokeWidth={2.2} />
            )}
          </TouchableOpacity>

          {isBrandHeader ? (
            <TouchableOpacity
              style={styles.brandRow}
              activeOpacity={0.9}
              onPress={() => navigation.navigate("Dashboard", { tab: "Home" })}
            >
              <Image
                source={require("../../../assets/poweriq-logo.png")}
                style={styles.powerIqLogo}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.titleCol}>
              <Text style={styles.pageTitle} numberOfLines={1}>
                {title}
              </Text>
            </View>
          )}
        </View>

        {/* Right Section: Notification Bell + Avatar */}
        <View style={styles.rightGroup}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleNotification}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityLabel="Notifications"
          >
            <Bell size={24} color="#0F172A" strokeWidth={2} />
            {unreadAlertCount > 0 && <View style={styles.notificationDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.avatarButton}
            onPress={handleProfile}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
            accessibilityLabel="Profile"
          >
            <View style={styles.avatarCircle}>
              {initials ? (
                <Text style={styles.avatarInitials}>{initials}</Text>
              ) : (
                <User size={19} color="#0284C7" strokeWidth={2.2} />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <SidebarDrawer
        visible={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 10,
  },
  menuButton: {
    paddingRight: 10,
    paddingVertical: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  powerIqLogo: {
    width: 142,
    height: 34,
  },
  titleCol: {
    flex: 1,
    justifyContent: "center",
    marginLeft: 4,
  },
  pageTitle: {
    fontSize: 17.5,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  iconButton: {
    position: "relative",
    padding: 3,
    justifyContent: "center",
    alignItems: "center",
  },
  notificationDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  avatarButton: {
    padding: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  avatarInitials: {
    color: "#0284C7",
    fontSize: 13.5,
    fontWeight: "800",
  },
});
