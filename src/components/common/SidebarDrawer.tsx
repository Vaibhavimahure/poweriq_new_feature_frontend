/**
 * SidebarDrawer.tsx — PowerIQ-AI Navigation Drawer
 * ----------------------------------------------------------------------------
 * Full-featured slide-out navigation drawer opened from the hamburger menu.
 * Contains direct one-tap navigation to ALL app screens:
 *  - Home / Plant Overview
 *  - Alerts Log
 *  - Product-Wise SEC
 *  - Favorite Machine Analytics
 *  - Machine Analytics & Diagnostics
 *  - Plant Avoidable Losses
 *  - Demand Charges & Analysis
 *  - Load Factor Incentive (LFI)
 *  - Discussions & Communication
 *  - System Settings
 *  - User Profile
 *  - Sign Out
 * ----------------------------------------------------------------------------
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../context/AuthContext";
import { CONFIG } from "../../config/constants";
import { PowerIQLogo } from "../PowerIQLogo";
import {
  X,
  Home,
  AlertTriangle,
  Zap,
  Star,
  BarChart2,
  TrendingDown,
  Gauge,
  Percent,
  MessageSquare,
  Settings,
  User,
  LogOut,
  ChevronRight,
} from "lucide-react-native";

interface SidebarDrawerProps {
  visible: boolean;
  onClose: () => void;
  activeRoute?: string;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  visible,
  onClose,
  activeRoute,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();

  const displayName = user?.name || (user as any)?.username || "User";
  const userRole = user?.role || (user as any)?.roleName || "Operator";
  const companyName =
    (user as any)?.company?.name ||
    (user as any)?.company_name ||
    user?.company ||
    "PowerIQ Plant";

  const initials = displayName
    .split(" ")
    .map((part: string) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleNavigate = (routeName: string, params?: any) => {
    onClose();
    setTimeout(() => {
      navigation.navigate(routeName, params);
    }, 150);
  };

  const handleSignOut = async () => {
    onClose();
    await logout();
  };

  const menuSections = [
    {
      title: "CORE MONITORING",
      items: [
        {
          id: "Home",
          label: "Home / Overview",
          icon: Home,
          route: "Dashboard",
          params: { tab: "Home" },
          badge: null,
        },
        {
          id: "Alerts",
          label: "Live Alerts",
          icon: AlertTriangle,
          route: "Dashboard",
          params: { tab: "Alerts" },
          badge: null,
        },
        {
          id: "ProductSec",
          label: "Product-Wise SEC",
          icon: Zap,
          route: "Dashboard",
          params: { tab: "SEC" },
          badge: null,
        },
      ],
    },
    {
      title: "ANALYTICS & KPI",
      items: [
        {
          id: "FavoriteMachine",
          label: "Favorite Machine",
          icon: Star,
          route: "FavoriteMachine",
          badge: null,
        },
        {
          id: "MachineAnalytics",
          label: "Machine Analytics",
          icon: BarChart2,
          route: "MachineAnalytics",
          badge: null,
        },
        {
          id: "PlantAvoidableLosses",
          label: "Avoidable Losses",
          icon: TrendingDown,
          route: "PlantAvoidableLosses",
          badge: null,
        },
        {
          id: "DemandAnalysis",
          label: "Demand Charges",
          icon: Gauge,
          route: "DemandAnalysis",
          badge: null,
        },
        {
          id: "LfiAnalysis",
          label: "Load Factor Incentive (LFI)",
          icon: Percent,
          route: "LfiAnalysis",
          badge: null,
        },
      ],
    },
    {
      title: "COLLABORATION & SYSTEM",
      items: [
        {
          id: "Discussions",
          label: "Discussions & Chat",
          icon: MessageSquare,
          route: "Dashboard",
          params: { tab: "Discussions" },
          badge: null,
        },
        {
          id: "Settings",
          label: "Notification Settings",
          icon: Settings,
          route: "Settings",
          badge: null,
        },
        {
          id: "Profile",
          label: "My Profile",
          icon: User,
          route: "Dashboard",
          params: { tab: "Profile" },
          badge: null,
        },
      ],
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            styles.drawerContainer,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {/* Drawer Header */}
          <View style={styles.header}>
            <PowerIQLogo height={30} />
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={CONFIG.THEME.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* User Profile Card */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials || "PQ"}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.companyName} numberOfLines={1}>
                {companyName}
              </Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{userRole.toUpperCase()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Navigation Links */}
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {menuSections.map((sec, secIdx) => (
              <View key={secIdx} style={styles.sectionBlock}>
                <Text style={styles.sectionHeader}>{sec.title}</Text>
                {sec.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeRoute === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.navItem,
                        isActive && styles.navItemActive,
                      ]}
                      onPress={() => handleNavigate(item.route, (item as any).params)}
                      activeOpacity={0.7}
                    >
                      <View
                        style={[
                          styles.navIconBox,
                          isActive && styles.navIconBoxActive,
                        ]}
                      >
                        <Icon
                          size={18}
                          color={isActive ? "#FFFFFF" : CONFIG.THEME.textSecondary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.navLabel,
                          isActive && styles.navLabelActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <ChevronRight
                        size={16}
                        color={isActive ? CONFIG.THEME.primary : "#CBD5E1"}
                        style={styles.chevron}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            {/* Logout Button */}
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <View style={styles.logoutIconBox}>
                <LogOut size={18} color="#DC2626" />
              </View>
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* App Version Tag */}
          <View style={styles.footer}>
            <Text style={styles.footerVersion}>PowerIQ-AI Mobile v1.1.0</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  backdrop: {
    flex: 1,
  },
  drawerContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "82%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#F8FAFC",
    marginHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CONFIG.THEME.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  companyName: {
    fontSize: 11.5,
    color: CONFIG.THEME.textSecondary,
    marginTop: 1,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  roleText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: CONFIG.THEME.primary,
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginTop: 12,
    marginBottom: 6,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 6,
    paddingHorizontal: 8,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 2,
  },
  navItemActive: {
    backgroundColor: "#EFF6FF",
  },
  navIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  navIconBoxActive: {
    backgroundColor: CONFIG.THEME.primary,
  },
  navLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  navLabelActive: {
    color: CONFIG.THEME.primary,
    fontWeight: "700",
  },
  chevron: {
    marginLeft: 4,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  logoutIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  logoutText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#DC2626",
  },
  footer: {
    paddingTop: 8,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    alignItems: "center",
  },
  footerVersion: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
