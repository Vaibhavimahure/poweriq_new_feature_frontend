/**
 * AddProductionLogScreen.tsx
 * ----------------------------------------------------------------------------
 * Add Production Log Screen with:
 *   - 📷 Camera OCR Scanning for handwritten/printed slips (Auto-fills values)
 *   - Auto-detected Date (Today)
 *   - Auto-detected Shift (Based on current time)
 *   - Manual quantity editing with validation
 *   - Direct submission to api-communication backend (triggers SEC recalculation)
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  Factory,
  Trash2,
  Save,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "../../types/navigation";
import {
  extractProductionLogOcr,
  saveProductionLogToBackend,
  fetchShiftInfoFromBackend,
} from "../../api/secCommunicationApi";
import { getCurrentShiftName, formatDateYMD, STANDARD_SHIFTS } from "../../utils/shiftUtils";
import { CONFIG } from "../../config/constants";
import { AppHeader } from "../../components/common/AppHeader";

type NavigationProp = NativeStackNavigationProp<RootStackParamList, "AddProductionLog">;
type ScreenRouteProp = RouteProp<RootStackParamList, "AddProductionLog">;

const SHIFT_OPTIONS = [
  { name: "Morning Shift", timing: "06:00 – 14:00" },
  { name: "Evening Shift", timing: "14:00 – 22:00" },
  { name: "Night Shift", timing: "22:00 – 06:00" },
];

const PERIOD_TYPES = ["shift", "day", "batch"];

export const AddProductionLogScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ScreenRouteProp>();

  const {
    productId = "",
    productName = "Product",
    unit = "MT",
    secondaryUnit = "MT",
  } = route.params || {};

  // Form State
  const [productionDate, setProductionDate] = useState<string>(formatDateYMD());
  const [periodType, setPeriodType] = useState<"shift" | "day" | "batch">("shift");
  const [shiftName, setShiftName] = useState<string>(getCurrentShiftName());
  const [primaryQty, setPrimaryQty] = useState<string>("");
  const [secondaryQty, setSecondaryQty] = useState<string>("");
  const [wastageQty, setWastageQty] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // UI state
  const [isScanning, setIsScanning] = useState(false);
  const [scanSuccessMessage, setScanSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{
    primary: number;
    secondary: number;
    wastage: number;
  } | null>(null);

  const handleSuccessClose = () => {
    setSaveSuccessVisible(false);
    navigation.goBack();
  };

  const [shiftOptions, setShiftOptions] = useState(SHIFT_OPTIONS);

  // Auto-detect shift from backend or fallback to local
  useEffect(() => {
    fetchShiftInfoFromBackend()
      .then((info: any) => {
        if (Array.isArray(info.shifts) && info.shifts.length > 0) {
          const formatted = info.shifts.map((s: any) => ({
            name: typeof s === "string" ? s : s.name || s.label,
            timing: typeof s === "string" ? "" : s.timing || "",
          }));
          setShiftOptions(formatted);
        }
        if (info.activeShift) setShiftName(info.activeShift);
      })
      .catch(() => {});
  }, []);

  // 📷 1. Camera OCR Scan Handler
  const handleLaunchCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Camera Permission Required",
          "Please grant camera access to scan handwritten production slips."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        await processSlipImage(result.assets[0].base64);
      }
    } catch (err: any) {
      console.warn("Camera launch error:", err);
      Alert.alert("Camera Error", err.message || "Failed to open camera");
    }
  };

  // 🖼️ 2. Gallery Picker Handler
  const handleLaunchGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Gallery Permission Required",
          "Please grant photo library access to choose a slip image."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets?.[0]?.base64) {
        await processSlipImage(result.assets[0].base64);
      }
    } catch (err: any) {
      console.warn("Gallery picker error:", err);
      Alert.alert("Gallery Error", err.message || "Failed to pick image");
    }
  };

  // Process Slip through api-communication OCR backend
  const processSlipImage = async (base64Image: string) => {
    setIsScanning(true);
    setScanSuccessMessage(null);

    try {
      const res = await extractProductionLogOcr(base64Image);

      // ── Local number extraction fallback ──────────────────────────────────────
      // If backend returned nulls but included rawText, try to parse numbers out of it.
      let primary = res.primaryProductionQty;
      let secondary = res.secondaryProductionQty;
      let wastage = res.wastageQty;

      if (primary === null && res.rawText) {
        // Strip out dates (e.g. 2026-09-30, 30/09/2026) and times (12:05)
        const sanitized = res.rawText
          .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, " ")
          .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/g, " ")
          .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ");

        // Extract all numeric tokens (integer or decimal) from the sanitized OCR text
        const found = (sanitized.match(/\b\d+(?:[.,]\d+)?\b/g) || [])
          .map((s) => parseFloat(s.replace(",", ".")))
          .filter((n) => Number.isFinite(n) && n > 0 && n !== 2026);

        if (found.length >= 1) primary = found[0];
        if (found.length >= 2) secondary = found[1];
        if (found.length >= 3) wastage = found[2];
      }
      // ─────────────────────────────────────────────────────────────────────────

      if ((res.success || primary !== null) && primary !== null) {
        setPrimaryQty(String(primary));
        setSecondaryQty(String(secondary ?? 0));
        setWastageQty(String(wastage ?? 0));

        // Haptic feedback
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}

        setScanSuccessMessage(
          `✓ Auto-filled from scan: Primary (${primary} ${unit}), Secondary (${secondary ?? 0} ${secondaryUnit}), Wastage (${wastage ?? 0} ${unit}). Review & confirm below.`
        );
      } else {
        setScanSuccessMessage(null);
        Alert.alert(
          "Scan Notice",
          "Could not detect numbers from the slip image. Please ensure the numbers are clearly written and well-lit, or type them directly into the fields below."
        );
      }
    } catch (err: any) {
      console.warn("OCR processing failed:", err);
      Alert.alert(
        "Scan Notice",
        "Could not auto-extract values from image. You can enter them manually below."
      );
    } finally {
      setIsScanning(false);
    }
  };

  // Form Submission
  const handleSave = async () => {
    const pQty = parseFloat(primaryQty);
    if (isNaN(pQty) || pQty < 0) {
      Alert.alert("Validation", "Please enter a valid Primary Production Quantity.");
      return;
    }

    const sQty = secondaryQty.trim() ? parseFloat(secondaryQty) : 0;
    const wQty = wastageQty.trim() ? parseFloat(wastageQty) : 0;

    setIsSaving(true);
    try {
      await saveProductionLogToBackend(productId, {
        productionDate,
        periodType,
        shiftName,
        shifts: [shiftName],
        selectedShifts: [shiftName],
        primaryProductionQty: pQty,
        secondaryProductionQty: isNaN(sQty) ? 0 : sQty,
        wastageQty: isNaN(wQty) ? 0 : wQty,
        remarks: remarks.trim(),
      });

      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      setSavedSummary({
        primary: pQty,
        secondary: isNaN(sQty) ? 0 : sQty,
        wastage: isNaN(wQty) ? 0 : wQty,
      });
      setSaveSuccessVisible(true);
    } catch (err: any) {
      console.error("Save failed:", err);
      Alert.alert("Save Failed", err.message || "Failed to save production log.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* App Header */}
      <AppHeader title="Add Production Log" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* 📷 1. Camera OCR Scan Card */}
        <View style={styles.scanCard}>
          <View style={styles.scanCardHeader}>
            <View style={styles.scanIconWrapper}>
              <Sparkles size={20} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scanCardTitle}>Scan Handwritten Slip</Text>
              <Text style={styles.scanCardSub}>
                Snap a photo of the paper register to automatically fill Primary, Secondary & Wastage
              </Text>
            </View>
          </View>

          {isScanning ? (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.scanningText}>Analyzing slip with OCR... Please wait</Text>
            </View>
          ) : (
            <View style={styles.scanButtonsRow}>
              <TouchableOpacity
                style={styles.cameraBtn}
                onPress={handleLaunchCamera}
                activeOpacity={0.85}
              >
                <Camera size={18} color="#FFFFFF" />
                <Text style={styles.cameraBtnText}>Scan with Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.galleryBtn}
                onPress={handleLaunchGallery}
                activeOpacity={0.85}
              >
                <ImageIcon size={18} color="#2563EB" />
                <Text style={styles.galleryBtnText}>From Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {scanSuccessMessage && !isScanning && (
            <View style={styles.successBanner}>
              <CheckCircle2 size={16} color="#16A34A" />
              <Text style={styles.successBannerText}>{scanSuccessMessage}</Text>
            </View>
          )}
        </View>

        {/* 2. Product Header Information */}
        <View style={styles.productInfoBox}>
          <Factory size={18} color="#2563EB" />
          <View style={{ flex: 1 }}>
            <Text style={styles.productInfoName}>{productName}</Text>
            <Text style={styles.productInfoSub}>
              Units: Primary ({unit}) • Secondary ({secondaryUnit})
            </Text>
          </View>
        </View>

        {/* 3. Date, Period & Shift Configuration Row */}
        <View style={styles.fieldSection}>
          <Text style={styles.sectionTitle}>Shift & Date Details</Text>

          {/* Production Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Production Date</Text>
            <TouchableOpacity
              style={styles.pickerTrigger}
              onPress={() => setDateModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.pickerLeft}>
                <Calendar size={16} color="#2563EB" />
                <Text style={styles.pickerValue}>{productionDate}</Text>
              </View>
              <Text style={styles.pickerHint}>Today</Text>
            </TouchableOpacity>
          </View>

          {/* Period Type & Shift in 2 Columns */}
          <View style={styles.twoCol}>
            {/* Period Type */}
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Period Type</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setPeriodModalVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={[styles.pickerValue, { textTransform: "capitalize" }]}>
                  {periodType}
                </Text>
                <ChevronDown size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Shift */}
            <View style={[styles.inputGroup, { flex: 1.4 }]}>
              <Text style={styles.inputLabel}>Shift (Auto-detected)</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => setShiftModalVisible(true)}
                activeOpacity={0.8}
              >
                <View style={styles.pickerLeft}>
                  <Clock size={14} color="#D97706" />
                  <Text style={styles.pickerValue} numberOfLines={1}>
                    {shiftName}
                  </Text>
                </View>
                <ChevronDown size={14} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 4. Production Quantities (Auto-filled or manual) */}
        <View style={styles.fieldSection}>
          <Text style={styles.sectionTitle}>Production Quantities</Text>

          {/* Primary Production Quantity */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Primary Production Quantity *</Text>
              <Text style={styles.requiredPill}>Required</Text>
            </View>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={primaryQty}
                onChangeText={setPrimaryQty}
                placeholder="e.g. 1250"
                placeholderTextColor="#94A3B8"
              />
              <View style={styles.unitBadge}>
                <Text style={styles.unitBadgeText}>{unit}</Text>
              </View>
            </View>
          </View>

          {/* Secondary Production Quantity */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Secondary Production Quantity</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={secondaryQty}
                onChangeText={setSecondaryQty}
                placeholder="e.g. 580"
                placeholderTextColor="#94A3B8"
              />
              <View style={styles.unitBadge}>
                <Text style={styles.unitBadgeText}>{secondaryUnit}</Text>
              </View>
            </View>
          </View>

          {/* Wastage Quantity */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Wastage Quantity</Text>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={wastageQty}
                onChangeText={setWastageQty}
                placeholder="e.g. 20"
                placeholderTextColor="#94A3B8"
              />
              <View style={[styles.unitBadge, { backgroundColor: "#FEE2E2" }]}>
                <Text style={[styles.unitBadgeText, { color: "#DC2626" }]}>{unit}</Text>
              </View>
            </View>
          </View>

          {/* Remarks */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Remarks / Notes (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              multiline
              numberOfLines={2}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="e.g. Batch run, normal operation..."
              placeholderTextColor="#94A3B8"
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Footer */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          disabled={isSaving}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.88}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Save size={18} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Save Production Log</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Shift Selection Modal */}
      <Modal visible={shiftModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShiftModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Shift</Text>
            {shiftOptions.map((item) => (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.modalItem,
                  shiftName === item.name && styles.modalItemSelected,
                ]}
                onPress={() => {
                  setShiftName(item.name);
                  setShiftModalVisible(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalItemText}>{item.name}</Text>
                  <Text style={styles.modalItemSub}>{item.timing}</Text>
                </View>
                {shiftName === item.name && <Check size={18} color="#2563EB" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Period Selection Modal */}
      <Modal visible={periodModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPeriodModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Period Type</Text>
            {PERIOD_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.modalItem,
                  periodType === type && styles.modalItemSelected,
                ]}
                onPress={() => {
                  setPeriodType(type as any);
                  setPeriodModalVisible(false);
                }}
              >
                <Text style={[styles.modalItemText, { textTransform: "capitalize" }]}>
                  {type}
                </Text>
                {periodType === type && <Check size={18} color="#2563EB" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date Picker Modal */}
      <Modal visible={dateModalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDateModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Production Date</Text>
            {[0, 1, 2].map((daysAgo) => {
              const d = new Date();
              d.setDate(d.getDate() - daysAgo);
              const ymd = formatDateYMD(d);
              const label = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} Days Ago`;

              return (
                <TouchableOpacity
                  key={ymd}
                  style={[
                    styles.modalItem,
                    productionDate === ymd && styles.modalItemSelected,
                  ]}
                  onPress={() => {
                    setProductionDate(ymd);
                    setDateModalVisible(false);
                  }}
                >
                  <View>
                    <Text style={styles.modalItemText}>{label}</Text>
                    <Text style={styles.modalItemSub}>{ymd}</Text>
                  </View>
                  {productionDate === ymd && <Check size={18} color="#2563EB" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 4. Premium Save Success Modal ── */}
      <Modal
        visible={saveSuccessVisible}
        transparent
        animationType="fade"
        onRequestClose={handleSuccessClose}
      >
        <View style={styles.successBackdrop}>
          <View style={styles.successCard}>
            {/* Emerald Icon Ring */}
            <View style={styles.successIconOuter}>
              <View style={styles.successIconInner}>
                <CheckCircle2 size={36} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </View>

            <Text style={styles.successTitle}>Production Log Saved!</Text>
            <Text style={styles.successSubtitle}>
              Log recorded successfully for{"\n"}
              <Text style={styles.successProductName}>{productName}</Text>
            </Text>

            {/* Shift & Date Pill */}
            <View style={styles.successMetaRow}>
              <View style={styles.successMetaPill}>
                <Calendar size={13} color="#475569" />
                <Text style={styles.successMetaText}>{productionDate}</Text>
              </View>
              <View style={styles.successMetaPill}>
                <Clock size={13} color="#475569" />
                <Text style={styles.successMetaText}>Shift {shiftName}</Text>
              </View>
            </View>

            {/* Quantities summary table */}
            {savedSummary && (
              <View style={styles.successSummaryBox}>
                <View style={styles.successSummaryCol}>
                  <Text style={styles.successSummaryLabel}>PRIMARY</Text>
                  <Text style={[styles.successSummaryVal, { color: "#2563EB" }]}>
                    {savedSummary.primary}
                  </Text>
                  <Text style={styles.successSummaryUnit}>{unit}</Text>
                </View>

                <View style={styles.successSummaryDivider} />

                <View style={styles.successSummaryCol}>
                  <Text style={styles.successSummaryLabel}>SECONDARY</Text>
                  <Text style={[styles.successSummaryVal, { color: "#0F172A" }]}>
                    {savedSummary.secondary}
                  </Text>
                  <Text style={styles.successSummaryUnit}>{secondaryUnit}</Text>
                </View>

                <View style={styles.successSummaryDivider} />

                <View style={styles.successSummaryCol}>
                  <Text style={styles.successSummaryLabel}>WASTAGE</Text>
                  <Text style={[styles.successSummaryVal, { color: "#EF4444" }]}>
                    {savedSummary.wastage}
                  </Text>
                  <Text style={styles.successSummaryUnit}>{unit}</Text>
                </View>
              </View>
            )}

            {/* Recalculation notice */}
            <View style={styles.successRecalcBanner}>
              <Sparkles size={14} color="#16A34A" />
              <Text style={styles.successRecalcText}>
                Upstream SEC, TEC & cost metrics recalculated
              </Text>
            </View>

            {/* Action button */}
            <TouchableOpacity
              style={styles.successActionButton}
              onPress={handleSuccessClose}
              activeOpacity={0.85}
            >
              <Text style={styles.successActionText}>Done & View Metrics</Text>
            </TouchableOpacity>
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
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  backButton: {
    padding: 6,
    marginRight: 8,
  },
  appBarTitleCol: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  appBarSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  scanCard: {
    backgroundColor: "#F0F7FF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: "#BFDBFE",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  scanCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  scanIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  scanCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E3A8A",
  },
  scanCardSub: {
    fontSize: 12,
    color: "#475569",
    marginTop: 3,
    lineHeight: 16,
  },
  scanButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  cameraBtn: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 11,
    borderRadius: 10,
    gap: 8,
  },
  cameraBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  galleryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingVertical: 11,
    borderRadius: 10,
    gap: 6,
  },
  galleryBtnText: {
    color: "#2563EB",
    fontSize: 13,
    fontWeight: "600",
  },
  scanningIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 10,
    backgroundColor: "#DBEAFE",
    borderRadius: 8,
  },
  scanningText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E40AF",
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  successBannerText: {
    fontSize: 12,
    color: "#15803D",
    flex: 1,
    fontWeight: "500",
    lineHeight: 16,
  },
  productInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  productInfoName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  productInfoSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  fieldSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  requiredPill: {
    fontSize: 10,
    fontWeight: "600",
    color: "#DC2626",
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  pickerHint: {
    fontSize: 12,
    color: "#64748B",
  },
  twoCol: {
    flexDirection: "row",
    gap: 12,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  textInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  multilineInput: {
    height: 70,
    textAlignVertical: "top",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontWeight: "400",
  },
  unitBadge: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unitBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  saveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 16,
  },
  modalItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  modalItemSelected: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  modalItemText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
  },
  modalItemSub: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },

  // ── Success Modal Styles ──────────────────────────────────────────────────
  successBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  successCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  successIconOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successIconInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#16A34A",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#16A34A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
    marginBottom: 6,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 13.5,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 14,
  },
  successProductName: {
    fontWeight: "700",
    color: "#1E293B",
  },
  successMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  successMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  successMetaText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#475569",
  },
  successSummaryBox: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  successSummaryCol: {
    flex: 1,
    alignItems: "center",
  },
  successSummaryLabel: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  successSummaryVal: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  successSummaryUnit: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94A3B8",
    marginTop: 1,
  },
  successSummaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E2E8F0",
  },
  successRecalcBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    width: "100%",
    justifyContent: "center",
  },
  successRecalcText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
  },
  successActionButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  successActionText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
});
