/**
 * ProfileScreen.tsx
 * ----------------------------------------------------------------------------
 * User Profile Screen using authenticated user profile data:
 * - Profile Avatar with initials
 * - Name, Username, Email, Phone
 * - Role & Permissions badge
 * - Company & Plant Details
 * - Logout Button
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { AppHeader } from "../../components/common/AppHeader";
import { AppFooter } from "../../components/common/AppFooter";
import { useAuth } from "../../context/AuthContext";
import { fetchUserProfile } from "../../api/userApi";
import { fetchMyCompany } from "../../api/companyApi";
import { CONFIG } from "../../config/constants";
import {
  User,
  Mail,
  Phone,
  Shield,
  Building,
  MapPin,
  LogOut,
  CheckCircle,
} from "lucide-react-native";

export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);

  useEffect(() => {
    fetchUserProfile().then((p) => {
      if (p) setProfileData(p);
    });
    fetchMyCompany().then((c) => {
      if (c) setCompanyData(c);
    });
  }, []);

  const effectiveUser = profileData || user || {};

  const name =
    effectiveUser.name ||
    effectiveUser.username ||
    effectiveUser.displayName ||
    "User";

  const email = effectiveUser.email || "No email provided";
  const phone = effectiveUser.phone || effectiveUser.mobile || "Not specified";
  const role =
    effectiveUser.role?.name ||
    effectiveUser.role?.role ||
    effectiveUser.role ||
    "Operator";

  const companyName =
    companyData?.name ||
    companyData?.company_name ||
    effectiveUser.company?.name ||
    "PowerIQ Plant";

  const location =
    companyData?.plant_location ||
    companyData?.location ||
    "Industrial Facility";

  const initials = name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    Alert.alert("Confirm Logout", "Are you sure you want to log out of PowerIQ?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <AppHeader title="My Profile" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile Hero Avatar */}
        <View style={styles.heroCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>{initials || "PQ"}</Text>
          </View>
          <Text style={styles.userName}>{name}</Text>
          <View style={styles.roleBadge}>
            <Shield size={12} color="#1E40AF" />
            <Text style={styles.roleText}>{String(role).toUpperCase()}</Text>
          </View>
        </View>

        {/* Account Details */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Account Details</Text>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Mail size={16} color={CONFIG.THEME.textSecondary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={styles.infoValue}>{email}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Phone size={16} color={CONFIG.THEME.textSecondary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Phone</Text>
              <Text style={styles.infoValue}>{phone}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <CheckCircle size={16} color="#16A34A" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Status</Text>
              <Text style={[styles.infoValue, { color: "#16A34A" }]}>Active</Text>
            </View>
          </View>
        </View>

        {/* Company & Facility */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Plant Association</Text>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <Building size={16} color={CONFIG.THEME.textSecondary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Company / Facility</Text>
              <Text style={styles.infoValue}>{companyName}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.iconBox}>
              <MapPin size={16} color={CONFIG.THEME.textSecondary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{location}</Text>
            </View>
          </View>
        </View>

        {/* Logout Action */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="Profile" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.THEME.bgLight,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  heroCard: {
    backgroundColor: CONFIG.THEME.bgCard,
    alignItems: "center",
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: CONFIG.THEME.border,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: CONFIG.THEME.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    ...CONFIG.THEME.shadowSm,
  },
  avatarInitials: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "800",
  },
  userName: {
    fontSize: 20,
    fontWeight: "800",
    color: CONFIG.THEME.textPrimary,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  roleText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#1E40AF",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: CONFIG.THEME.bgCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CONFIG.THEME.border,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 14,
    ...CONFIG.THEME.shadowCard,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: CONFIG.THEME.textPrimary,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: CONFIG.THEME.bgSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    color: CONFIG.THEME.textMuted,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "600",
    color: CONFIG.THEME.textPrimary,
    marginTop: 1,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 20,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
  },
});
