/**
 * LoginScreen.tsx — PowerIQ-AI By ESM Sign In Screen
 * ----------------------------------------------------------------------------
 * Industrial authentication screen closely matching reference design:
 *  - PowerIQ-AI By ESM branded header logo
 *  - Light theme with subtle background wave effect
 *  - Centered elevated Sign In card
 *  - Email & Password fields with custom icons and show/hide toggle
 *  - Prominent Sign In button with arrow icon
 *  - Bottom security label & Server Settings modal
 *  - Preserves 100% of existing auth logic, APIs, and error handling
 * ----------------------------------------------------------------------------
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import {
  CONFIG,
  DEPLOYED_ALERT_BASE_URL,
  LOCAL_ALERT_BASE_URL_ANDROID,
  LOCAL_ALERT_BASE_URL_IOS,
} from "../config/constants";
import { getAlertBaseUrl, setAlertBaseUrl, resetAlertBaseUrl } from "../api/alertClient";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Settings,
  Check,
  X,
  RotateCcw,
} from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PowerIQLogo } from "../components/PowerIQLogo";
import { WaveBackground } from "../components/WaveBackground";

export const LoginScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { login, isLoading, error, clearError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Developer settings modal for alert backend override
  const [isDevSettingsOpen, setIsDevSettingsOpen] = useState(false);
  const [alertUrlInput, setAlertUrlInput] = useState("");
  const [devSaveSuccess, setDevSaveSuccess] = useState(false);

  const openDevSettings = async () => {
    const current = await getAlertBaseUrl();
    setAlertUrlInput(current);
    setIsDevSettingsOpen(true);
  };

  const handleSaveDevSettings = async () => {
    if (!alertUrlInput.trim()) return;
    await setAlertBaseUrl(alertUrlInput.trim());
    setDevSaveSuccess(true);
    setTimeout(() => {
      setDevSaveSuccess(false);
      setIsDevSettingsOpen(false);
    }, 600);
  };

  const handleResetDevSettings = async () => {
    await resetAlertBaseUrl();
    const current = await getAlertBaseUrl();
    setAlertUrlInput(current);
    setDevSaveSuccess(true);
    setTimeout(() => {
      setDevSaveSuccess(false);
      setIsDevSettingsOpen(false);
    }, 600);
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    clearError();
    console.log("[LoginScreen] Submitting login for:", email.trim(), "(password length:", password.length, ")");
    await login({ email: email.trim(), password });
  };

  const alertPresets = __DEV__
    ? [
        { label: "✅ Production Deployed", url: DEPLOYED_ALERT_BASE_URL },
        { label: "🛠 Android Emulator (local)", url: LOCAL_ALERT_BASE_URL_ANDROID },
        { label: "🛠 iOS Simulator / Localhost", url: LOCAL_ALERT_BASE_URL_IOS },
      ]
    : [
        { label: "✅ Production Deployed", url: DEPLOYED_ALERT_BASE_URL },
      ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <WaveBackground />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. PowerIQ-AI By ESM Logo at Top */}
          <View style={styles.logoContainer}>
            <PowerIQLogo size={68} />
          </View>

          {/* Inline Error Banner */}
          {error ? (
            <View style={styles.errorBox}>
              <AlertCircle size={18} color={CONFIG.THEME.danger} style={styles.errorIcon} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* 2. Centered White Rounded Sign In Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSubtitle}>
              Enter your PowerIQ-AI credentials to continue
            </Text>

            {/* Email Address Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={styles.inputWrapper}>
                <Mail size={18} color="#2563EB" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="operator@poweriq.com"
                  placeholderTextColor="#94A3B8"
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (error) clearError();
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                />
              </View>
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={styles.inputWrapper}>
                <Lock size={18} color="#2563EB" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (error) clearError();
                  }}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  {showPassword ? (
                    <EyeOff size={18} color="#2563EB" />
                  ) : (
                    <Eye size={18} color="#2563EB" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Large Blue Sign In Button with Arrow */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleLogin}
              disabled={isLoading || !email.trim() || !password}
              style={[
                styles.submitButton,
                (!email.trim() || !password || isLoading) && styles.submitButtonDisabled,
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.submitButtonText}>Sign In</Text>
                  <ArrowRight size={19} color="#FFFFFF" strokeWidth={2.5} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* 3. Bottom Text & Server Settings */}
          <View style={styles.footer}>
            {/* <Text style={styles.footerText}>
              Secured via JWT & Real-Time Socket Stream
            </Text> */}
            {/* <TouchableOpacity
              onPress={openDevSettings}
              style={styles.devSettingsBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            > */}
              {/* <Settings size={15} color="#2563EB" /> */}
              {/* <Text style={styles.devSettingsLabel}>Server Settings</Text> */}
            {/* </TouchableOpacity> */}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Developer Server Settings Modal */}
      <Modal
        visible={isDevSettingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDevSettingsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Server Configuration</Text>
                <Text style={styles.modalAuthLabel}>
                  Auth Service: api-communication.vercel.app (HTTPS)
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsDevSettingsOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={CONFIG.THEME.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Alert REST & Socket backend service URL.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={alertUrlInput}
              onChangeText={setAlertUrlInput}
              placeholder={DEPLOYED_ALERT_BASE_URL}
              placeholderTextColor={CONFIG.THEME.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.presetHeading}>PRESETS</Text>
            <View style={styles.presetsList}>
              {alertPresets.map((p) => (
                <TouchableOpacity
                  key={p.url}
                  onPress={() => setAlertUrlInput(p.url)}
                  style={[
                    styles.presetItem,
                    alertUrlInput === p.url && styles.presetItemActive,
                  ]}
                >
                  <Text style={styles.presetLabel}>{p.label}</Text>
                  <Text style={styles.presetUrl}>{p.url}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                onPress={handleResetDevSettings}
                style={styles.resetBtn}
                activeOpacity={0.8}
              >
                <RotateCcw size={16} color={CONFIG.THEME.textSecondary} />
                <Text style={styles.resetBtnText}>Reset Default</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveDevSettings}
                style={styles.saveBtn}
                activeOpacity={0.8}
              >
                {devSaveSuccess ? (
                  <>
                    <Check size={18} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Applied</Text>
                  </>
                ) : (
                  <Text style={styles.saveBtnText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 36,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 10,
  },
  errorIcon: {
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#B91C1C",
    lineHeight: 18,
    fontWeight: "500",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.07,
    shadowRadius: 20,
    elevation: 4,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 24,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1E3A8A",
    letterSpacing: 0.7,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    height: 52,
  },
  fieldIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#0F172A",
    fontSize: 14.5,
    fontWeight: "500",
  },
  eyeBtn: {
    padding: 6,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E68F2",
    height: 52,
    borderRadius: 12,
    marginTop: 10,
    gap: 8,
    shadowColor: "#1E68F2",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    marginTop: 28,
    alignItems: "center",
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  devSettingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  devSettingsLabel: {
    fontSize: 12.5,
    color: "#1E293B",
    fontWeight: "600",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 22,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  modalAuthLabel: {
    fontSize: 11,
    color: "#16A34A",
    fontWeight: "600",
    marginTop: 2,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: "#64748B",
    marginBottom: 14,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 12,
    color: "#0F172A",
    fontSize: 13,
    marginBottom: 14,
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  presetsList: {
    gap: 6,
    marginBottom: 18,
  },
  presetItem: {
    backgroundColor: "#F8FAFC",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  presetItemActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0F172A",
    marginBottom: 2,
  },
  presetUrl: {
    fontSize: 11,
    color: "#64748B",
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 10,
  },
  resetBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 6,
  },
  resetBtnText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  saveBtn: {
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E68F2",
    height: 44,
    borderRadius: 10,
    gap: 6,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
