import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import {
  MessageSquare,
  Search,
  Plus,
  AlertCircle,
  AlertTriangle,
  Info,
  Users,
  Factory,
  Globe,
  ChevronRight,
  ThumbsUp,
  X,
} from "lucide-react-native";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { useCommunication } from "../context/CommunicationContext";
import { DiscussionItem, CommunityQuestion } from "../types/communication";
import { communicationApi } from "../api/communicationApi";
import { AppFooter } from "../components/common/AppFooter";
import { AppHeader } from "../components/common/AppHeader";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "Discussions">;
  route: RouteProp<RootStackParamList, "Discussions">;
}

type TabType = "all" | "alert" | "plant" | "community";

export const DiscussionsScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const {
    discussions,
    isLoading,
    isRefreshing,
    fetchDiscussions,
    activeFilterTab,
    setActiveFilterTab,
    searchQuery,
    setSearchQuery,
  } = useCommunication();

  // If initialTab was specified (e.g. from Profile -> My Community Questions), switch to it
  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveFilterTab(route.params.initialTab);
    }
  }, [route.params?.initialTab, setActiveFilterTab]);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [communityQuestions, setCommunityQuestions] = useState<CommunityQuestion[]>([]);
  const [isLoadingCommunity, setIsLoadingCommunity] = useState(false);

  const loadCommunityQuestions = useCallback(async () => {
    setIsLoadingCommunity(true);
    try {
      const res = await communicationApi.listCommunityQuestions({
        search: searchQuery.trim() || undefined,
      });
      setCommunityQuestions(res.data || []);
    } catch (e: any) {
      console.warn("Error loading community questions:", e?.message);
    } finally {
      setIsLoadingCommunity(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (activeFilterTab === "community") {
      loadCommunityQuestions();
    }
  }, [activeFilterTab, loadCommunityQuestions]);

  const handleRefresh = async () => {
    if (activeFilterTab === "community") {
      await loadCommunityQuestions();
    } else {
      await fetchDiscussions(true);
    }
  };

  const alertDiscussions = discussions.filter((d) => d.type === "ALERT");
  const plantDiscussions = discussions.filter((d) => d.type === "PLANT");

  const formatElapsed = (dateStr?: string | Date) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.max(1, Math.floor((now.getTime() - date.getTime()) / (1000 * 60)));

    if (diffMin < 60) return `${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  const formatTimeHeader = (dateStr?: string | Date) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderAlertDiscussionCard = (item: DiscussionItem) => {
    const severity = item.alertContext?.severity || "info";

    return (
      <TouchableOpacity
        key={item._id}
        style={[styles.discussionCard, item.isUnread && styles.unreadCard]}
        onPress={() =>
          navigation.navigate("DiscussionChat", {
            discussionId: item._id,
            title: item.title,
            alertId: item.alertId,
          })
        }
        activeOpacity={0.75}
      >
        <View style={styles.cardMainRow}>
          {/* Severity Icon Pill */}
          <View
            style={[
              styles.severityIconBox,
              severity === "critical"
                ? styles.severityCritBox
                : severity === "warning"
                ? styles.severityWarnBox
                : styles.severityInfoBox,
            ]}
          >
            {severity === "critical" ? (
              <AlertCircle size={20} color="#DC2626" />
            ) : severity === "warning" ? (
              <AlertTriangle size={20} color="#D97706" />
            ) : (
              <Info size={20} color="#2563EB" />
            )}
          </View>

          {/* Center Info */}
          <View style={styles.cardCenterInfo}>
            <Text style={styles.cardPanelTitle} numberOfLines={1}>
              {item.alertContext?.panelName || item.title}
            </Text>

            <Text style={styles.cardParameterLine} numberOfLines={1}>
              {item.alertContext?.tagName || "Alert parameter"} •{" "}
              <Text
                style={[
                  styles.severityTagText,
                  severity === "critical"
                    ? styles.colorCrit
                    : severity === "warning"
                    ? styles.colorWarn
                    : styles.colorInfo,
                ]}
              >
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </Text>
            </Text>

            <Text style={styles.cardPlantLocation}>
              {formatTimeHeader(item.updatedAt)}
              {item.alertContext?.plantName ? ` • ${item.alertContext.plantName}` : " • Facility Plant"}
            </Text>

            {item.lastMessage?.text ? (
              <Text style={styles.cardLastMessage} numberOfLines={1}>
                {item.lastMessage.senderName ? `${item.lastMessage.senderName}: ` : ""}
                {item.lastMessage.text}
              </Text>
            ) : null}
          </View>

          {/* Right Info: Time + Chevron + Avatars */}
          <View style={styles.cardRightColumn}>
            <View style={styles.elapsedRow}>
              <Text style={styles.elapsedText}>{formatElapsed(item.updatedAt)}</Text>
              <ChevronRight size={14} color="#94A3B8" />
            </View>

            {/* Avatar Stack */}
            <View style={styles.avatarStack}>
              {item.participants.slice(0, 2).map((p, idx) => (
                <View
                  key={p.userId || idx}
                  style={[
                    styles.stackedAvatar,
                    idx > 0 && { marginLeft: -8 },
                    { backgroundColor: idx === 0 ? "#EFF6FF" : "#FEF3C7" },
                  ]}
                >
                  <Text
                    style={[
                      styles.stackedAvatarText,
                      { color: idx === 0 ? "#2563EB" : "#D97706" },
                    ]}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              ))}
              {item.participants.length > 2 && (
                <View style={[styles.stackedAvatar, styles.stackedCountAvatar]}>
                  <Text style={styles.stackedCountText}>+{item.participants.length - 2}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPlantDiscussionCard = (item: DiscussionItem) => {
    return (
      <TouchableOpacity
        key={item._id}
        style={[styles.discussionCard, item.isUnread && styles.unreadCard]}
        onPress={() =>
          navigation.navigate("DiscussionChat", {
            discussionId: item._id,
            title: item.title,
          })
        }
        activeOpacity={0.75}
      >
        <View style={styles.cardMainRow}>
          <View style={[styles.severityIconBox, styles.plantIconBox]}>
            <Factory size={20} color="#2563EB" />
          </View>

          <View style={styles.cardCenterInfo}>
            <Text style={styles.cardPanelTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardPlantLocation} numberOfLines={1}>
              {item.description || "Plant operational thread"}
            </Text>
            {item.lastMessage?.text ? (
              <Text style={styles.cardLastMessage} numberOfLines={1}>
                {item.lastMessage.senderName ? `${item.lastMessage.senderName}: ` : ""}
                {item.lastMessage.text}
              </Text>
            ) : null}
          </View>

          <View style={styles.cardRightColumn}>
            <View style={styles.elapsedRow}>
              <Text style={styles.elapsedText}>{formatElapsed(item.updatedAt)}</Text>
              <ChevronRight size={14} color="#94A3B8" />
            </View>

            <View style={styles.avatarStack}>
              {item.participants.slice(0, 2).map((p, idx) => (
                <View
                  key={p.userId || idx}
                  style={[
                    styles.stackedAvatar,
                    idx > 0 && { marginLeft: -8 },
                    { backgroundColor: "#EFF6FF" },
                  ]}
                >
                  <Text style={[styles.stackedAvatarText, { color: "#2563EB" }]}>
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              ))}
              {item.participants.length > 2 && (
                <View style={[styles.stackedAvatar, styles.stackedCountAvatar]}>
                  <Text style={styles.stackedCountText}>+{item.participants.length - 2}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderCommunityItem = ({ item }: { item: CommunityQuestion }) => {
    return (
      <TouchableOpacity
        style={styles.communityCard}
        onPress={() =>
          navigation.navigate("CommunityQuestionDetail", { questionId: item._id })
        }
        activeOpacity={0.7}
      >
        <View style={styles.communityCategoryBadge}>
          <Text style={styles.communityCategoryText}>{item.category}</Text>
        </View>

        <Text style={styles.communityTitle}>{item.title}</Text>
        <Text style={styles.communityDesc} numberOfLines={2}>
          {item.description}
        </Text>

        <View style={styles.communityFooter}>
          <Text style={styles.communityAuthor}>{item.authorName || "PowerIQ User"}</Text>
          <View style={styles.communityStatsRow}>
            <View style={styles.statPill}>
              <MessageSquare size={13} color="#64748B" />
              <Text style={styles.statPillText}>{item.answersCount} answers</Text>
            </View>
            <View style={styles.statPill}>
              <ThumbsUp size={13} color="#64748B" />
              <Text style={styles.statPillText}>{item.helpfulVotes} helpful</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* App Header (Logo + Hamburger) */}
      <AppHeader />

      {/* Sub-header: Title + Search + New button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discussions</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => setIsSearchOpen(!isSearchOpen)}
            activeOpacity={0.7}
          >
            <Search size={20} color="#0F172A" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.newCircleButton}
            onPress={() => {
              if (activeFilterTab === "community") {
                navigation.navigate("AskCommunityQuestion");
              } else {
                navigation.navigate("StartDiscussion");
              }
            }}
            activeOpacity={0.85}
          >
            <Plus size={20} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Search Input */}
      {isSearchOpen && (
        <View style={styles.searchBarContainer}>
          <Search size={16} color="#94A3B8" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeFilterTab === "community"
                ? "Search community questions..."
                : "Search discussions, panels, parameters..."
            }
            placeholderTextColor="#94A3B8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Tabs Row (Screen 2: Alert Discussions | Plant Discussions | Community) */}
      <View style={styles.tabsContainer}>
        {(["alert", "plant", "community"] as TabType[]).map((tab) => {
          const isActive =
            activeFilterTab === tab || (activeFilterTab === "all" && tab === "alert");
          const labelMap: Record<string, string> = {
            alert: "Alert Discussions",
            plant: "Plant Discussions",
            community: "Community",
          };

          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
              onPress={() => setActiveFilterTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabButtonText, isActive && styles.tabButtonTextActive]}>
                {labelMap[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Content Feed */}
      {activeFilterTab === "community" ? (
        isLoadingCommunity ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={communityQuestions}
            keyExtractor={(item) => item._id}
            renderItem={renderCommunityItem}
            refreshControl={
              <RefreshControl
                refreshing={isLoadingCommunity}
                onRefresh={handleRefresh}
                colors={["#2563EB"]}
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Globe size={40} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No Community Questions</Text>
                <Text style={styles.emptySubtitle}>
                  Ask a question to the global PowerIQ community for expert operational help.
                </Text>
              </View>
            }
          />
        )
      ) : isLoading && !isRefreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={[1]} // single scroll container for sections
          keyExtractor={() => "main_list"}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              colors={["#2563EB"]}
            />
          }
          contentContainerStyle={styles.listContent}
          renderItem={() => (
            <View style={{ gap: 20 }}>
              {/* Active Alert Discussions Section */}
              {(activeFilterTab === "all" || activeFilterTab === "alert") && (
                <View>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Active Alert Discussions</Text>
                    {alertDiscussions.length > 0 && (
                      <View style={styles.countBadgePill}>
                        <Text style={styles.countBadgeText}>{alertDiscussions.length}</Text>
                      </View>
                    )}
                  </View>

                  {alertDiscussions.length === 0 ? (
                    <View style={styles.emptySectionBox}>
                      <Text style={styles.emptySectionText}>
                        No active alert discussions. Tap [Discuss] inside any alert to start one.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10, marginTop: 10 }}>
                      {alertDiscussions.map(renderAlertDiscussionCard)}
                    </View>
                  )}
                </View>
              )}

              {/* Recent Conversations / Plant Discussions Section */}
              {(activeFilterTab === "all" || activeFilterTab === "plant") && (
                <View>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionHeaderTitle}>Recent Conversations</Text>
                  </View>

                  {plantDiscussions.length === 0 ? (
                    <View style={styles.emptySectionBox}>
                      <Text style={styles.emptySectionText}>
                        No general plant discussions yet. Tap + above to start a thread.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ gap: 10, marginTop: 10 }}>
                      {plantDiscussions.map(renderPlantDiscussionCard)}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
        />
      )}
      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="Discussions" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: CONFIG.THEME.textPrimary,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  newCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
    padding: 0,
  },
  tabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tabButton: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
  },
  tabButtonActive: {
    backgroundColor: "#2563EB",
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  countBadgePill: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  emptySectionBox: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptySectionText: {
    fontSize: 13,
    color: "#94A3B8",
    textAlign: "center",
  },
  discussionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  unreadCard: {
    borderColor: "#93C5FD",
    backgroundColor: "#FAFCFF",
  },
  cardMainRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  severityIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  severityCritBox: {
    backgroundColor: "#FEE2E2",
  },
  severityWarnBox: {
    backgroundColor: "#FEF3C7",
  },
  severityInfoBox: {
    backgroundColor: "#EFF6FF",
  },
  plantIconBox: {
    backgroundColor: "#EFF6FF",
  },
  cardCenterInfo: {
    flex: 1,
    gap: 2,
  },
  cardPanelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  cardParameterLine: {
    fontSize: 13,
    fontWeight: "500",
    color: "#475569",
  },
  severityTagText: {
    fontWeight: "700",
  },
  colorCrit: { color: "#DC2626" },
  colorWarn: { color: "#D97706" },
  colorInfo: { color: "#2563EB" },
  cardPlantLocation: {
    fontSize: 12,
    color: "#94A3B8",
  },
  cardLastMessage: {
    fontSize: 13,
    color: "#334155",
    marginTop: 4,
    fontWeight: "400",
  },
  cardRightColumn: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  elapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  elapsedText: {
    fontSize: 11,
    color: "#94A3B8",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  stackedAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  stackedAvatarText: {
    fontSize: 10,
    fontWeight: "700",
  },
  stackedCountAvatar: {
    backgroundColor: "#E2E8F0",
    marginLeft: -8,
  },
  stackedCountText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#475569",
  },
  // Community styling
  communityCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 8,
  },
  communityCategoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  communityCategoryText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
  },
  communityTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  communityDesc: {
    fontSize: 13,
    color: CONFIG.THEME.textSecondary,
    lineHeight: 18,
  },
  communityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: CONFIG.THEME.borderSubtle,
    marginTop: 4,
  },
  communityAuthor: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
    fontStyle: "italic",
  },
  communityStatsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statPillText: {
    fontSize: 12,
    color: "#64748B",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: CONFIG.THEME.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
});
