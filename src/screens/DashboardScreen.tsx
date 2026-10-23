/**
 * DashboardScreen.tsx — PowerIQ Executive Mobile Dashboard
 * ----------------------------------------------------------------------------
 * High-performance, executive industrial dashboard matching the UI reference:
 *  - Top header with Menu & Notification Bell, time-based greeting, user name
 *  - Premium Hero Banner Card with industrial plant illustration
 *  - Alert Summary section with date dropdown, featured Total Alerts card & 2x2 grid
 *  - Recent Alerts feed with status badges, timestamps & severity pills
 *  - Bottom Navigation Bar: Home, Alerts, Plants, Reports, Profile
 *  - 100% preservation of all existing data fetching, filters, Socket.IO & modals
 * ----------------------------------------------------------------------------
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert as RNAlert,
  Image,
  Modal,
  Dimensions,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAlerts, getTodayYmd } from "../context/AlertContext";
import { useAuth } from "../context/AuthContext";
import { useCommunication } from "../context/CommunicationContext";
import { useCommunicationModule } from "../modules/communication/store/CommunicationContext";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { AlertToast } from "../components/Toast";
import { FilterModal } from "../components/FilterModal";
import { AcknowledgeModal } from "../components/AcknowledgeModal";
import { ResolveModal } from "../components/ResolveModal";
import { AlertItem, DatePreset, ApplyScope, isAlertSolved, isAlertAcknowledged } from "../types/alert";
import { getLifecycleAlertId } from "../api/lifecycleApi";
import { formatCustomDateRangeLabel, formatDisplayDateRange } from "../utils/dateFormatter";
import { getPerformanceMetricName } from "../utils/metrics";
import { isOwnerRole, getRoleLabel, normalizeRole } from "../utils/role";
import { SidebarDrawer } from "../components/common/SidebarDrawer";
import { AppFooter } from "../components/common/AppFooter";
import { AppHeader } from "../components/common/AppHeader";
import {
  Menu,
  Bell,
  Activity,
  BarChart2,
  BarChart3,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CheckCheck,
  Settings,
  ChevronRight,
  ChevronDown,
  Home,
  Factory,
  User,
  Search,
  MessageSquare,
  X,
  RotateCcw,
  SlidersHorizontal,
  LogOut,
  Calendar,
  Layers,
  Radio,
  BellOff,
  TrendingUp,
  ArrowRight,
  Bookmark,
  HelpCircle,
  Info,
  MessageCircle,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const KNOWN_PLANT_PANELS = [
  "VCB Panel",
  "LT Incomer1 PIPE",
  "LT Outgoing 1 HDPE",
  "LT Outgoing 2 Flat line",
  "LT Outgoing 3 RR Round Drip",
  "LT Outgoing 4 LightingDB",
  "LT Outgoing 5 UPS",
  "LT Outgoing Chiller",
  "Plant Utility",
  "HDPE Kabra Panel",
  "Flat Drip Kabra Panel",
  "RR Round Main Motor",
  "Air Compressor",
  "Injection Mould",
  "Chiller Condensor Pumps",
  "Chiller - Process Pumps",
  "Chiller - Evaporator Pumps",
  "Solar Panel",
];


const KNOWN_PLANT_METRICS = [
  "Current Imbalance %",
  "LL Voltage Imbalance %",
  "Power Factor",
  "THD – Current %",
];

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "Dashboard">;
  hideBottomNav?: boolean;
  initialRouteParams?: {
    filterSeverity?: string;
    filterDeviceId?: string;
    filterDeviceName?: string;
    timestamp?: number;
  };
}

type TabKey = "home" | "alerts" | "plants" | "reports" | "profile";

export const DashboardScreen: React.FC<Props> = ({ navigation, hideBottomNav = false, initialRouteParams }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const rawRole = user?.role || (user as any)?.roleName || (user as any)?.role_name || "";
  const canonicalRole = normalizeRole(rawRole);
  const displayRole = getRoleLabel(canonicalRole);
  const isOwner = isOwnerRole(canonicalRole);

  const {
    alerts,
    counters,
    totalAlertsCount,
    isLoading,
    isRefreshing,
    hasMore,
    connectionStatus,
    connectionDetail,
    searchQuery,
    filters,
    activeFilterCount,
    latestIncomingAlert,
    fetchError,
    fetchAlerts,
    loadMore,
    acknowledgeAlertWithScope,
    resolveAlertWithScope,
    setSearchQuery,
    setFilters,
    resetFilters,
    dismissToast,
  } = useAlerts();

  const { unreadCount: unreadDiscussionsCount } = useCommunication();
  const { totalUnreadCount: commUnreadCount } = useCommunicationModule();

  const [activeTab, setActiveTab] = useState<TabKey>("home");
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [selectedAlertForAck, setSelectedAlertForAck] = useState<AlertItem | null>(null);
  const [selectedAlertForResolve, setSelectedAlertForResolve] = useState<AlertItem | null>(null);

  useEffect(() => {
    if (initialRouteParams?.filterSeverity || initialRouteParams?.filterDeviceId) {
      setActiveTab("alerts");
      setFilters({
        severity: (initialRouteParams.filterSeverity as any) || undefined,
        panel: initialRouteParams.filterDeviceId || undefined,
        status: "open",
      });
    }
  }, [initialRouteParams?.filterSeverity, initialRouteParams?.filterDeviceId, initialRouteParams?.timestamp]);

  // Dynamically resolve authenticated user's display name without any hardcoding
  const userDisplayName = useMemo(() => {
    if (!user) return "User";
    const raw =
      user.name ||
      (user as any)?.fullName ||
      (user as any)?.full_name ||
      (user as any)?.username ||
      (user as any)?.userName ||
      (user as any)?.displayName ||
      "";
    if (raw && typeof raw === "string" && raw.trim() && raw.trim().toLowerCase() !== "operator") {
      return raw.trim();
    }
    if (user.email && typeof user.email === "string" && user.email.includes("@")) {
      const prefix = user.email.split("@")[0].trim();
      if (prefix) {
        return prefix
          .replace(/[._-]/g, " ")
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(" ");
      }
    }
    return user.name || "User";
  }, [user]);

  const userInitials = useMemo(() => {
    if (!userDisplayName || userDisplayName === "User") return "U";
    const parts = userDisplayName.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return userDisplayName.slice(0, 2).toUpperCase();
  }, [userDisplayName]);

  // Maintain persistent sets of panels, users, and metrics discovered dynamically
  const knownPanelsRef = useRef(new Set<string>(KNOWN_PLANT_PANELS));
  const knownUsersRef = useRef(new Set<string>());
  const knownMetricsRef = useRef(new Set<string>(KNOWN_PLANT_METRICS));

  if (userDisplayName && userDisplayName !== "User") {
    knownUsersRef.current.add(userDisplayName);
  }

  alerts.forEach((a) => {
    if (a.panel_name) knownPanelsRef.current.add(a.panel_name.trim());
    if (a.ack_user) knownUsersRef.current.add(a.ack_user.trim());
    if (a.ack_user_name) knownUsersRef.current.add(a.ack_user_name.trim());
    if (a.clear_user) knownUsersRef.current.add(a.clear_user.trim());
    if (a.solved_user) knownUsersRef.current.add(a.solved_user.trim());
    if (a.solved_user_name) knownUsersRef.current.add(a.solved_user_name.trim());
    const mName = getPerformanceMetricName(a.tag_name);
    if (mName && mName !== "Performance Metric") knownMetricsRef.current.add(mName);
  });

  const availablePanels = useMemo(() => Array.from(knownPanelsRef.current).sort(), [alerts]);
  const availableUsers = useMemo(() => Array.from(knownUsersRef.current).sort(), [alerts]);
  const availableMetrics = useMemo(() => Array.from(knownMetricsRef.current).sort(), [alerts]);

  // Synchronize searchInput when searchQuery changes externally (e.g. on resetFilters)
  useEffect(() => {
    setSearchInput(searchQuery);
  }, [searchQuery]);

  // Debounce syncing searchInput to AlertContext searchQuery so backend candidates are queried
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== searchQuery) {
        setSearchQuery(trimmed);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, setSearchQuery]);

  // Instant real-time filtered alert list as user types
  const displayedAlerts = useMemo(() => {
    const query = (searchInput || searchQuery || "").trim().toLowerCase();
    if (!query) {
      return alerts;
    }
    return alerts.filter((alert) => {
      const metric = getPerformanceMetricName(alert.tag_name);
      const searchable = [
        alert.panel_name,
        alert.panel_location,
        alert.panel_id,
        alert.tag_name,
        alert.metric_key,
        metric,
        alert.device_id,
        (alert as any).did,
        alert.message,
        alert.severity,
        alert.ack_user,
        alert.ack_user_name,
        alert.ack_user_email,
        alert.clear_user,
        alert.solved_user,
        alert.solved_user_name,
        alert.solved_user_email,
        (alert as any).user,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [alerts, searchInput, searchQuery]);

  const handleSearchSubmit = () => {
    setSearchQuery(searchInput.trim());
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
  };

  const handleLogout = () => {
    setIsMenuModalOpen(false);
    const doLogout = () => {
      logout().catch((err) => console.warn("[DashboardScreen] Logout error:", err));
    };

    if (Platform.OS === "web") {
      const confirmed =
        typeof window !== "undefined" && window.confirm
          ? window.confirm("Are you sure you want to sign out from PowerIQ Alerts?")
          : true;
      if (confirmed) {
        doLogout();
      }
      return;
    }

    RNAlert.alert("Sign Out", "Are you sure you want to sign out from PowerIQ Alerts?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: doLogout,
      },
    ]);
  };

  const handleConfirmAck = async (scope: ApplyScope, note: string) => {
    if (!selectedAlertForAck) return;
    const id = getLifecycleAlertId(selectedAlertForAck);
    if (!id) return;
    await acknowledgeAlertWithScope(id, scope, note, selectedAlertForAck);
  };

  const handleConfirmResolve = async (scope: ApplyScope, resolutionNote: string) => {
    if (!selectedAlertForResolve) return;
    const id = getLifecycleAlertId(selectedAlertForResolve);
    if (!id) return;
    await resolveAlertWithScope(id, scope, resolutionNote, selectedAlertForResolve);
  };

  const getDatePresetLabel = (preset: DatePreset) => {
    switch (preset) {
      case "today":
        return "Today";
      case "yesterday":
        return "Yesterday";
      case "week":
        return "Last 7 Days";
      case "month":
        return "Last 30 Days";
      case "custom":
        return formatCustomDateRangeLabel(filters.customStartDate, filters.customEndDate);
      default:
        return "All Time";
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning,";
    if (hour < 17) return "Good Afternoon,";
    return "Good Evening,";
  };

  const formatAlertTime = (ts?: string) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return "";
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } catch {
      return "";
    }
  };

  // Recent Alerts Item Renderer matching reference design
  const renderItem = ({ item }: { item: AlertItem }) => {
    const isCritical = (item.severity || "").toLowerCase() === "critical";
    const isSolved = isAlertSolved(item);
    const isAcked = isAlertAcknowledged(item) && !isSolved;
    const timeFormatted = formatAlertTime(item.ts || item.createdAt) || "06:43";
    const metricName =
      getPerformanceMetricName(item.tag_name) || item.tag_name || "Operational Metric";

    return (
      <TouchableOpacity
        style={[
          styles.recentAlertCard,
          isSolved && styles.recentAlertCardSolved,
          isAcked && styles.recentAlertCardAcked,
        ]}
        onPress={() =>
          navigation.navigate("AlertDetail", {
            alert: item,
            alertId: item._id || item.alert_id,
          })
        }
        activeOpacity={0.7}
      >
        <View style={styles.recentAlertLeft}>
          <View
            style={[
              styles.recentAlertIconCircle,
              {
                backgroundColor: isSolved
                  ? "#DCFCE7"
                  : isAcked
                    ? "#E0E7FF"
                    : isCritical
                      ? "#FEE2E2"
                      : "#FEF3C7",
              },
            ]}
          >
            {isSolved ? (
              <CheckCircle2 size={18} color="#16A34A" />
            ) : isAcked ? (
              <CheckCheck size={18} color="#4F46E5" />
            ) : isCritical ? (
              <AlertCircle size={18} color="#DC2626" />
            ) : (
              <AlertTriangle size={18} color="#D97706" />
            )}
          </View>

          <View style={styles.recentAlertDetails}>
            <Text style={styles.recentAlertPanel} numberOfLines={1}>
              {item.panel_name || "Equipment Panel"}
            </Text>
            <Text style={styles.recentAlertMetric} numberOfLines={1}>
              {metricName}
            </Text>
          </View>
        </View>

        <View style={styles.recentAlertRight}>
          <View style={styles.recentAlertMeta}>
            <Text style={styles.recentAlertTime}>{timeFormatted}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              {isAcked && (
                <View
                  style={[
                    styles.recentAlertPill,
                    { backgroundColor: "#E0E7FF" },
                  ]}
                >
                  <Text
                    style={[
                      styles.recentAlertPillText,
                      { color: "#4F46E5" },
                    ]}
                  >
                    ACK
                  </Text>
                </View>
              )}
              {isSolved && (
                <View
                  style={[
                    styles.recentAlertPill,
                    { backgroundColor: "#DCFCE7" },
                  ]}
                >
                  <Text
                    style={[
                      styles.recentAlertPillText,
                      { color: "#16A34A" },
                    ]}
                  >
                    SOLVED
                  </Text>
                </View>
              )}
              <View
                style={[
                  styles.recentAlertPill,
                  { backgroundColor: isCritical ? "#FEE2E2" : "#FEF3C7" },
                ]}
              >
                <Text
                  style={[
                    styles.recentAlertPillText,
                    { color: isCritical ? "#DC2626" : "#D97706" },
                  ]}
                >
                  {isCritical ? "CRITICAL" : "WARNING"}
                </Text>
              </View>
            </View>
          </View>
          <ChevronRight size={16} color="#94A3B8" style={{ marginLeft: 6 }} />
        </View>
      </TouchableOpacity>
    );
  };

  // Main Header Component on top of the list
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* ── 1. Alert Summary Section ─────────────────────────────── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeading}>Alert Summary</Text>
        <TouchableOpacity
          style={styles.dateSelectorBtn}
          onPress={() => setIsFilterModalOpen(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.dateSelectorText}>
            {formatDisplayDateRange(filters.customStartDate, filters.customEndDate)}
          </Text>
          <ChevronDown size={14} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Featured Total Alerts Card */}
      <TouchableOpacity
        style={[
          styles.totalAlertsCard,
          filters.severity === "ALL" &&
          filters.status === "ALL" &&
          filters.resolution === "ALL" &&
          styles.cardActiveHighlight,
        ]}
        onPress={() =>
          setFilters((prev) => ({
            ...prev,
            severity: "ALL",
            status: "ALL",
            resolution: "ALL",
          }))
        }
        activeOpacity={0.8}
      >
        <View style={styles.totalAlertsLeft}>
          <View style={styles.totalAlertsIconWrap}>
            <Activity size={22} color="#0284C7" />
          </View>
          <View style={styles.totalAlertsData}>
            <Text style={styles.totalAlertsLabel}>Total Alerts</Text>
            <View style={styles.totalAlertsValueRow}>
              <Text style={styles.totalAlertsCount}>{totalAlertsCount}</Text>
              <BarChart2 size={24} color="#94A3B8" style={{ marginLeft: 16 }} />
            </View>
          </View>
        </View>

        <View style={styles.totalAlertsDivider} />

        <View style={styles.totalAlertsRight}>
          <Text style={styles.totalAlertsTrend}>
            {counters.pending_critical + counters.pending_warning}
          </Text>
          <Text style={styles.totalAlertsSub}>pending alerts</Text>
        </View>
      </TouchableOpacity>

      {/* 2x2 Quick Action Cards Grid */}
      <View style={styles.metricsGrid}>
        {/* Pending Critical */}
        <TouchableOpacity
          style={[
            styles.gridCard,
            filters.severity === "critical" &&
            filters.resolution === "unsolved" &&
            styles.gridCardActive,
          ]}
          onPress={() =>
            setFilters((prev) => {
              const isActive =
                prev.severity === "critical" &&
                prev.resolution === "unsolved";
              return {
                ...prev,
                severity: isActive ? "ALL" : "critical",
                status: "ALL",
                resolution: isActive ? "ALL" : "unsolved",
              };
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.gridCardLeft}>
            <View style={[styles.gridCardIconCircle, { backgroundColor: "#FEE2E2" }]}>
              <AlertCircle size={18} color="#DC2626" />
            </View>
            <View style={styles.gridCardInfo}>
              <Text style={styles.gridCardTitle}>Pending Critical</Text>
              <Text style={styles.gridCardCount}>{counters.pending_critical}</Text>
            </View>
          </View>
          <ChevronRight size={16} color="#94A3B8" />
        </TouchableOpacity>

        {/* Pending Warning */}
        <TouchableOpacity
          style={[
            styles.gridCard,
            filters.severity === "warning" &&
            filters.resolution === "unsolved" &&
            styles.gridCardActive,
          ]}
          onPress={() =>
            setFilters((prev) => {
              const isActive =
                prev.severity === "warning" &&
                prev.resolution === "unsolved";
              return {
                ...prev,
                severity: isActive ? "ALL" : "warning",
                status: "ALL",
                resolution: isActive ? "ALL" : "unsolved",
              };
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.gridCardLeft}>
            <View style={[styles.gridCardIconCircle, { backgroundColor: "#FEF3C7" }]}>
              <AlertTriangle size={18} color="#D97706" />
            </View>
            <View style={styles.gridCardInfo}>
              <Text style={styles.gridCardTitle}>Pending Warning</Text>
              <Text style={styles.gridCardCount}>{counters.pending_warning}</Text>
            </View>
          </View>
          <ChevronRight size={16} color="#94A3B8" />
        </TouchableOpacity>

        {/* Solved */}
        <TouchableOpacity
          style={[
            styles.gridCard,
            (filters.status === "solved" || filters.resolution === "solved") &&
            filters.severity === "ALL" &&
            styles.gridCardActive,
          ]}
          onPress={() =>
            setFilters((prev) => {
              const isActive =
                (prev.status === "solved" || prev.resolution === "solved") &&
                prev.severity === "ALL";
              return {
                ...prev,
                severity: "ALL", // Always clear severity to ALL so ALL solved alerts (both critical & warning) show
                status: isActive ? "ALL" : "solved",
                resolution: isActive ? "ALL" : "solved",
              };
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.gridCardLeft}>
            <View style={[styles.gridCardIconCircle, { backgroundColor: "#DCFCE7" }]}>
              <CheckCircle2 size={18} color="#16A34A" />
            </View>
            <View style={styles.gridCardInfo}>
              <Text style={styles.gridCardTitle}>Total Solved</Text>
              <Text style={styles.gridCardCount}>
                {counters.all_solved ?? 0}
              </Text>
            </View>
          </View>
          <ChevronRight size={16} color="#94A3B8" />
        </TouchableOpacity>

        {/* Acknowledged */}
        <TouchableOpacity
          style={[
            styles.gridCard,
            filters.status === "acknowledged" &&
            filters.severity === "ALL" &&
            styles.gridCardActive,
          ]}
          onPress={() =>
            setFilters((prev) => {
              const isActive =
                prev.status === "acknowledged" && prev.severity === "ALL";
              return {
                ...prev,
                severity: "ALL", // Always clear severity to ALL so ALL acknowledged alerts show
                status: isActive ? "ALL" : "acknowledged",
                resolution: "ALL",
              };
            })
          }
          activeOpacity={0.8}
        >
          <View style={styles.gridCardLeft}>
            <View style={[styles.gridCardIconCircle, { backgroundColor: "#E0E7FF" }]}>
              <CheckCheck size={18} color="#4F46E5" />
            </View>
            <View style={styles.gridCardInfo}>
              <Text style={styles.gridCardTitle}>Acknowledged</Text>
              <Text style={styles.gridCardCount}>
                {counters.acknowledged ?? 0}
              </Text>
            </View>
          </View>
          <ChevronRight size={16} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* ── 4. Search & Filter Bar (Shown in Alerts mode or when search active) ── */}
      {(activeTab === "alerts" || searchQuery.trim() !== "" || activeFilterCount > 0) && (
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Search size={16} color="#64748B" style={{ marginRight: 8 }} />
            <TextInput
              key="dashboard-search-input"
              style={styles.searchInput}
              placeholder="Search panel, tag, device or message..."
              placeholderTextColor="#94A3B8"
              value={searchInput}
              onChangeText={setSearchInput}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchInput.length > 0 ? (
              <TouchableOpacity onPress={handleClearSearch} style={styles.clearSearchBtn}>
                <X size={15} color="#64748B" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setIsFilterModalOpen(true)}
                style={styles.clearSearchBtn}
              >
                <SlidersHorizontal size={15} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Active Filter Chips */}
          {activeFilterCount > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeChipsContent}
            >
              {Boolean((filters.customStartDate && filters.customStartDate !== getTodayYmd()) || (filters.customEndDate && filters.customEndDate !== getTodayYmd())) && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() =>
                    setFilters({
                      customStartDate: getTodayYmd(),
                      customEndDate: getTodayYmd(),
                    })
                  }
                >
                  <Text style={styles.chipText}>
                    {formatDisplayDateRange(filters.customStartDate, filters.customEndDate)}
                  </Text>
                  <X size={12} color="#475569" />
                </TouchableOpacity>
              )}

              {filters.severity !== "ALL" && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setFilters({ severity: "ALL" })}
                >
                  <Text style={styles.chipText}>Severity: {filters.severity}</Text>
                  <X size={12} color="#475569" />
                </TouchableOpacity>
              )}

              {filters.status !== "ALL" && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setFilters({ status: "ALL" })}
                >
                  <Text style={styles.chipText}>Status: {filters.status}</Text>
                  <X size={12} color="#475569" />
                </TouchableOpacity>
              )}

              {filters.resolution && filters.resolution !== "ALL" && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setFilters({ resolution: "ALL" })}
                >
                  <Text style={styles.chipText}>Resolution: {filters.resolution}</Text>
                  <X size={12} color="#475569" />
                </TouchableOpacity>
              )}

              {filters.panel !== "" && filters.panel !== "ALL" && (
                <TouchableOpacity
                  style={styles.chip}
                  onPress={() => setFilters({ panel: "" })}
                >
                  <Text style={styles.chipText}>Panel: {filters.panel}</Text>
                  <X size={12} color="#475569" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.clearAllBtn} onPress={resetFilters}>
                <RotateCcw size={11} color="#DC2626" />
                <Text style={styles.clearAllBtnText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      )}

      {/* ── 5. Recent Alerts Header ─────────────────────────────── */}
      <View style={[styles.sectionHeaderRow, { marginTop: 26, marginBottom: 12 }]}>
        <Text style={styles.sectionHeading}>Recent Alerts</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => {
            if (activeTab === "alerts") {
              setActiveTab("home");
            } else {
              setActiveTab("alerts");
            }
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>
            {activeTab === "alerts" ? "Show Summary" : "View All"}
          </Text>
          <ChevronRight size={14} color="#64748B" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => {
    if (isLoading && !isRefreshing) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.emptySubtitle}>Loading live alerts...</Text>
        </View>
      );
    }

    if (fetchError) {
      return (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: "#FEE2E2" }]}>
            <BellOff size={28} color="#DC2626" />
          </View>
          <Text style={[styles.emptyTitle, { color: "#DC2626" }]}>Unable to Load Alerts</Text>
          <Text style={styles.emptySubtitle}>{fetchError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchAlerts()}>
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const activeSearch = (searchInput || searchQuery || "").trim();
    if (activeSearch) {
      return (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: "#F1F5F9" }]}>
            <Search size={28} color="#64748B" />
          </View>
          <Text style={styles.emptyTitle}>No Matching Alerts</Text>
          <Text style={styles.emptySubtitle}>
            No alerts found matching "{activeSearch}". Try checking your spelling or clear your search.
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={handleClearSearch}>
            <Text style={styles.retryBtnText}>Clear Search</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <CheckCircle2 size={28} color="#16A34A" />
        </View>
        <Text style={styles.emptyTitle}>All Systems Normal</Text>
        <Text style={styles.emptySubtitle}>
          No active alarms match your current filters or selected timeframe.
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!hasMore || displayedAlerts.length === 0) return <View style={{ height: 80 }} />;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#2563EB" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Real-time In-App Notification Toast Banner */}
      <AlertToast
        alert={latestIncomingAlert}
        onPress={(alert) =>
          navigation.navigate("AlertDetail", {
            alert,
            alertId: alert._id || alert.alert_id,
          })
        }
        onDismiss={dismissToast}
      />

      {/* ── Fixed Edge-to-Edge App Header (matches Home, SEC & Discussions) ── */}
      <AppHeader
        onMenuPress={() => setIsMenuModalOpen(true)}
        unreadAlertCount={counters.pending_critical + counters.pending_warning}
      />

      {/* Main Content: Plants / Reports Placeholders OR Alert Feed */}
      {activeTab === "plants" ? (
        <View style={styles.placeholderContainer}>
          <View style={[styles.placeholderHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.placeholderHeaderTitle}>Plants</Text>
          </View>
          <View style={styles.placeholderBody}>
            <View style={styles.placeholderIconBox}>
              <Factory size={38} color="#64748B" />
            </View>
            <Text style={styles.placeholderTitle}>Nothing to show</Text>
            <Text style={styles.placeholderSubtitle}>
              Plant details and live equipment monitoring will appear here once configured.
            </Text>
            <TouchableOpacity
              style={styles.placeholderBtn}
              onPress={() => setActiveTab("home")}
              activeOpacity={0.7}
            >
              <Text style={styles.placeholderBtnText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : activeTab === "reports" ? (
        <View style={styles.placeholderContainer}>
          <View style={[styles.placeholderHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.placeholderHeaderTitle}>Reports</Text>
          </View>
          <View style={styles.placeholderBody}>
            <View style={styles.placeholderIconBox}>
              <BarChart3 size={38} color="#64748B" />
            </View>
            <Text style={styles.placeholderTitle}>Nothing to show</Text>
            <Text style={styles.placeholderSubtitle}>
              Analytics, operational summaries, and exportable reports will appear here once generated.
            </Text>
            <TouchableOpacity
              style={styles.placeholderBtn}
              onPress={() => setActiveTab("home")}
              activeOpacity={0.7}
            >
              <Text style={styles.placeholderBtnText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : activeTab === "profile" ? (
        <ScrollView
          style={styles.profileContainer}
          contentContainerStyle={[
            styles.profileContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 80 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Header */}
          <View style={[styles.profileHeader, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.profileHeaderTitle}>Profile</Text>
            <TouchableOpacity
              style={styles.profileHeaderIconBtn}
              onPress={() => navigation.navigate("Settings")}
              activeOpacity={0.7}
            >
              <Settings size={20} color="#0F172A" />
            </TouchableOpacity>
          </View>

          {/* User Card */}
          <View style={styles.profileUserCard}>
            <View style={styles.profileBigAvatar}>
              <Text style={styles.profileBigAvatarText}>{userInitials}</Text>
            </View>
            <View style={styles.profileUserInfo}>
              <Text style={styles.profileUserName}>{userDisplayName}</Text>
              <Text style={styles.profileUserRole}>
                {(user as any)?.companyId ? `${(user as any).companyId} · ` : ""}
                {displayRole}
              </Text>
            </View>
          </View>

          {/* Discussions & Plants Group */}
          <View style={styles.profileSection}>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => setActiveTab("plants")}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#EFF6FF" }]}>
                  <Factory size={18} color="#2563EB" />
                </View>
                <Text style={styles.profileMenuTitle}>My Plants</Text>
              </View>
              <View style={styles.profileMenuRight}>
                <Text style={styles.profileMenuValue}>1 Plant</Text>
                <ChevronRight size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileMenuDivider} />

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => navigation.navigate("Discussions")}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#EFF6FF" }]}>
                  <MessageSquare size={18} color="#2563EB" />
                </View>
                <Text style={styles.profileMenuTitle}>My Discussions</Text>
              </View>
              <View style={styles.profileMenuRight}>
                <Text style={styles.profileMenuValue}>
                  {unreadDiscussionsCount > 0 ? `${unreadDiscussionsCount} Active` : "Active"}
                </Text>
                <ChevronRight size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileMenuDivider} />

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => navigation.navigate("Discussions", { initialTab: "community" } as any)}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#F0FDF4" }]}>
                  <MessageCircle size={18} color="#16A34A" />
                </View>
                <Text style={styles.profileMenuTitle}>My Community Questions</Text>
              </View>
              <View style={styles.profileMenuRight}>
                <ChevronRight size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            <View style={styles.profileMenuDivider} />

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => navigation.navigate("Discussions", { initialTab: "community" } as any)}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#FEF3C7" }]}>
                  <Bookmark size={18} color="#D97706" />
                </View>
                <Text style={styles.profileMenuTitle}>Saved Answers</Text>
              </View>
              <View style={styles.profileMenuRight}>
                <ChevronRight size={16} color="#94A3B8" />
              </View>
            </TouchableOpacity>
          </View>

          {/* System & Support Group */}
          <View style={styles.profileSection}>
            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => navigation.navigate("Settings")}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#F1F5F9" }]}>
                  <Settings size={18} color="#475569" />
                </View>
                <Text style={styles.profileMenuTitle}>App Settings</Text>
              </View>
              <ChevronRight size={16} color="#94A3B8" />
            </TouchableOpacity>

            <View style={styles.profileMenuDivider} />

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => setIsMenuModalOpen(true)}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#F1F5F9" }]}>
                  <HelpCircle size={18} color="#475569" />
                </View>
                <Text style={styles.profileMenuTitle}>Help & Support</Text>
              </View>
              <ChevronRight size={16} color="#94A3B8" />
            </TouchableOpacity>

            <View style={styles.profileMenuDivider} />

            <TouchableOpacity
              style={styles.profileMenuItem}
              onPress={() => setIsMenuModalOpen(true)}
              activeOpacity={0.7}
            >
              <View style={styles.profileMenuLeft}>
                <View style={[styles.profileMenuIconBox, { backgroundColor: "#F1F5F9" }]}>
                  <Info size={18} color="#475569" />
                </View>
                <Text style={styles.profileMenuTitle}>About PowerIQ</Text>
              </View>
              <ChevronRight size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Sign Out Button */}
          <TouchableOpacity
            style={styles.profileSignOutBtn}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <LogOut size={18} color="#EF4444" />
            <Text style={styles.profileSignOutText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* Main Alert Feed */
        <FlatList
          data={displayedAlerts}
          keyExtractor={(item) => item._id || item.alert_id || String(Math.random())}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader()}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={renderFooter()}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchAlerts(true)}
              colors={["#2563EB"]}
              tintColor="#2563EB"
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Fixed Bottom Navigation Bar (Hidden when nested in MainAppNavigator) ── */}
      {!hideBottomNav && (
        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setActiveTab("home")}
            activeOpacity={0.7}
          >
            <Home size={22} color={activeTab === "home" ? "#2563EB" : "#64748B"} />
            <Text
              style={[
                styles.bottomNavLabel,
                activeTab === "home" && styles.bottomNavLabelActive,
              ]}
            >
              Home
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setActiveTab("alerts")}
            activeOpacity={0.7}
          >
            <View>
              <Bell size={22} color={activeTab === "alerts" ? "#2563EB" : "#64748B"} />
            </View>
            <Text
              style={[
                styles.bottomNavLabel,
                activeTab === "alerts" && styles.bottomNavLabelActive,
              ]}
            >
              Alerts
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setActiveTab("plants")}
            activeOpacity={0.7}
          >
            <Factory size={22} color={activeTab === "plants" ? "#2563EB" : "#64748B"} />
            <Text
              style={[
                styles.bottomNavLabel,
                activeTab === "plants" && styles.bottomNavLabelActive,
              ]}
            >
              Plants
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => navigation.navigate("Discussions")}
            activeOpacity={0.7}
          >
            <View>
              <MessageSquare size={22} color="#64748B" />
            </View>
            <Text style={styles.bottomNavLabel}>Discussions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomNavItem}
            onPress={() => setActiveTab("profile")}
            activeOpacity={0.7}
          >
            <User size={22} color={activeTab === "profile" ? "#2563EB" : "#64748B"} />
            <Text
              style={[
                styles.bottomNavLabel,
                activeTab === "profile" && styles.bottomNavLabelActive,
              ]}
            >
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Universal Sidebar Navigation Drawer ─────────────────── */}
      <SidebarDrawer
        visible={isMenuModalOpen}
        onClose={() => setIsMenuModalOpen(false)}
        activeRoute="Alerts"
      />

      {/* Filter Bottom Sheet Modal */}
      <FilterModal
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        availablePanels={availablePanels}
        availableUsers={availableUsers}
        availableMetrics={availableMetrics}
        currentFilters={filters}
        totalCount={totalAlertsCount}
        onApply={(newFilters) => setFilters(newFilters)}
        onReset={resetFilters}
      />

      {/* Lifecycle Acknowledge Modal */}
      <AcknowledgeModal
        visible={!!selectedAlertForAck}
        onClose={() => setSelectedAlertForAck(null)}
        alert={selectedAlertForAck}
        onConfirm={handleConfirmAck}
      />

      {/* Lifecycle Resolve Modal */}
      <ResolveModal
        visible={!!selectedAlertForResolve}
        onClose={() => setSelectedAlertForResolve(null)}
        alert={selectedAlertForResolve}
        onConfirm={handleConfirmResolve}
      />
      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="Alerts" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F0F4F8",
  },
  listContent: {
    paddingBottom: 24,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  // ── Top Header & Hero Banner ──────────────────────────────────────────────
  topSectionWrapper: {
    position: "relative",
    marginBottom: 20,
  },
  topHeaderNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    zIndex: 10,
  },
  headerNavBtn: {
    padding: 6,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  bellBadgeDot: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#EF4444",
  },
  greetingBlock: {
    maxWidth: "60%",
    marginBottom: 14,
    zIndex: 4,
  },
  greetingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 2,
  },
  userNameText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  userSubtitleText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 3,
  },

  // ── Hero Banner Card ───────────────────────────────────────────────────────
  heroBannerWrapper: {
    width: "100%",
    position: "relative",
    marginTop: 16,
    marginBottom: 12,
  },
  heroBannerContainer: {
    width: "100%",
    minHeight: 135,
    backgroundColor: "#1B324B",
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  heroBannerImage: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 455,
    height: 267,
    borderBottomRightRadius: 20,
  },
  heroContent: {
    maxWidth: "58%",
    zIndex: 10,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.85)",
    marginTop: 8,
  },
  heroArrowCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 3,
  },

  // ── Section Headers ────────────────────────────────────────────────────────
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  dateSelectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dateSelectorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },

  // ── Total Alerts Featured Card ─────────────────────────────────────────────
  totalAlertsCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 12,
  },
  cardActiveHighlight: {
    borderColor: "#2563EB",
    borderWidth: 1.5,
  },
  totalAlertsLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  totalAlertsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  totalAlertsData: {
    flex: 1,
  },
  totalAlertsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 2,
  },
  totalAlertsValueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalAlertsCount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.5,
  },
  totalAlertsDivider: {
    width: 1,
    height: 42,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 14,
  },
  totalAlertsRight: {
    alignItems: "flex-end",
    minWidth: 78,
  },
  totalAlertsTrend: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  totalAlertsSub: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
  },

  // ── 2x2 Grid Cards ─────────────────────────────────────────────────────────
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  gridCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  gridCardActive: {
    borderColor: "#2563EB",
    borderWidth: 1.5,
  },
  gridCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  gridCardIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  gridCardInfo: {
    flex: 1,
  },
  gridCardTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    lineHeight: 14,
    marginBottom: 2,
  },
  gridCardCount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },

  // ── Search & Filter Bar ────────────────────────────────────────────────────
  searchSection: {
    marginTop: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
  },
  clearSearchBtn: {
    padding: 4,
  },
  activeChipsContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  clearAllBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },

  // ── Recent Alerts Feed Item ────────────────────────────────────────────────
  recentAlertCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  recentAlertCardSolved: {
    borderBottomWidth: 3.5,
    borderBottomColor: "#16A34A",
  },
  recentAlertCardAcked: {
    borderBottomWidth: 3.5,
    borderBottomColor: "#4F46E5",
  },
  recentAlertLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  recentAlertIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  recentAlertDetails: {
    flex: 1,
  },
  recentAlertPanel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  recentAlertMetric: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 2,
  },
  recentAlertRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  recentAlertMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  recentAlertTime: {
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  recentAlertPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  recentAlertPillText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
  },

  // ── Empty & Status States ──────────────────────────────────────────────────
  emptyContainer: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: "400",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: "center",
  },

  // ── Bottom Navigation Bar ──────────────────────────────────────────────────
  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomNavItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    position: "relative",
  },
  bottomNavBadgeDot: {
    position: "absolute",
    top: 0,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#EF4444",
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#64748B",
    marginTop: 4,
  },
  bottomNavLabelActive: {
    color: "#2563EB",
    fontWeight: "700",
  },

  // ── Hamburger Menu Modal / Drawer Sheet ────────────────────────────────────
  menuModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  menuSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 16,
  },
  menuUserProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 12,
  },
  menuAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  menuAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#2563EB",
  },
  menuUserInfo: {
    flex: 1,
  },
  menuUserName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  menuRoleBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  menuRoleText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 12,
  },
  menuActionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  menuActionText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  placeholderContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  placeholderHeader: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  placeholderHeaderTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  placeholderBody: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 36,
    paddingBottom: 60,
  },
  placeholderIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 18,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    textAlign: "center",
  },
  placeholderSubtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  placeholderBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  placeholderBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  profileContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  profileContent: {
    padding: 16,
    gap: 16,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  profileHeaderTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  profileHeaderIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  profileUserCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  profileBigAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  profileBigAvatarText: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  profileUserInfo: {
    flex: 1,
  },
  profileUserName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 4,
  },
  profileUserRole: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  profileSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 4,
    overflow: "hidden",
  },
  profileMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  profileMenuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileMenuIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  profileMenuTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  profileMenuRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  profileMenuValue: {
    fontSize: 13,
    color: "#64748B",
    fontWeight: "500",
  },
  profileMenuDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginLeft: 62,
  },
  profileSignOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  profileSignOutText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#EF4444",
  },
});
