import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Users, ChevronRight, Shield } from "lucide-react-native";
import { Group } from "../types";

interface Props {
  group: Group;
  onPress: () => void;
}

export const GroupCard: React.FC<Props> = ({ group, onPress }) => {
  const initials = group.name ? group.name.slice(0, 2).toUpperCase() : "GP";
  const memberCount = group.memberCount || (group.memberIds ? group.memberIds.length : 0);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Users size={22} color="#FFFFFF" />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name}
          </Text>
          {group.isAdmin && (
            <View style={styles.adminBadge}>
              <Shield size={10} color="#2563EB" />
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          )}
        </View>

        {group.description ? (
          <Text style={styles.descriptionText} numberOfLines={1}>
            {group.description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <View style={styles.membersCountPill}>
            <Users size={12} color="#64748B" />
            <Text style={styles.membersCountText}>
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </Text>
          </View>
        </View>
      </View>

      <ChevronRight size={18} color="#94A3B8" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#0D9488",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 3,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    flexShrink: 1,
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#2563EB",
  },
  descriptionText: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  membersCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  membersCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
});
