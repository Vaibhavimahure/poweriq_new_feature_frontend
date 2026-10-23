/**
 * ErrorCard.tsx & EmptyState.tsx
 * ----------------------------------------------------------------------------
 * Reusable error and empty feedback states for cards and screens.
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { AlertCircle, RefreshCw, Inbox } from "lucide-react-native";
import { CONFIG } from "../../config/constants";

interface ErrorCardProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  style?: any;
}

export const ErrorCard: React.FC<ErrorCardProps> = ({
  title = "Failed to load",
  message = "Please check your network and try again.",
  onRetry,
  style,
}) => {
  return (
    <View style={[styles.errorContainer, style]}>
      <AlertCircle size={24} color={CONFIG.THEME.danger} style={styles.errorIcon} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <RefreshCw size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  actionText?: string;
  onAction?: () => void;
  style?: any;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionText,
  onAction,
  style,
}) => {
  return (
    <View style={[styles.emptyContainer, style]}>
      {icon || <Inbox size={36} color={CONFIG.THEME.textMuted} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      {message && <Text style={styles.emptyMessage}>{message}</Text>}
      {actionText && onAction && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onAction}
          activeOpacity={0.8}
        >
          <Text style={styles.actionText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  errorIcon: {
    marginBottom: 8,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 12,
    color: "#B91C1C",
    textAlign: "center",
    marginBottom: 12,
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CONFIG.THEME.danger,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    marginTop: 10,
  },
  emptyMessage: {
    fontSize: 12,
    color: CONFIG.THEME.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  actionButton: {
    marginTop: 14,
    backgroundColor: CONFIG.THEME.primary,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
