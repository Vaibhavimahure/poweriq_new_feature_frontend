import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
} from "react-native";
import { Send, X, CornerDownRight, Paperclip, Image as ImageIcon } from "lucide-react-native";
import { MessageReplyInfo } from "../types";
import { CONFIG } from "../../../config/constants";

interface Props {
  onSendMessage: (content: string, replyTo?: string | null) => void;
  replyingTo?: MessageReplyInfo | null;
  onCancelReply?: () => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  disabled?: boolean;
}

export const MessageInput: React.FC<Props> = ({
  onSendMessage,
  replyingTo,
  onCancelReply,
  onTypingStart,
  onTypingStop,
  disabled = false,
}) => {
  const [text, setText] = useState("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChangeText = (val: string) => {
    setText(val);

    if (val.trim()) {
      onTypingStart?.();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        onTypingStop?.();
      }, 1500);
    } else {
      onTypingStop?.();
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    onTypingStop?.();

    onSendMessage(trimmed, replyingTo?._id || null);
    setText("");
  };

  const isSendDisabled = disabled || !text.trim();

  return (
    <View style={styles.wrapper}>
      {/* Reply Banner */}
      {replyingTo && (
        <View style={styles.replyBanner}>
          <View style={styles.replyBarIndicator} />
          <View style={styles.replyContent}>
            <View style={styles.replyHeaderRow}>
              <CornerDownRight size={12} color="#2563EB" />
              <Text style={styles.replySenderText} numberOfLines={1}>
                Replying to {replyingTo.senderName}
              </Text>
            </View>
            <Text style={styles.replyMessageSnippet} numberOfLines={1}>
              {replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cancelReplyBtn}
            onPress={onCancelReply}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <X size={16} color="#64748B" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input Row */}
      <View style={styles.inputRow}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor="#94A3B8"
            value={text}
            onChangeText={handleChangeText}
            multiline
            maxLength={2000}
            editable={!disabled}
          />

          {/* Media Attachments trigger (prepared for future uploads) */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={() => {}}
            disabled={disabled}
            activeOpacity={0.7}
          >
            <Paperclip size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[
            styles.sendBtn,
            isSendDisabled ? styles.sendBtnDisabled : styles.sendBtnActive,
          ]}
          onPress={handleSend}
          disabled={isSendDisabled}
          activeOpacity={0.8}
        >
          <Send size={18} color={isSendDisabled ? "#94A3B8" : "#FFFFFF"} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 8 : 10,
  },
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#2563EB",
  },
  replyBarIndicator: {
    width: 0,
  },
  replyContent: {
    flex: 1,
    marginLeft: 4,
  },
  replyHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  replySenderText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  replyMessageSnippet: {
    fontSize: 12,
    color: "#64748B",
  },
  cancelReplyBtn: {
    padding: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 22,
    paddingHorizontal: 14,
    minHeight: 44,
    maxHeight: 110,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: "#0F172A",
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    paddingRight: 6,
  },
  attachBtn: {
    padding: 6,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnActive: {
    backgroundColor: "#2563EB",
  },
  sendBtnDisabled: {
    backgroundColor: "#F1F5F9",
  },
});
