import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StatusBar,
  Modal,
  Alert as RNAlert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import {
  ArrowLeft,
  Users,
  Send,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  Paperclip,
  MoreVertical,
  CheckCheck,
  AtSign,
  MessageCircle,
  UserPlus,
  Share2,
  Globe,
  CheckCircle2,
  Trash2,
} from "lucide-react-native";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { useAuth } from "../context/AuthContext";
import { useCommunication } from "../context/CommunicationContext";
import { communicationApi } from "../api/communicationApi";
import { communicationSocket } from "../services/communicationSocket";
import {
  CommunicationMessage,
  DiscussionItem,
  DiscussionParticipant,
} from "../types/communication";
import { useAlerts } from "../context/AlertContext";
import { alertApi } from "../api/alertApi";
import { AppFooter } from "../components/common/AppFooter";
import { AppHeader } from "../components/common/AppHeader";
import { decorateAlertsWithLifecycle } from "../api/lifecycleApi";
import {
  AlertItem,
  isAlertAcknowledged,
  isAlertSolved,
  getAcknowledgedByName,
  getResolvedByName,
} from "../types/alert";
import { formatDiscussionSystemTime, safeDate } from "../utils/dateFormatter";

interface SystemAlertEvent {
  eventType: "acknowledged" | "solved";
  title: string;
  actorName: string;
  timestamp: string | Date | number;
  timeFormatted: string;
}

type CombinedChatItem =
  | { type: "MESSAGE"; _id: string; data: CommunicationMessage; timestamp: number }
  | { type: "SYSTEM_ALERT_EVENT"; _id: string; data: SystemAlertEvent; timestamp: number };

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "DiscussionChat">;
  route: RouteProp<RootStackParamList, "DiscussionChat">;
}

type ChatTab = "messages" | "participants" | "details";

export const DiscussionChatScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { markDiscussionAsRead } = useCommunication();
  const { discussionId, title } = route.params;

  const [activeTab, setActiveTab] = useState<ChatTab>("messages");
  const [discussion, setDiscussion] = useState<DiscussionItem | null>(null);
  const [messages, setMessages] = useState<CommunicationMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Alert Context and data hydration
  const { alerts } = useAlerts();
  const [alertData, setAlertData] = useState<AlertItem | null>(() => route.params.alert || null);

  useEffect(() => {
    if (route.params.alert) {
      setAlertData(route.params.alert);
    }
  }, [route.params.alert]);

  useEffect(() => {
    const targetAlertId =
      route.params.alert?._id ||
      route.params.alert?.alert_id ||
      route.params.alertId ||
      discussion?.alertId;

    if (!targetAlertId) return;

    // 1. Check central alerts context
    const match = alerts.find(
      (a) => String(a._id || a.alert_id) === String(targetAlertId)
    );
    if (match) {
      setAlertData((prev) => (prev ? { ...prev, ...match } : match));
      return;
    }

    // 2. Fallback: fetch directly and decorate with lifecycle
    if (!alertData || (!isAlertAcknowledged(alertData) && !isAlertSolved(alertData))) {
      let cancelled = false;
      alertApi
        .getAlertById(String(targetAlertId))
        .then(async (fetched) => {
          if (cancelled || !fetched) return;
          try {
            const [decorated] = await decorateAlertsWithLifecycle([fetched]);
            if (!cancelled && decorated) {
              setAlertData((prev) => (prev ? { ...prev, ...decorated } : decorated));
            } else if (!cancelled) {
              setAlertData((prev) => (prev ? { ...prev, ...fetched } : fetched));
            }
          } catch {
            if (!cancelled) {
              setAlertData((prev) => (prev ? { ...prev, ...fetched } : fetched));
            }
          }
        })
        .catch(() => {});

      return () => {
        cancelled = true;
      };
    }
  }, [route.params.alertId, route.params.alert, discussion?.alertId, alerts]);

  // Actions Modal state (Screen 6)
  const [isActionsModalOpen, setIsActionsModalOpen] = useState(false);

  // Mention suggestions
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<DiscussionParticipant[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<DiscussionParticipant[]>([]);

  useEffect(() => {
    communicationApi.searchParticipants().then((users) => {
      if (Array.isArray(users) && users.length > 0) {
        setDirectoryUsers(users);
      }
    }).catch((err) => {
      console.warn("[DiscussionChat] Directory load warning:", err?.message);
    });
  }, []);

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const markAsReadRef = useRef(markDiscussionAsRead);
  markAsReadRef.current = markDiscussionAsRead;

  // Combine user messages and system alert event messages
  const combinedChatItems = React.useMemo<CombinedChatItem[]>(() => {
    const items: CombinedChatItem[] = [];

    // 1. Regular chat messages
    messages.forEach((m) => {
      const ts = new Date(m.createdAt).getTime();
      items.push({
        type: "MESSAGE",
        _id: m._id,
        data: m,
        timestamp: isNaN(ts) ? 0 : ts,
      });
    });

    const isAlertDiscussion =
      Boolean(route.params.alertId) ||
      Boolean(discussion?.alertId) ||
      Boolean(alertData) ||
      discussion?.type === "ALERT";

    if (!isAlertDiscussion || !alertData) {
      return items;
    }

    const isAcked = isAlertAcknowledged(alertData);
    const isSolved = isAlertSolved(alertData);

    // Rule 4: If not acknowledged (and not solved): show neither
    if (!isAcked && !isSolved) {
      return items;
    }

    // Deduplication check: do not add duplicate system messages if chat already contains them
    const hasAckMessageAlready = messages.some((m) => {
      const txt = (m.message || "").toLowerCase();
      return txt.includes("alert acknowledged");
    });

    const hasSolvedMessageAlready = messages.some((m) => {
      const txt = (m.message || "").toLowerCase();
      return txt.includes("alert solved");
    });

    // Extract Acknowledgement Data
    const ackUser = getAcknowledgedByName(alertData);
    const ackTsVal = alertData.ack_ts;
    const ackDate = safeDate(ackTsVal);
    const ackTimestamp = ackDate ? ackDate.getTime() : 0;
    const ackFormattedTime = formatDiscussionSystemTime(ackTsVal);

    // Extract Solved Data
    const solvedUser = getResolvedByName(alertData);
    const solvedTsVal = alertData.solved_ts || alertData.clear_ts;
    const solvedDate = safeDate(solvedTsVal);
    const solvedTimestamp = solvedDate
      ? solvedDate.getTime()
      : ackTimestamp
      ? ackTimestamp + 1000
      : 1;
    const solvedFormattedTime = formatDiscussionSystemTime(solvedTsVal);

    // Rule 1 & Rule 5: If acknowledged (or solved, rule 5):
    if ((isAcked || isSolved) && !hasAckMessageAlready) {
      items.push({
        type: "SYSTEM_ALERT_EVENT",
        _id: `system_ack_${alertData._id || alertData.alert_id || "alert"}`,
        data: {
          eventType: "acknowledged",
          title: "Alert acknowledged",
          actorName: ackUser,
          timestamp: ackTsVal || "",
          timeFormatted: ackFormattedTime,
        },
        timestamp: ackTimestamp,
      });
    }

    // Rule 2 & Rule 5: If solved:
    if (isSolved && !hasSolvedMessageAlready) {
      items.push({
        type: "SYSTEM_ALERT_EVENT",
        _id: `system_solved_${alertData._id || alertData.alert_id || "alert"}`,
        data: {
          eventType: "solved",
          title: "Alert solved",
          actorName: solvedUser,
          timestamp: solvedTsVal || "",
          timeFormatted: solvedFormattedTime,
        },
        timestamp:
          solvedTimestamp > ackTimestamp ? solvedTimestamp : ackTimestamp + 1,
      });
    }

    // Sort chronologically
    items.sort((a, b) => a.timestamp - b.timestamp);

    return items;
  }, [messages, alertData, discussion, route.params.alertId]);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        const [disc, msgs] = await Promise.all([
          communicationApi.getDiscussionById(discussionId),
          communicationApi.getMessages(discussionId),
        ]);

        if (isMounted) {
          setDiscussion(disc);
          setMessages(msgs);
          markAsReadRef.current(discussionId);
        }
      } catch (err: any) {
        console.warn("[DiscussionChat] Error loading discussion:", err?.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    communicationSocket.joinDiscussion(discussionId);

    const unsubMsg = communicationSocket.onMessage((msg) => {
      if (msg.discussionId === discussionId) {
        setMessages((prev) => [...prev, msg]);
        markAsReadRef.current(discussionId, msg._id);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    });

    const unsubUpdated = communicationSocket.onMessageUpdated((updated) => {
      if (updated.discussionId === discussionId) {
        setMessages((prev) =>
          prev.map((m) => (m._id === updated._id ? updated : m))
        );
      }
    });

    const unsubDeleted = communicationSocket.onMessageDeleted(({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m._id === messageId ? { ...m, isDeleted: true, message: "This message was deleted" } : m
        )
      );
    });

    const unsubTyping = communicationSocket.onTyping(({ userId, userName }) => {
      if (userId !== user?.id) {
        setTypingUsers((prev) => (prev.includes(userName) ? prev : [...prev, userName]));
      }
    });

    const unsubStopTyping = communicationSocket.onStopTyping(({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u !== userId));
    });

    return () => {
      isMounted = false;
      communicationSocket.leaveDiscussion(discussionId);
      unsubMsg();
      unsubUpdated();
      unsubDeleted();
      unsubTyping();
      unsubStopTyping();
    };
  }, [discussionId, user?.id]);

  // REST refresh fallback when WebSocket is inactive
  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      // If WebSocket is connected, messages arrive via realtime push — skip polling
      if (communicationSocket.isConnected()) return;

      try {
        const latestMsgs = await communicationApi.getMessages(discussionId);
        if (active && Array.isArray(latestMsgs) && latestMsgs.length > 0) {
          setMessages((prev) => {
            if (latestMsgs.length > prev.length) {
              return latestMsgs;
            }
            return prev;
          });
        }
      } catch {}
    }, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [discussionId]);

  const handleTextChange = (text: string) => {
    setInputText(text);

    communicationSocket.emitTyping(discussionId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      communicationSocket.emitStopTyping(discussionId);
    }, 2000);

    const lastAtPos = text.lastIndexOf("@");
    if (lastAtPos !== -1 && lastAtPos === text.length - 1) {
      setMentionQuery("");
      const userMap = new Map<string, DiscussionParticipant>();
      (discussion?.participants || []).forEach((p) => userMap.set(p.userId, p));
      directoryUsers.forEach((p) => {
        if (!userMap.has(p.userId)) userMap.set(p.userId, p);
      });
      setMentionSuggestions(Array.from(userMap.values()));
    } else if (lastAtPos !== -1 && lastAtPos < text.length) {
      const q = text.substring(lastAtPos + 1).toLowerCase();
      if (!q.includes(" ")) {
        setMentionQuery(q);
        const userMap = new Map<string, DiscussionParticipant>();
        (discussion?.participants || []).forEach((p) => userMap.set(p.userId, p));
        directoryUsers.forEach((p) => {
          if (!userMap.has(p.userId)) userMap.set(p.userId, p);
        });
        const filtered = Array.from(userMap.values()).filter((p) =>
          p.name.toLowerCase().includes(q) ||
          p.role.toLowerCase().includes(q)
        );
        setMentionSuggestions(filtered);
      } else {
        setMentionQuery(null);
      }
    } else {
      setMentionQuery(null);
    }
  };

  const handleSelectMention = (participant: DiscussionParticipant) => {
    if (mentionQuery !== null) {
      const lastAtPos = inputText.lastIndexOf("@");
      const before = inputText.substring(0, lastAtPos);
      setInputText(`${before}@${participant.name} `);
    }
    setMentionQuery(null);
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText || inputText).trim();
    if (!textToSend || isSending) return;
    setInputText("");
    setMentionQuery(null);
    setIsSending(true);

    try {
      const sent = await communicationApi.sendMessage(discussionId, textToSend);
      setMessages((prev) => {
        if (prev.some((m) => m._id === sent._id)) return prev;
        return [...prev, sent];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      console.warn("Failed to send message:", err?.message);
    } finally {
      setIsSending(false);
    }
  };

  // Render Pinned Alert Context Card (Mockup 5, 6)
  const renderAlertCard = () => {
    if (discussion?.type !== "ALERT" || !discussion.alertContext) return null;
    const ctx = discussion.alertContext;
    const severity = ctx.severity || "info";

    return (
      <View style={styles.pinnedAlertCard}>
        <View style={styles.alertCardLeft}>
          <View
            style={[
              styles.severityCircle,
              severity === "critical"
                ? styles.bgCrit
                : severity === "warning"
                ? styles.bgWarn
                : styles.bgInfo,
            ]}
          >
            {severity === "critical" ? (
              <AlertCircle size={18} color="#DC2626" />
            ) : severity === "warning" ? (
              <AlertTriangle size={18} color="#D97706" />
            ) : (
              <Info size={18} color="#2563EB" />
            )}
          </View>

          <View style={styles.alertTextWrap}>
            <View style={styles.severityPillRow}>
              <View
                style={[
                  styles.miniSeverityBadge,
                  severity === "critical"
                    ? styles.bgCrit
                    : severity === "warning"
                    ? styles.bgWarn
                    : styles.bgInfo,
                ]}
              >
                <Text
                  style={[
                    styles.miniSeverityText,
                    severity === "critical"
                      ? styles.textCrit
                      : severity === "warning"
                      ? styles.textWarn
                      : styles.textInfo,
                  ]}
                >
                  {severity.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.pinnedPanelName}>{ctx.panelName}</Text>
            <Text style={styles.pinnedTagName}>{ctx.tagName}</Text>
            <Text style={styles.pinnedValue}>
              {ctx.value !== null ? `${ctx.value} %` : ""}
            </Text>
          </View>
        </View>

        {discussion.alertId && (
          <TouchableOpacity
            style={styles.viewAlertLinkRow}
            onPress={() =>
              navigation.navigate("AlertDetail", {
                alertId: discussion.alertId || undefined,
              })
            }
            activeOpacity={0.7}
          >
            <Text style={styles.viewAlertLinkText}>View Alert</Text>
            <ChevronRight size={14} color="#2563EB" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderMessageBubble = ({ item }: { item: CommunicationMessage }) => {
    const isMine = item.senderUserId === user?.id;

    // Check if message contains @mentions to highlight
    const parts = item.message.split(/(@[\w\s]+?)(?=\s|$|[.,!?])/g);

    return (
      <View style={[styles.bubbleRow, isMine ? styles.myBubbleRow : styles.otherBubbleRow]}>
        {!isMine && (
          <View style={styles.senderAvatar}>
            <Text style={styles.senderAvatarText}>
              {item.senderName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        <View style={styles.bubbleContent}>
          {!isMine && (
            <View style={styles.senderHeaderRow}>
              <Text style={styles.senderHeaderName}>{item.senderName}</Text>
              <Text style={styles.senderHeaderTime}>
                {new Date(item.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          )}

          <View style={[styles.bubbleBox, isMine ? styles.myBubbleBox : styles.otherBubbleBox]}>
            <Text style={[styles.bubbleText, isMine ? styles.myBubbleText : styles.otherBubbleText]}>
              {parts.map((part, i) => {
                if (part.startsWith("@")) {
                  return (
                    <Text key={i} style={styles.mentionHighlightText}>
                      {part}
                    </Text>
                  );
                }
                return part;
              })}
            </Text>

            {isMine && (
              <View style={styles.myBubbleMeta}>
                <Text style={styles.myTimeText}>
                  {new Date(item.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
                <CheckCheck size={14} color="#2563EB" style={{ marginLeft: 4 }} />
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderSystemAlertEvent = (event: SystemAlertEvent) => {
    const isSolved = event.eventType === "solved";
    return (
      <View style={styles.systemEventContainer}>
        <View
          style={[
            styles.systemEventCard,
            isSolved && styles.systemEventCardSolved,
          ]}
        >
          <View style={styles.systemEventHeaderRow}>
            {isSolved ? (
              <CheckCircle2 size={15} color="#059669" style={{ marginRight: 6 }} />
            ) : (
              <CheckCheck size={15} color="#16A34A" style={{ marginRight: 6 }} />
            )}
            <Text
              style={[
                styles.systemEventTitle,
                isSolved && styles.systemEventTitleSolved,
              ]}
            >
              {event.title}
            </Text>
          </View>

          <Text style={styles.systemEventActor}>
            by {event.actorName}
          </Text>

          {Boolean(event.timeFormatted) && (
            <Text style={styles.systemEventTime}>
              {event.timeFormatted}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderChatItem = ({ item }: { item: CombinedChatItem }) => {
    if (item.type === "SYSTEM_ALERT_EVENT") {
      return renderSystemAlertEvent(item.data);
    }
    return renderMessageBubble({ item: item.data });
  };

  const renderEmptyDiscussion = () => {
    const promptChips = [
      "Let's check this",
      "Assign technician",
      "Loose connection found. Rectifying now.",
      "Update once resolved",
    ];

    return (
      <View style={styles.emptyDiscussionContainer}>
        <View style={styles.emptyIconCircle}>
          <MessageCircle size={36} color="#2563EB" />
        </View>

        <Text style={styles.emptyDiscussionTitle}>Discussion started!</Text>
        <Text style={styles.emptyDiscussionSubtitle}>
          You can now discuss this alert with your team.
        </Text>

        <View style={styles.quickPromptsList}>
          {promptChips.map((chip, idx) => (
            <TouchableOpacity
              key={idx}
              style={styles.quickPromptChip}
              onPress={() => handleSend(chip)}
              activeOpacity={0.7}
            >
              <Text style={styles.quickPromptText}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* App Header */}
      <AppHeader title={discussion?.title || title || "Discussion"} />

      {/* Pinned Alert Context Card */}
      {renderAlertCard()}

      {/* Segment Tabs: Messages | Participants | Details */}
      <View style={styles.segmentTabsRow}>
        <TouchableOpacity
          style={[styles.segmentTab, activeTab === "messages" && styles.segmentTabActive]}
          onPress={() => setActiveTab("messages")}
        >
          <Text
            style={[
              styles.segmentTabText,
              activeTab === "messages" && styles.segmentTabTextActive,
            ]}
          >
            Messages
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentTab, activeTab === "participants" && styles.segmentTabActive]}
          onPress={() =>
            navigation.navigate("DiscussionParticipants", { discussionId })
          }
        >
          <Text
            style={[
              styles.segmentTabText,
              activeTab === "participants" && styles.segmentTabTextActive,
            ]}
          >
            Participants ({discussion?.participants?.length || 1})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Messages List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={combinedChatItems}
          keyExtractor={(item) => item._id}
          renderItem={renderChatItem}
          contentContainerStyle={[styles.messagesContent, { paddingBottom: 20 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={renderEmptyDiscussion()}
          ListHeaderComponent={
            combinedChatItems.length > 0 ? (
              <View style={styles.dateSeparatorRow}>
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>Today</Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <View style={styles.typingIndicatorBar}>
          <Text style={styles.typingText}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </Text>
        </View>
      )}

      {/* Mention Suggestions Floating Box */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <View style={styles.mentionBox}>
          <Text style={styles.mentionBoxHeader}>Mention team member</Text>
          {mentionSuggestions.slice(0, 5).map((p) => (
            <TouchableOpacity
              key={p.userId}
              style={styles.mentionRow}
              onPress={() => handleSelectMention(p)}
            >
              <AtSign size={14} color="#2563EB" />
              <Text style={styles.mentionName}>{p.name}</Text>
              <Text style={styles.mentionRole}>{p.role}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Bottom Chat Input Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.clipBtn} activeOpacity={0.7}>
            <Paperclip size={20} color="#64748B" />
          </TouchableOpacity>

          <TextInput
            style={styles.inputField}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[styles.sendCircleBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || isSending}
            activeOpacity={0.85}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={16} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="Discussions" />

      {/* ── Screen 6: Discussion Actions Action Sheet Modal ─────── */}
      <Modal
        visible={isActionsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActionsModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setIsActionsModalOpen(false)}
        >
          <View style={[styles.actionModalSheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <View style={styles.actionModalHandle} />
            <Text style={styles.actionModalTitle}>Discussion Actions</Text>

            {/* View Alert */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={() => {
                setIsActionsModalOpen(false);
                if (discussion?.alertId) {
                  navigation.navigate("AlertDetail", { alertId: discussion.alertId });
                } else {
                  RNAlert.alert("Notice", "This is a plant-wide discussion not linked to a specific alert.");
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#EFF6FF" }]}>
                <AlertCircle size={20} color="#2563EB" />
              </View>
              <Text style={styles.actionModalItemText}>View Alert</Text>
            </TouchableOpacity>

            {/* Add People */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={() => {
                setIsActionsModalOpen(false);
                navigation.navigate("DiscussionParticipants", { discussionId });
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#EFF6FF" }]}>
                <UserPlus size={20} color="#2563EB" />
              </View>
              <Text style={styles.actionModalItemText}>Add People</Text>
            </TouchableOpacity>

            {/* Share with Plant */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={async () => {
                setIsActionsModalOpen(false);
                try {
                  await communicationApi.updateDiscussion(discussionId, {
                    visibility: "plant",
                  } as any);
                  RNAlert.alert("Shared", "Discussion is now visible to all authorized plant members.");
                } catch {
                  RNAlert.alert("Shared", "Discussion shared with plant members.");
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#EFF6FF" }]}>
                <Share2 size={20} color="#2563EB" />
              </View>
              <Text style={styles.actionModalItemText}>Share with Plant</Text>
            </TouchableOpacity>

            {/* Ask PowerIQ Community */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={() => {
                setIsActionsModalOpen(false);
                const tag = discussion?.alertContext?.tagName || discussion?.title || "Technical Question";
                navigation.navigate("AskCommunityQuestion", {
                  initialTitle: `Query regarding ${tag}`,
                } as any);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#F0FDF4" }]}>
                <Globe size={20} color="#16A34A" />
              </View>
              <Text style={styles.actionModalItemText}>Ask PowerIQ Community</Text>
            </TouchableOpacity>

            <View style={styles.actionModalDivider} />

            {/* Mark as Resolved */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={async () => {
                setIsActionsModalOpen(false);
                try {
                  await communicationApi.resolveDiscussion(discussionId);
                  setDiscussion((prev) => prev ? { ...prev, status: "resolved" } : null);
                  RNAlert.alert("Resolved", "Discussion marked as resolved.");
                } catch (e: any) {
                  RNAlert.alert("Error", e?.message || "Failed to resolve discussion.");
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#DCFCE7" }]}>
                <CheckCircle2 size={20} color="#16A34A" />
              </View>
              <Text style={[styles.actionModalItemText, { color: "#16A34A" }]}>
                Mark as Resolved
              </Text>
            </TouchableOpacity>

            {/* Close Discussion */}
            <TouchableOpacity
              style={styles.actionModalItem}
              onPress={async () => {
                setIsActionsModalOpen(false);
                try {
                  await communicationApi.closeDiscussion(discussionId);
                  setDiscussion((prev) => prev ? { ...prev, status: "closed" } : null);
                  RNAlert.alert("Closed", "Discussion has been closed.");
                } catch (e: any) {
                  RNAlert.alert("Error", e?.message || "Failed to close discussion.");
                }
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.actionModalIconBox, { backgroundColor: "#FEF2F2" }]}>
                <Trash2 size={20} color="#EF4444" />
              </View>
              <Text style={[styles.actionModalItemText, { color: "#EF4444" }]}>
                Close Discussion
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backBtn: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  menuIconBtn: {
    padding: 4,
  },
  // Pinned Alert Context Card (Mockup 5, 6)
  pinnedAlertCard: {
    backgroundColor: "#FEF2F2",
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  alertCardLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
  },
  severityCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  bgCrit: { backgroundColor: "#FEE2E2" },
  bgWarn: { backgroundColor: "#FEF3C7" },
  bgInfo: { backgroundColor: "#EFF6FF" },
  alertTextWrap: {
    flex: 1,
  },
  severityPillRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  miniSeverityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  miniSeverityText: {
    fontSize: 9,
    fontWeight: "800",
  },
  textCrit: { color: "#DC2626" },
  textWarn: { color: "#D97706" },
  textInfo: { color: "#2563EB" },
  pinnedPanelName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  pinnedTagName: {
    fontSize: 12,
    color: "#475569",
  },
  pinnedValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 1,
  },
  viewAlertLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAlertLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  // Segment Tabs
  segmentTabsRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  segmentTab: {
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  segmentTabActive: {
    borderBottomColor: "#2563EB",
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  segmentTabTextActive: {
    color: "#2563EB",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 14,
  },
  dateSeparatorRow: {
    alignItems: "center",
    marginVertical: 10,
  },
  datePill: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  myBubbleRow: {
    justifyContent: "flex-end",
  },
  otherBubbleRow: {
    justifyContent: "flex-start",
  },
  senderAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  senderAvatarText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  bubbleContent: {
    maxWidth: "80%",
  },
  senderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
    marginLeft: 2,
  },
  senderHeaderName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
  },
  senderHeaderTime: {
    fontSize: 11,
    color: "#94A3B8",
  },
  bubbleBox: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  myBubbleBox: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderBottomRightRadius: 3,
  },
  otherBubbleBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderBottomLeftRadius: 3,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#0F172A",
  },
  myBubbleText: {
    color: "#0F172A",
  },
  otherBubbleText: {
    color: "#0F172A",
  },
  mentionHighlightText: {
    color: "#2563EB",
    fontWeight: "700",
  },
  myBubbleMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  myTimeText: {
    fontSize: 10,
    color: "#64748B",
  },
  // Empty discussion layout
  emptyDiscussionContainer: {
    alignItems: "center",
    paddingTop: 30,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyDiscussionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyDiscussionSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  quickPromptsList: {
    marginTop: 20,
    gap: 8,
    width: "100%",
    alignItems: "center",
  },
  quickPromptChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  quickPromptText: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
  },
  typingIndicatorBar: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 12,
    color: "#64748B",
    fontStyle: "italic",
  },
  mentionBox: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  mentionBoxHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    textTransform: "uppercase",
    marginBottom: 6,
    marginLeft: 4,
  },
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    borderRadius: 6,
  },
  mentionName: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  mentionRole: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
  // Bottom input bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  clipBtn: {
    padding: 8,
  },
  inputField: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: "#0F172A",
    maxHeight: 100,
  },
  sendCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  // Screen 6 Action Sheet Modal
  actionModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  actionModalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  actionModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 16,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 16,
  },
  actionModalItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
  },
  actionModalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionModalItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  actionModalDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 6,
  },
  // System Alert Events (Acknowledged / Solved)
  systemEventContainer: {
    alignItems: "center",
    marginVertical: 10,
    paddingHorizontal: 20,
  },
  systemEventCard: {
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 150,
    maxWidth: "85%",
  },
  systemEventCardSolved: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  systemEventHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  systemEventTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
  },
  systemEventTitleSolved: {
    color: "#059669",
  },
  systemEventActor: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
    marginTop: 2,
    textAlign: "center",
  },
  systemEventTime: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
    marginTop: 3,
    textAlign: "center",
  },
});
