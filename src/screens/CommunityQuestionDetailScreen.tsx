import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import {
  ArrowLeft,
  ThumbsUp,
  MessageSquare,
  Send,
  Shield,
  Edit3,
  Paperclip,
  Camera,
  Image as ImageIcon,
  FileText,
  X,
 Share2,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { communicationApi } from "../api/communicationApi";
import { AppFooter } from "../components/common/AppFooter";
import { AppHeader } from "../components/common/AppHeader";
import {
  CommunityQuestionDetail,
  CommunityAnswer,
  CommunityAttachment,
} from "../types/communication";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "CommunityQuestionDetail">;
  route: RouteProp<RootStackParamList, "CommunityQuestionDetail">;
}

const CATEGORIES = [
  "Power Quality",
  "Energy",
  "Maintenance",
  "Electrical",
  "Production",
  "Other",
];

export const CommunityQuestionDetailScreen: React.FC<Props> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { questionId } = route.params;

  const [question, setQuestion] = useState<CommunityQuestionDetail | null>(null);
  const [answerInput, setAnswerInput] = useState("");
  const [answerAttachments, setAnswerAttachments] = useState<CommunityAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isVotingQuestion, setIsVotingQuestion] = useState(false);
  const [votingAnswerIds, setVotingAnswerIds] = useState<Record<string, boolean>>({});

  // Image viewer modal state
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);

  // Edit Question Modal state
  const [isEditQuestionModalOpen, setIsEditQuestionModalOpen] = useState(false);
  const [editQTitle, setEditQTitle] = useState("");
  const [editQDesc, setEditQDesc] = useState("");
  const [editQCategory, setEditQCategory] = useState("Power Quality");
  const [editQAttachments, setEditQAttachments] = useState<CommunityAttachment[]>([]);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Edit Answer Modal state
  const [editingAnswer, setEditingAnswer] = useState<CommunityAnswer | null>(null);
  const [editAText, setEditAText] = useState("");
  const [editAAttachments, setEditAAttachments] = useState<CommunityAttachment[]>([]);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);

  const loadQuestion = async () => {
    try {
      const data = await communicationApi.getCommunityQuestionById(questionId);
      setQuestion(data);
    } catch (err: any) {
      console.warn("Failed to load community question:", err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuestion();
  }, [questionId]);

  // --- 0ms Optimistic Question Voting ---
  const handleVoteQuestion = async () => {
    if (!question || isVotingQuestion) return;
    setIsVotingQuestion(true);

    const prevHasVoted = !!question.hasVotedHelpful;
    const prevVotes = question.helpfulVotes || 0;
    const nextHasVoted = !prevHasVoted;
    const nextVotes = Math.max(0, prevVotes + (prevHasVoted ? -1 : 1));

    // Immediate optimistic update
    setQuestion((prev) =>
      prev
        ? {
            ...prev,
            hasVotedHelpful: nextHasVoted,
            helpfulVotes: nextVotes,
          }
        : null
    );

    try {
      const res = await communicationApi.voteHelpful("QUESTION", question._id);
      setQuestion((prev) =>
        prev
          ? {
              ...prev,
              hasVotedHelpful: res.hasVoted,
              helpfulVotes: res.helpfulVotes,
            }
          : null
      );
    } catch (err: any) {
      console.warn("Vote failed, rolling back:", err?.message);
      // Rollback
      setQuestion((prev) =>
        prev
          ? {
              ...prev,
              hasVotedHelpful: prevHasVoted,
              helpfulVotes: prevVotes,
            }
          : null
      );
    } finally {
      setIsVotingQuestion(false);
    }
  };

  // --- 0ms Optimistic Answer Voting ---
  const handleVoteAnswer = async (answerId: string) => {
    if (!question || votingAnswerIds[answerId]) return;

    const targetAnswer = question.answers.find((a) => a._id === answerId);
    if (!targetAnswer) return;

    setVotingAnswerIds((prev) => ({ ...prev, [answerId]: true }));

    const prevHasVoted = !!targetAnswer.hasVotedHelpful;
    const prevVotes = targetAnswer.helpfulVotes || 0;
    const nextHasVoted = !prevHasVoted;
    const nextVotes = Math.max(0, prevVotes + (prevHasVoted ? -1 : 1));

    // Immediate optimistic update
    setQuestion((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        answers: prev.answers.map((a) =>
          a._id === answerId
            ? { ...a, hasVotedHelpful: nextHasVoted, helpfulVotes: nextVotes }
            : a
        ),
      };
    });

    try {
      const res = await communicationApi.voteHelpful("ANSWER", answerId);
      setQuestion((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          answers: prev.answers.map((a) =>
            a._id === answerId
              ? { ...a, hasVotedHelpful: res.hasVoted, helpfulVotes: res.helpfulVotes }
              : a
          ),
        };
      });
    } catch (err: any) {
      console.warn("Answer vote failed, rolling back:", err?.message);
      // Rollback
      setQuestion((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          answers: prev.answers.map((a) =>
            a._id === answerId
              ? { ...a, hasVotedHelpful: prevHasVoted, helpfulVotes: prevVotes }
              : a
          ),
        };
      });
    } finally {
      setVotingAnswerIds((prev) => ({ ...prev, [answerId]: false }));
    }
  };

  // --- Send Answer ---
  const handleSendAnswer = async () => {
    if (!answerInput.trim() || isSending) return;
    const text = answerInput.trim();
    const attachmentsToSend = [...answerAttachments];

    setAnswerInput("");
    setAnswerAttachments([]);
    setIsSending(true);

    try {
      const newAnswer = await communicationApi.postCommunityAnswer(questionId, {
        answerText: text,
        attachments: attachmentsToSend,
      });

      setQuestion((prev) =>
        prev
          ? {
              ...prev,
              answersCount: prev.answersCount + 1,
              answers: [...prev.answers, newAnswer],
            }
          : null
      );
    } catch (err: any) {
      console.warn("Failed to post answer:", err?.message);
      Alert.alert("Error", "Failed to post your answer. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // --- Document Sharing/Viewing ---
  const handleOpenDocument = async (att: CommunityAttachment) => {
    try {
      if (att.uri.startsWith("data:")) {
        const parts = att.uri.split(",");
        const base64Data = parts[1];
        const extension = att.name.includes(".") ? att.name.split(".").pop() : "bin";
        const tempPath = `${FileSystem.cacheDirectory}view_${att.id}.${extension}`;

        await FileSystem.writeAsStringAsync(tempPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(tempPath);
        } else {
          Alert.alert("Document Ready", `Saved to ${tempPath}`);
        }
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(att.uri);
      }
    } catch (err: any) {
      console.warn("Could not open document:", err?.message);
      Alert.alert("Notice", "Unable to open this document on this device.");
    }
  };

  // --- Media Pickers for Answer Bar ---
  const handlePickAnswerPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let base64Data = asset.base64;
        if (!base64Data && asset.uri) {
          base64Data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        const mime = asset.mimeType || "image/jpeg";
        const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : asset.uri;

        setAnswerAttachments((prev) => [
          ...prev,
          {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: asset.fileName || `Photo_${Date.now()}.jpg`,
            type: "image",
            uri: dataUri,
            mimeType: mime,
            size: asset.fileSize,
          },
        ]);
      }
    } catch (err: any) {
      console.warn("Failed to attach photo to answer:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Attaching photos requires the latest app build. Please update your APK to enable this feature."
        );
      }
    }
  };

  const handlePickAnswerDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const doc = result.assets[0];
        let base64Data = "";
        try {
          base64Data = await FileSystem.readAsStringAsync(doc.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch {}

        const mime = doc.mimeType || "application/octet-stream";
        const isImage = mime.startsWith("image/");
        const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : doc.uri;

        setAnswerAttachments((prev) => [
          ...prev,
          {
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: doc.name || `Document_${Date.now()}`,
            type: isImage ? "image" : "document",
            uri: dataUri,
            mimeType: mime,
            size: doc.size,
          },
        ]);
      }
    } catch (err: any) {
      console.warn("Failed to attach document to answer:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Attaching documents requires the latest app build. Please update your APK to enable this feature."
        );
      }
    }
  };

  // --- Question Edit Modal Handlers ---
  const openEditQuestionModal = () => {
    if (!question) return;
    setEditQTitle(question.title);
    setEditQDesc(question.description);
    setEditQCategory(question.category);
    setEditQAttachments(question.attachments || []);
    setIsEditQuestionModalOpen(true);
  };

  const handleSaveQuestionEdit = async () => {
    if (!question || !editQTitle.trim() || !editQDesc.trim() || isSavingQuestion) return;
    setIsSavingQuestion(true);

    try {
      const updated = await communicationApi.updateCommunityQuestion(question._id, {
        title: editQTitle.trim(),
        description: editQDesc.trim(),
        category: editQCategory,
        attachments: editQAttachments,
      });

      setQuestion((prev) =>
        prev
          ? {
              ...prev,
              title: updated.title,
              description: updated.description,
              category: updated.category,
              attachments: updated.attachments,
              isEdited: true,
              editedAt: updated.editedAt,
            }
          : null
      );
      setIsEditQuestionModalOpen(false);
    } catch (err: any) {
      console.warn("Failed to update question:", err?.message);
      Alert.alert("Error", "Could not save your changes. Please try again.");
    } finally {
      setIsSavingQuestion(false);
    }
  };

  // Add attachment helper for edit question modal
  const handleAddModalAttachment = async (
    targetSetter: React.Dispatch<React.SetStateAction<CommunityAttachment[]>>,
    type: "photo" | "document"
  ) => {
    try {
      if (type === "photo") {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.6,
          base64: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          let base64Data = asset.base64;
          if (!base64Data && asset.uri) {
            base64Data = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          }
          const mime = asset.mimeType || "image/jpeg";
          const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : asset.uri;

          targetSetter((prev) => [
            ...prev,
            {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: asset.fileName || `Photo_${Date.now()}.jpg`,
              type: "image",
              uri: dataUri,
              mimeType: mime,
              size: asset.fileSize,
            },
          ]);
        }
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
        });
        if (!result.canceled && result.assets && result.assets.length > 0) {
          const doc = result.assets[0];
          let base64Data = "";
          try {
            base64Data = await FileSystem.readAsStringAsync(doc.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch {}
          const mime = doc.mimeType || "application/octet-stream";
          const isImage = mime.startsWith("image/");
          const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : doc.uri;

          targetSetter((prev) => [
            ...prev,
            {
              id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: doc.name || `Document_${Date.now()}`,
              type: isImage ? "image" : "document",
              uri: dataUri,
              mimeType: mime,
              size: doc.size,
            },
          ]);
        }
      }
    } catch (err: any) {
      console.warn("Failed to add attachment in modal:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Attaching files requires the latest app build. Please update your APK to enable this feature."
        );
      }
    }
  };

  // --- Answer Edit Modal Handlers ---
  const openEditAnswerModal = (ans: CommunityAnswer) => {
    setEditingAnswer(ans);
    setEditAText(ans.answerText);
    setEditAAttachments(ans.attachments || []);
  };

  const handleSaveAnswerEdit = async () => {
    if (!editingAnswer || !editAText.trim() || isSavingAnswer) return;
    setIsSavingAnswer(true);

    try {
      const updated = await communicationApi.updateCommunityAnswer(editingAnswer._id, {
        answerText: editAText.trim(),
        attachments: editAAttachments,
      });

      setQuestion((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          answers: prev.answers.map((a) =>
            a._id === editingAnswer._id
              ? {
                  ...a,
                  answerText: updated.answerText,
                  attachments: updated.attachments,
                  isEdited: true,
                  editedAt: updated.editedAt,
                }
              : a
          ),
        };
      });

      setEditingAnswer(null);
    } catch (err: any) {
      console.warn("Failed to update answer:", err?.message);
      Alert.alert("Error", "Could not save your answer changes.");
    } finally {
      setIsSavingAnswer(false);
    }
  };

  // --- Helper to Render Attachments on Question / Answer Cards ---
  const renderAttachmentsSection = (attachments?: CommunityAttachment[]) => {
    if (!attachments || attachments.length === 0) return null;

    const images = attachments.filter((a) => a.type === "image");
    const docs = attachments.filter((a) => a.type === "document");

    return (
      <View style={styles.cardAttachmentsBox}>
        {/* Images Grid */}
        {images.length > 0 && (
          <View style={styles.imagesGrid}>
            {images.map((img) => (
              <TouchableOpacity
                key={img.id}
                style={styles.imageThumbnailTouch}
                onPress={() => setSelectedImageUri(img.uri)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: img.uri }} style={styles.attachmentImage} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Documents Row */}
        {docs.length > 0 && (
          <View style={styles.docsList}>
            {docs.map((doc) => (
              <TouchableOpacity
                key={doc.id}
                style={styles.docChip}
                onPress={() => handleOpenDocument(doc)}
                activeOpacity={0.75}
              >
                <FileText size={14} color="#2563EB" />
                <Text style={styles.docChipText} numberOfLines={1}>
                  {doc.name}
                </Text>
                {doc.size ? (
                  <Text style={styles.docChipSize}>{(doc.size / 1024).toFixed(0)}KB</Text>
                ) : null}
                <Share2 size={12} color="#64748B" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  // --- Render Answer Item ---
  const renderAnswerItem = ({ item }: { item: CommunityAnswer }) => {
    const isVotingThis = !!votingAnswerIds[item._id];

    return (
      <View style={styles.answerCard}>
        <View style={styles.answerHeader}>
          <View style={styles.authorBadge}>
            <Shield size={12} color="#2563EB" />
            <Text style={styles.answerAuthor}>PowerIQ User</Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {item.isEdited && <Text style={styles.editedBadge}>(Edited)</Text>}
            <Text style={styles.answerTime}>
              {new Date(item.createdAt).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </Text>

            {/* Author-only Edit Answer Button */}
            {item.canEdit && (
              <TouchableOpacity
                style={styles.authorEditBtn}
                onPress={() => openEditAnswerModal(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Edit3 size={13} color="#2563EB" />
                <Text style={styles.authorEditBtnText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <Text style={styles.answerText}>{item.answerText}</Text>

        {/* Attachments if any */}
        {renderAttachmentsSection(item.attachments)}

        <View style={styles.answerFooter}>
          <TouchableOpacity
            style={[styles.voteButton, item.hasVotedHelpful && styles.voteButtonActive]}
            onPress={() => handleVoteAnswer(item._id)}
            disabled={isVotingThis}
            activeOpacity={0.7}
          >
            <ThumbsUp size={13} color={item.hasVotedHelpful ? "#2563EB" : "#64748B"} />
            <Text
              style={[
                styles.voteButtonText,
                item.hasVotedHelpful && styles.voteButtonTextActive,
              ]}
            >
              {item.helpfulVotes} Helpful
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* App Header */}
      <AppHeader title="Community Question" />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : !question ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Question not found.</Text>
        </View>
      ) : (
        <FlatList
          data={question.answers}
          keyExtractor={(item) => item._id}
          renderItem={renderAnswerItem}
          contentContainerStyle={[styles.contentList, { paddingBottom: 20 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.questionCard}>
              <View style={styles.questionCardTopRow}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{question.category}</Text>
                </View>

                {/* Author-only Edit Question Button */}
                {question.canEdit && (
                  <TouchableOpacity
                    style={styles.questionEditBtn}
                    onPress={openEditQuestionModal}
                    activeOpacity={0.75}
                  >
                    <Edit3 size={14} color="#2563EB" />
                    <Text style={styles.questionEditBtnText}>Edit Question</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.questionTitle}>{question.title}</Text>
              <Text style={styles.questionDesc}>{question.description}</Text>

              {/* Attachments for question */}
              {renderAttachmentsSection(question.attachments)}

              <View style={styles.questionMetaRow}>
                <View style={styles.authorBadge}>
                  <Shield size={13} color="#2563EB" />
                  <Text style={styles.questionAuthor}>PowerIQ User</Text>
                  {question.isEdited && <Text style={styles.editedBadge}>(Edited)</Text>}
                </View>

                <TouchableOpacity
                  style={[
                    styles.voteButton,
                    question.hasVotedHelpful && styles.voteButtonActive,
                  ]}
                  onPress={handleVoteQuestion}
                  disabled={isVotingQuestion}
                  activeOpacity={0.7}
                >
                  <ThumbsUp
                    size={14}
                    color={question.hasVotedHelpful ? "#2563EB" : "#64748B"}
                  />
                  <Text
                    style={[
                      styles.voteButtonText,
                      question.hasVotedHelpful && styles.voteButtonTextActive,
                    ]}
                  >
                    {question.helpfulVotes} Helpful
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.answersCountBanner}>
                <MessageSquare size={16} color="#2563EB" />
                <Text style={styles.answersCountText}>
                  {question.answersCount} Community Answers
                </Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyAnswers}>
              <Text style={styles.emptyAnswersText}>
                No answers posted yet. Be the first to share an operational solution.
              </Text>
            </View>
          }
        />
      )}

      {/* Answer Input & Attachment Bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        {/* Preview of attachments to send with answer */}
        {answerAttachments.length > 0 && (
          <View style={styles.answerAttachmentPreviewBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {answerAttachments.map((att) => (
                <View key={att.id} style={styles.answerAttachmentChip}>
                  {att.type === "image" ? (
                    <Image source={{ uri: att.uri }} style={styles.answerAttThumb} />
                  ) : (
                    <FileText size={14} color="#2563EB" />
                  )}
                  <Text style={styles.answerAttChipName} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setAnswerAttachments((prev) => prev.filter((a) => a.id !== att.id))
                    }
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <X size={13} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.bottomInputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {/* Attachment buttons */}
          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={handlePickAnswerPhoto}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ImageIcon size={19} color="#64748B" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconActionBtn}
            onPress={handlePickAnswerDocument}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Paperclip size={19} color="#64748B" />
          </TouchableOpacity>

          <TextInput
            style={styles.answerInput}
            placeholder="Write your answer..."
            placeholderTextColor="#94A3B8"
            value={answerInput}
            onChangeText={setAnswerInput}
            multiline
            maxLength={1000}
          />

          <TouchableOpacity
            style={[
              styles.sendAnswerBtn,
              (!answerInput.trim() || isSending) && styles.sendAnswerBtnDisabled,
            ]}
            onPress={handleSendAnswer}
            disabled={!answerInput.trim() || isSending}
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Send size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="Discussions" />

      {/* --- Fullscreen Image Modal --- */}
      <Modal
        visible={!!selectedImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedImageUri(null)}
      >
        <View style={styles.fullImageBackdrop}>
          <TouchableOpacity
            style={styles.closeFullImageBtn}
            onPress={() => setSelectedImageUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <X size={26} color="#FFFFFF" />
          </TouchableOpacity>
          {selectedImageUri && (
            <Image
              source={{ uri: selectedImageUri }}
              style={styles.fullscreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      {/* --- Author-Only Edit Question Modal --- */}
      <Modal
        visible={isEditQuestionModalOpen}
        animationType="slide"
        onRequestClose={() => setIsEditQuestionModalOpen(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Edit Question</Text>
            <TouchableOpacity
              onPress={() => setIsEditQuestionModalOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            {/* Category selection */}
            <Text style={styles.modalLabel}>Category</Text>
            <View style={styles.categoriesRow}>
              {CATEGORIES.map((cat) => {
                const isSelected = editQCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                    onPress={() => setEditQCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextSelected,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Title input */}
            <Text style={[styles.modalLabel, { marginTop: 14 }]}>Question Title</Text>
            <TextInput
              style={styles.modalTextInput}
              value={editQTitle}
              onChangeText={setEditQTitle}
              maxLength={120}
            />

            {/* Description textarea */}
            <Text style={[styles.modalLabel, { marginTop: 14 }]}>Description</Text>
            <TextInput
              style={[styles.modalTextInput, styles.modalTextArea]}
              value={editQDesc}
              onChangeText={setEditQDesc}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            {/* Attachments management */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.modalLabel}>Attachments & Photos</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={styles.modalAddAttBtn}
                    onPress={() => handleAddModalAttachment(setEditQAttachments, "photo")}
                  >
                    <ImageIcon size={14} color="#2563EB" />
                    <Text style={styles.modalAddAttText}>Add Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAddAttBtn}
                    onPress={() => handleAddModalAttachment(setEditQAttachments, "document")}
                  >
                    <FileText size={14} color="#2563EB" />
                    <Text style={styles.modalAddAttText}>Add Doc</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {editQAttachments.length > 0 && (
                <View style={styles.modalAttList}>
                  {editQAttachments.map((att) => (
                    <View key={att.id} style={styles.modalAttRow}>
                      {att.type === "image" ? (
                        <Image source={{ uri: att.uri }} style={styles.modalAttThumb} />
                      ) : (
                        <FileText size={16} color="#2563EB" />
                      )}
                      <Text style={styles.modalAttName} numberOfLines={1}>
                        {att.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setEditQAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                (!editQTitle.trim() || !editQDesc.trim() || isSavingQuestion) &&
                  styles.modalSubmitBtnDisabled,
              ]}
              onPress={handleSaveQuestionEdit}
              disabled={!editQTitle.trim() || !editQDesc.trim() || isSavingQuestion}
            >
              {isSavingQuestion ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* --- Author-Only Edit Answer Modal --- */}
      <Modal
        visible={!!editingAnswer}
        animationType="slide"
        onRequestClose={() => setEditingAnswer(null)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Edit Answer</Text>
            <TouchableOpacity
              onPress={() => setEditingAnswer(null)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalLabel}>Answer Text</Text>
            <TextInput
              style={[styles.modalTextInput, styles.modalTextArea, { height: 160 }]}
              value={editAText}
              onChangeText={setEditAText}
              multiline
              textAlignVertical="top"
              maxLength={1500}
            />

            {/* Attachments management */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.modalLabel}>Attachments</Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={styles.modalAddAttBtn}
                    onPress={() => handleAddModalAttachment(setEditAAttachments, "photo")}
                  >
                    <ImageIcon size={14} color="#2563EB" />
                    <Text style={styles.modalAddAttText}>Add Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalAddAttBtn}
                    onPress={() => handleAddModalAttachment(setEditAAttachments, "document")}
                  >
                    <FileText size={14} color="#2563EB" />
                    <Text style={styles.modalAddAttText}>Add Doc</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {editAAttachments.length > 0 && (
                <View style={styles.modalAttList}>
                  {editAAttachments.map((att) => (
                    <View key={att.id} style={styles.modalAttRow}>
                      {att.type === "image" ? (
                        <Image source={{ uri: att.uri }} style={styles.modalAttThumb} />
                      ) : (
                        <FileText size={16} color="#2563EB" />
                      )}
                      <Text style={styles.modalAttName} numberOfLines={1}>
                        {att.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setEditAAttachments((prev) => prev.filter((a) => a.id !== att.id))
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <X size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.modalSubmitBtn,
                (!editAText.trim() || isSavingAnswer) && styles.modalSubmitBtnDisabled,
              ]}
              onPress={handleSaveAnswerEdit}
              disabled={!editAText.trim() || isSavingAnswer}
            >
              {isSavingAnswer ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Save Answer</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.THEME.bgLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: CONFIG.THEME.textMuted,
  },
  contentList: {
    padding: 16,
    gap: 12,
  },
  questionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    marginBottom: 8,
    gap: 10,
  },
  questionCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  questionEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  questionEditBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  questionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    lineHeight: 24,
  },
  questionDesc: {
    fontSize: 14,
    color: CONFIG.THEME.textSecondary,
    lineHeight: 21,
  },
  questionMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CONFIG.THEME.borderSubtle,
  },
  authorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  questionAuthor: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    fontWeight: "600",
  },
  editedBadge: {
    fontSize: 11,
    color: "#64748B",
    fontStyle: "italic",
  },
  voteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  voteButtonActive: {
    backgroundColor: "#DBEAFE",
  },
  voteButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  voteButtonTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  answersCountBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 8,
  },
  answersCountText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  cardAttachmentsBox: {
    marginTop: 8,
    gap: 8,
  },
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  imageThumbnailTouch: {
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
  },
  attachmentImage: {
    width: 80,
    height: 80,
    backgroundColor: "#F1F5F9",
  },
  docsList: {
    gap: 6,
  },
  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  docChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
    maxWidth: 200,
  },
  docChipSize: {
    fontSize: 11,
    color: "#64748B",
  },
  answerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    gap: 8,
  },
  answerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  answerAuthor: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    fontWeight: "600",
  },
  authorEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  authorEditBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
  },
  answerTime: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
  answerText: {
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
    lineHeight: 20,
  },
  answerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 4,
  },
  emptyAnswers: {
    paddingVertical: 30,
    alignItems: "center",
  },
  emptyAnswersText: {
    fontSize: 13,
    color: CONFIG.THEME.textMuted,
    textAlign: "center",
  },
  answerAttachmentPreviewBar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: CONFIG.THEME.borderSubtle,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  answerAttachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  answerAttThumb: {
    width: 20,
    height: 20,
    borderRadius: 3,
  },
  answerAttChipName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2563EB",
    maxWidth: 120,
  },
  bottomInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: CONFIG.THEME.border,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  iconActionBtn: {
    padding: 6,
  },
  answerInput: {
    flex: 1,
    backgroundColor: "#F1F5F9",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
    maxHeight: 90,
  },
  sendAnswerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendAnswerBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  fullImageBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeFullImageBtn: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: "100%",
    height: "80%",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
  },
  modalScrollContent: {
    padding: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    marginBottom: 6,
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  categoryChipSelected: {
    backgroundColor: "#2563EB",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.textSecondary,
  },
  categoryChipTextSelected: {
    color: "#FFFFFF",
  },
  modalTextInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
  },
  modalTextArea: {
    height: 120,
  },
  modalAddAttBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  modalAddAttText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  modalAttList: {
    marginTop: 8,
    gap: 6,
  },
  modalAttRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    borderRadius: 6,
    padding: 6,
    gap: 8,
  },
  modalAttThumb: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  modalAttName: {
    flex: 1,
    fontSize: 12,
    color: CONFIG.THEME.textPrimary,
  },
  modalSubmitBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  modalSubmitBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  modalSubmitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
