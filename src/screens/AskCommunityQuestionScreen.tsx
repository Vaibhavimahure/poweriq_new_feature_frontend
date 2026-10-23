import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Alert,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  ArrowLeft,
  Shield,
  Camera,
  Image as ImageIcon,
  FileText,
  X,
  Paperclip,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { RootStackParamList } from "../types/navigation";
import { CONFIG } from "../config/constants";
import { communicationApi } from "../api/communicationApi";
import { AppHeader } from "../components/common/AppHeader";
import { CommunityAttachment } from "../types/communication";

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, "AskCommunityQuestion">;
}

const CATEGORIES = [
  "Power Quality",
  "Energy",
  "Maintenance",
  "Electrical",
  "Production",
  "Other",
];

export const AskCommunityQuestionScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Power Quality");
  const [attachments, setAttachments] = useState<CommunityAttachment[]>([]);
  const [isProcessingMedia, setIsProcessingMedia] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pick photo from gallery
  const handlePickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow gallery access to attach photos.");
        return;
      }

      setIsProcessingMedia(true);
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

        const newAttachment: CommunityAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: asset.fileName || `Photo_${Date.now()}.jpg`,
          type: "image",
          uri: dataUri,
          mimeType: mime,
          size: asset.fileSize,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      }
    } catch (err: any) {
      console.warn("Failed to pick image:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Attaching photos requires the latest app build. Please install the newest APK build to use the camera and gallery."
        );
      } else {
        Alert.alert("Error", "Could not attach the image. Please try again.");
      }
    } finally {
      setIsProcessingMedia(false);
    }
  };

  // Take photo with camera
  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Please allow camera access to take photos.");
        return;
      }

      setIsProcessingMedia(true);
      const result = await ImagePicker.launchCameraAsync({
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

        const newAttachment: CommunityAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: asset.fileName || `Camera_${Date.now()}.jpg`,
          type: "image",
          uri: dataUri,
          mimeType: mime,
          size: asset.fileSize,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      }
    } catch (err: any) {
      console.warn("Failed to take photo:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Using the camera requires the latest app build. Please install the newest APK build to enable camera."
        );
      } else {
        Alert.alert("Error", "Could not take photo. Please try again.");
      }
    } finally {
      setIsProcessingMedia(false);
    }
  };

  // Pick document
  const handlePickDocument = async () => {
    try {
      setIsProcessingMedia(true);
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
        } catch {
          // If large or unreadable as base64, fall back to uri
        }

        const mime = doc.mimeType || "application/octet-stream";
        const isImage = mime.startsWith("image/");
        const dataUri = base64Data ? `data:${mime};base64,${base64Data}` : doc.uri;

        const newAttachment: CommunityAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: doc.name || `Document_${Date.now()}`,
          type: isImage ? "image" : "document",
          uri: dataUri,
          mimeType: mime,
          size: doc.size,
        };

        setAttachments((prev) => [...prev, newAttachment]);
      }
    } catch (err: any) {
      console.warn("Failed to pick document:", err?.message);
      if (
        err?.message?.includes("native module") ||
        err?.message?.includes("NativeModule") ||
        err?.message?.includes("Cannot read property")
      ) {
        Alert.alert(
          "Update Required",
          "Attaching documents requires the latest app build. Please install the newest APK build to enable documents."
        );
      } else {
        Alert.alert("Error", "Could not attach the document. Please try again.");
      }
    } finally {
      setIsProcessingMedia(false);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const q = await communicationApi.createCommunityQuestion({
        title: title.trim(),
        description: description.trim(),
        category,
        attachments,
      });

      navigation.replace("CommunityQuestionDetail", { questionId: q._id });
    } catch (err: any) {
      console.warn("Failed to post question:", err?.message);
      Alert.alert("Error", "Failed to post question. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = title.trim().length > 5 && description.trim().length > 10;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* App Header */}
      <AppHeader title="Ask Community" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Privacy Banner */}
        <View style={styles.privacyBanner}>
          <Shield size={20} color="#2563EB" />
          <View style={{ flex: 1 }}>
            <Text style={styles.privacyBannerTitle}>PowerIQ Community Discussion</Text>
            <Text style={styles.privacyBannerSubtitle}>
              Your identity, facility, and company details are protected. You will appear as "PowerIQ User".
            </Text>
          </View>
        </View>

        {/* Category Picker */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Operational Category</Text>
          <View style={styles.categoriesRow}>
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                  onPress={() => setCategory(cat)}
                  activeOpacity={0.7}
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
        </View>

        {/* Question Title & Description */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Question Title *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. How can we reduce high harmonic distortion in VFD drives?"
            placeholderTextColor="#94A3B8"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Detailed Description *</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Explain the machine behavior, symptoms, parameters observed, or questions you have for the community..."
            placeholderTextColor="#94A3B8"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {/* Attachments Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Paperclip size={16} color="#2563EB" />
              <Text style={styles.sectionLabel}>Attachments & Photos</Text>
            </View>
            <Text style={styles.optionalBadge}>Optional</Text>
          </View>

          {/* Action Buttons to Add Photos / Documents */}
          <View style={styles.attachActionsRow}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handleTakePhoto}
              disabled={isProcessingMedia}
              activeOpacity={0.75}
            >
              <Camera size={16} color="#2563EB" />
              <Text style={styles.attachBtnText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handlePickImage}
              disabled={isProcessingMedia}
              activeOpacity={0.75}
            >
              <ImageIcon size={16} color="#2563EB" />
              <Text style={styles.attachBtnText}>Photos</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handlePickDocument}
              disabled={isProcessingMedia}
              activeOpacity={0.75}
            >
              <FileText size={16} color="#2563EB" />
              <Text style={styles.attachBtnText}>Document</Text>
            </TouchableOpacity>
          </View>

          {isProcessingMedia && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.processingText}>Processing attachment...</Text>
            </View>
          )}

          {/* Attachments Preview List */}
          {attachments.length > 0 && (
            <View style={styles.attachmentsList}>
              {attachments.map((att) => (
                <View key={att.id} style={styles.attachmentItem}>
                  {att.type === "image" ? (
                    <Image source={{ uri: att.uri }} style={styles.attThumbnail} />
                  ) : (
                    <View style={styles.docIconBox}>
                      <FileText size={18} color="#2563EB" />
                    </View>
                  )}

                  <View style={styles.attInfo}>
                    <Text style={styles.attName} numberOfLines={1}>
                      {att.name}
                    </Text>
                    <Text style={styles.attMeta}>
                      {att.type === "image" ? "Photo" : "Document"}
                      {att.size ? ` • ${(att.size / 1024).toFixed(0)} KB` : ""}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.removeAttBtn}
                    onPress={() => handleRemoveAttachment(att.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={15} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isFormValid || isSubmitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          activeOpacity={0.88}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>Post Community Question</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  privacyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    gap: 10,
  },
  privacyBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  privacyBannerSubtitle: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
    lineHeight: 17,
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
    marginBottom: 8,
  },
  optionalBadge: {
    fontSize: 11,
    color: "#64748B",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "500",
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  textInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: CONFIG.THEME.textPrimary,
  },
  textArea: {
    height: 120,
  },
  attachActionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  attachBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 9,
    borderRadius: 8,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  processingText: {
    fontSize: 12,
    color: "#64748B",
  },
  attachmentsList: {
    marginTop: 12,
    gap: 8,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 8,
    gap: 10,
  },
  attThumbnail: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
  },
  docIconBox: {
    width: 42,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  attInfo: {
    flex: 1,
  },
  attName: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
  },
  attMeta: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
  },
  removeAttBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#FEE2E2",
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitBtnDisabled: {
    backgroundColor: "#94A3B8",
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
