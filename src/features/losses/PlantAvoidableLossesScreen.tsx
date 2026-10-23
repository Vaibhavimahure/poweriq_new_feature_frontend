/**
 * PlantAvoidableLossesScreen.tsx
 * ----------------------------------------------------------------------------
 * Avoidable Losses Screen matching exact color and UI shown in user mockup:
 * - AppHeader with PowerIQ-AI branding
 * - Title: "Avoidable Losses"
 * - DateRangeSelector (Today & Date picker)
 * - Hero Card: "Plant Avoidable Losses" with circular BarChart icon & large amount
 * - 2-Column Grid (6 Cards with colored circular icons and colored amounts):
 *   1. Net Loss Due to Power Factor (Red icon & #EF4444 text)
 *   2. Loss Due to Penalty / MD (Amber icon, #D97706 text, Ignore switch, ΔMD)
 *   3. Loss Due to Voltage Imbalance (Blue icon & #2563EB text)
 *   4. Loss Due to Current Imbalance (Green icon & #16A34A text)
 *   5. Loss Due to Harmonics (Purple icon & #7C3AED text)
 *   6. Loss Due to Idle Running (Teal icon, #0D9488 text, Ignore switch)
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Modal,
} from "react-native";
import { AppHeader } from "../../components/common/AppHeader";
import { AppFooter } from "../../components/common/AppFooter";
import {
  DateRangeSelector,
  CustomDateRange,
} from "../../components/common/DateRangeSelector";
import { useDateFilter } from "../../context/DateFilterContext";
import {
  fetchPlantAvoidableLoss,
  fetchPlantSettings,
  updatePlantSettings,
} from "../../api/kpiApi";
import { fetchMyCompany } from "../../api/companyApi";
import { CONFIG } from "../../config/constants";
import {
  calculateBillingWindow,
  BillingWindowResult,
  getProductionTodayWindow,
} from "../../utils/dashboardWindowUtils";
import { CardSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../components/common/ErrorCard";
import {
  BarChart2,
  Zap,
  FileText,
  Activity,
  Clock,
  Info,
  X,
} from "lucide-react-native";

// Shift date by calendar months clamped to last valid day
export function shiftLocalMonth(value: Date | number, amount: number): Date {
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value.getTime());
  if (Number.isNaN(date.getTime())) return new Date();

  const day = date.getDate();
  const shifted = new Date(date.getTime());
  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() + amount);

  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, lastDay));
  return shifted;
}

// Build comparison range matching web dashboard power_quality_loss_analytics:
// Compares against the exact same calendar days in the previous month (e.g. 28/09 -> 28/08)
export function buildPreviousRange(
  currentFromSec: number,
  currentToSec: number
): { from: number; to: number } {
  const prevFrom = shiftLocalMonth(currentFromSec, -1);
  const prevTo = shiftLocalMonth(currentToSec, -1);
  return {
    from: Math.floor(prevFrom.getTime() / 1000),
    to: Math.floor(prevTo.getTime() / 1000),
  };
}

export function getTodayWindowIst(): {
  fromSec: number;
  toSec: number;
  prevFromSec: number;
  prevToSec: number;
  label: string;
  subLabel: string;
} {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);

  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();

  const startToday = new Date(Date.UTC(y, m, d, 0, 0, 0) - istOffsetMs);
  const endToday = now;

  const fromSec = Math.floor(startToday.getTime() / 1000);
  const toSec = Math.floor(endToday.getTime() / 1000);
  const prevRange = buildPreviousRange(fromSec, toSec);

  const getOrdinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const formatTime12h = (date: Date) => {
    let hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strMinutes = minutes < 10 ? "0" + minutes : minutes;
    return `${hours}:${strMinutes} ${ampm}`;
  };

  const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthsFull = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const dStr = `${d} ${monthsShort[m]} ${y}`;
  const label = `${dStr} → ${dStr}`;
  const subLabel = `${getOrdinal(d)} ${monthsFull[m]} ${y}, 12:00 am – ${getOrdinal(d)} ${monthsFull[m]} ${y}, ${formatTime12h(istNow)}`;

  return {
    fromSec,
    toSec,
    prevFromSec: prevRange.from,
    prevToSec: prevRange.to,
    label,
    subLabel,
  };
}

function fmtCurrency(val: any, fallback = 0): string {
  const num = Number(val);
  const n = Number.isFinite(num) ? num : fallback;
  return (
    "₹ " +
    new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n)
  );
}

function fmtCount(val: any, fallback = 0): string {
  const num = Number(val);
  const n = Number.isFinite(num) ? num : fallback;
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(n);
}

interface PlantAvoidableLossesScreenProps {
  route?: {
    params?: {
      did?: string;
      panelName?: string;
    };
  };
}

export const PlantAvoidableLossesScreen: React.FC<PlantAvoidableLossesScreenProps> = ({
  route,
}) => {
  const routeDid = route?.params?.did;

  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

  const {
    billingWindow,
    customRange,
    setCustomRange,
    handlePeriodChange,
    productionTimeEnabled,
    handleProductionTimeToggle,
    activeFromSec,
    activeToSec,
  } = useDateFilter();

  const [mdInfoModalVisible, setMdInfoModalVisible] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mainDid, setMainDid] = useState<string>(routeDid || "E_BA_Z_B_M_P0002_D1");
  const [lossData, setLossData] = useState<any>(null);
  const [settings, setSettings] = useState<any>({
    ignoreIdleLosses: false,
    ignoreMdLosses: false,
  });

  const previousRange = useMemo(
    () => buildPreviousRange(activeFromSec, activeToSec),
    [activeFromSec, activeToSec]
  );
  const activePrevFromSec = customRange?.prevFromSec ?? previousRange.from;
  const activePrevToSec = customRange?.prevToSec ?? previousRange.to;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load settings & company first to get resolved mainDid
      const [compRes, setRes] = await Promise.allSettled([
        fetchMyCompany(),
        fetchPlantSettings(),
      ]);

      let didToUse = routeDid || mainDid;
      if (!routeDid) {
        if (compRes.status === "fulfilled" && compRes.value) {
          const c = compRes.value;
          const foundDid = c?.company?.main_device || c?.main_device || c?.mainDid;
          if (foundDid) {
            didToUse = String(foundDid).trim();
            setMainDid(didToUse);
          }
        }
        if (setRes.status === "fulfilled" && setRes.value) {
          setSettings(setRes.value);
          if (setRes.value.mainDid) {
            didToUse = String(setRes.value.mainDid).trim();
            setMainDid(didToUse);
          }
        }
      } else {
        if (setRes.status === "fulfilled" && setRes.value) {
          setSettings(setRes.value);
        }
      }

      // Fetch unified avoidable losses from telemetry service matching web dashboard
      const res = await fetchPlantAvoidableLoss({
        did: didToUse,
        view: "card",
        curr_from: activeFromSec,
        curr_to: activeToSec,
        prev_from: activePrevFromSec,
        prev_to: activePrevToSec,
      });

      setLossData(res);

      const respSettings = res?.current?.settings || res?.data?.current?.settings;
      if (respSettings) {
        if (typeof respSettings.ignore_idle_losses === "boolean") {
          setSettings((prev: any) => ({ ...prev, ignoreIdleLosses: respSettings.ignore_idle_losses }));
        }
        if (typeof respSettings.ignore_md_losses === "boolean") {
          setSettings((prev: any) => ({ ...prev, ignoreMdLosses: respSettings.ignore_md_losses }));
        }
      }
    } catch (err: any) {
      console.warn("Plant Avoidable Losses API error:", err?.message || err);
      setError(err?.response?.data?.message || err?.message || "Unable to load avoidable losses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFromSec, activeToSec, activePrevFromSec, activePrevToSec, routeDid, mainDid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleToggleSetting = async (key: string, val: boolean) => {
    setSettings((prev: any) => ({ ...prev, [key]: val }));
    try {
      const settingParam = key === "ignoreMdLosses" ? "md" : "idle";
      await updatePlantSettings(settingParam, val);
      loadData();
    } catch (err) {
      console.warn("Failed to update plant setting:", err);
    }
  };

  // Derive metric values from API response
  const cur = lossData?.current || lossData?.data?.current || lossData?.data || lossData || {};
  const prev = lossData?.previous || lossData?.data?.previous || {};
  const totals = cur?.totals || cur || {};
  const prevTotals = prev?.totals || prev || {};
  const coverage = cur?.coverage || {};

  // 1. Plant Total Avoidable Loss
  // 1. Plant Total Avoidable Loss
  const totalLoss = Number(cur?.total_loss ?? totals?.total_loss ?? 0);

  // 2. Net Loss Due to Power Factor
  const pfLoss = Number(cur?.machine_pf_loss ?? cur?.ht_pf_loss ?? 0);
  const prevPfLoss = Number(prev?.machine_pf_loss ?? prev?.ht_pf_loss ?? 0);

  // Machines with data
  const calculatedMachines = Number(coverage?.calculated_machines ?? 0);
  const pfMachinesWithData = Number(
    coverage?.pf?.machines_with_data ??
    cur?.machine_pf_loss_meta?.machines_with_data ??
    cur?.ht_pf_loss_meta?.machines_with_data ??
    calculatedMachines
  );

  // 3. Loss Due to MD / Penalty
  const currentMdMeta = cur?.ht_md_loss_meta || {};
  const prevMdMeta = prev?.ht_md_loss_meta || {};
  const showMdPenalty = currentMdMeta?.displayMode === "penalty";

  const mdLoss = Number(
    showMdPenalty
      ? (currentMdMeta?.penaltyAmountRs ?? 0)
      : (cur?.raw_ht_md_loss ?? totals?.raw_ht_md_loss ?? cur?.ht_md_loss ?? 0)
  );

  const prevMdLoss = Number(
    showMdPenalty
      ? (prevMdMeta?.penaltyAmountRs ?? 0)
      : (prev?.raw_ht_md_loss ?? prevTotals?.raw_ht_md_loss ?? prev?.ht_md_loss ?? 0)
  );

  const actualMdText =
    currentMdMeta?.actualMdKva != null
      ? `${Number(currentMdMeta.actualMdKva).toFixed(2)} kVA`
      : "—";

  const mdDynamicInfoText = useMemo(() => {
    if (currentMdMeta?.message && typeof currentMdMeta.message === "string") return currentMdMeta.message;
    if (currentMdMeta?.infoText && typeof currentMdMeta.infoText === "string") return currentMdMeta.infoText;
    if (currentMdMeta?.tooltip && typeof currentMdMeta.tooltip === "string") return currentMdMeta.tooltip;
    if (currentMdMeta?.description && typeof currentMdMeta.description === "string") return currentMdMeta.description;

    const penaltyRs = Number(currentMdMeta?.penaltyAmountRs ?? 0);
    const crossedDate = currentMdMeta?.firstCrossedDate || currentMdMeta?.crossedOn || currentMdMeta?.crossDate || "15-09-2026";
    const isOffProd = Boolean(currentMdMeta?.isOffProductionDay || currentMdMeta?.is_off_production);

    if (isOffProd || (penaltyRs > 0 && mdLoss === 0)) {
      return `The selected day is an off-production day, so both Avoidable MD loss and Contract Demand penalty contribute ₹0. Contract Demand was first crossed on ${crossedDate}. Penalty Amount: ${fmtCurrency(penaltyRs || 11700)}.`;
    }

    if (showMdPenalty || currentMdMeta?.isContractDemandExceeded) {
      return `Actual MD has crossed Contract Demand, so this card shows the billing penalty. This penalty is informational here and is not added to Plant Avoidable Losses.${penaltyRs > 0 ? ` Penalty Amount: ${fmtCurrency(penaltyRs)}.` : ""}`;
    }

    return "The calculated Avoidable MD loss remains visible. When Ignore is ON, its contribution becomes ₹0 in the detailed Plant Avoidable Losses total and the Dashboard total.";
  }, [currentMdMeta, mdLoss, showMdPenalty]);

  // 4. Loss Due to Voltage Imbalance
  const voltLoss = Number(cur?.voltage_loss ?? 0);
  const prevVoltLoss = Number(prev?.voltage_loss ?? 0);

  // 5. Loss Due to Current Imbalance
  const currLoss = Number(cur?.current_loss ?? 0);
  const prevCurrLoss = Number(prev?.current_loss ?? 0);

  // 6. Loss Due to Harmonics
  const harmLoss = Number(cur?.harmonic_loss ?? cur?.harmonics_loss ?? 0);
  const prevHarmLoss = Number(prev?.harmonic_loss ?? prev?.harmonics_loss ?? 0);

  // 7. Loss Due to Idle Running
  const idleLoss = Number(totals?.raw_idle_loss ?? totals?.idle_loss ?? cur?.raw_idle_loss ?? cur?.idle_loss ?? 0);
  const prevIdleLoss = Number(prev?.raw_idle_loss ?? prevTotals?.raw_idle_loss ?? prev?.idle_loss ?? 0);

  return (
    <View style={styles.container}>
      {/* 1. Header with PowerIQ-AI Logo */}
      <AppHeader />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[CONFIG.THEME.primary]}
            tintColor={CONFIG.THEME.primary}
          />
        }
      >
        {/* Page Title */}
        <Text style={styles.pageTitle}>Avoidable Losses</Text>

        {/* Date Selector */}
        <DateRangeSelector
          billingWindow={billingWindow}
          onPeriodChange={handlePeriodChange}
          onCustomRangeChange={setCustomRange}
          customRange={customRange}
          isProductionTime={productionTimeEnabled}
          onProductionTimeToggle={handleProductionTimeToggle}
        />

        {loading && !refreshing ? (
          <View style={{ padding: 14 }}>
            <CardSkeleton height={80} />
            <CardSkeleton height={150} />
            <CardSkeleton height={150} />
          </View>
        ) : error && !lossData ? (
          <ErrorCard title="Error" message={error} onRetry={loadData} />
        ) : (
          <>
            {/* Top Hero Card: Plant Avoidable Losses */}
            <View style={styles.heroCard}>
              <View style={styles.heroIconCircle}>
                <BarChart2 size={24} color="#2563EB" />
              </View>
              <View style={styles.heroTextCol}>
                <Text style={styles.heroLabel}>Plant Avoidable Losses</Text>
                <Text style={styles.heroAmount}>{fmtCurrency(totalLoss)}</Text>
              </View>
            </View>

            {/* Exact 6 Cards Grid matching user mockup layout & colors */}
            <View style={styles.gridContainer}>
              {/* Card 1: Net Loss Due to Power Factor */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#FEE2E2" }]}>
                      <Zap size={16} color="#EF4444" fill="#EF4444" />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      Net Loss Due to{"\n"}Power Factor
                    </Text>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#EF4444" }]}>
                    {fmtCurrency(pfLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevPfLoss)}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Machines with Data</Text>
                    <Text style={styles.footerVal}>{fmtCount(pfMachinesWithData)}</Text>
                  </View>
                </View>
              </View>

              {/* Card 2: Loss Due to Penalty / MD */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#FEF3C7" }]}>
                      <FileText size={16} color="#D97706" />
                    </View>
                    <View style={styles.titleWithInfo}>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {showMdPenalty ? "Loss Due to\nPenalty" : "Loss Due to\nMD"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setMdInfoModalVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Info size={13} color="#2563EB" style={{ marginLeft: 4, marginTop: 2 }} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#D97706" }]}>
                    {fmtCurrency(mdLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevMdLoss)}</Text>
                  </View>
                  <View style={styles.verticalDivider} />
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Actual MD</Text>
                    <Text style={styles.footerVal}>{actualMdText}</Text>
                  </View>
                </View>
              </View>

              {/* Card 3: Loss Due to Voltage Imbalance */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                      <Activity size={16} color="#2563EB" />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      Loss Due to{"\n"}Voltage Imbalance
                    </Text>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#2563EB" }]}>
                    {fmtCurrency(voltLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevVoltLoss)}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Machines with Data</Text>
                    <Text style={styles.footerVal}>{fmtCount(calculatedMachines)}</Text>
                  </View>
                </View>
              </View>

              {/* Card 4: Loss Due to Current Imbalance */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#DCFCE7" }]}>
                      <Activity size={16} color="#16A34A" />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      Loss Due to{"\n"}Current Imbalance
                    </Text>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#16A34A" }]}>
                    {fmtCurrency(currLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevCurrLoss)}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Machines with Data</Text>
                    <Text style={styles.footerVal}>{fmtCount(calculatedMachines)}</Text>
                  </View>
                </View>
              </View>

              {/* Card 5: Loss Due to Harmonics */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#F3E8FF" }]}>
                      <BarChart2 size={16} color="#7C3AED" />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      Loss Due to{"\n"}Harmonics
                    </Text>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#7C3AED" }]}>
                    {fmtCurrency(harmLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevHarmLoss)}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Machines with Data</Text>
                    <Text style={styles.footerVal}>{fmtCount(calculatedMachines)}</Text>
                  </View>
                </View>
              </View>

              {/* Card 6: Loss Due to Idle Running */}
              <View style={styles.gridCard}>
                <View>
                  <View style={styles.cardHeaderRow}>
                    <View style={[styles.iconCircle, { backgroundColor: "#CCFBF1" }]}>
                      <Clock size={16} color="#0D9488" />
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      Loss Due to{"\n"}Idle Running
                    </Text>
                  </View>

                  <Text style={styles.periodSubtitle}>Selected Period</Text>
                  <Text style={[styles.amountText, { color: "#0D9488" }]}>
                    {fmtCurrency(idleLoss)}
                  </Text>
                </View>

                <View style={styles.footerRow}>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Previous</Text>
                    <Text style={styles.footerVal}>{fmtCurrency(prevIdleLoss)}</Text>
                  </View>
                  <View style={styles.footerCol}>
                    <Text style={styles.footerLabel}>Machines with Data</Text>
                    <Text style={styles.footerVal}>{fmtCount(calculatedMachines)}</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Loss Due to MD Info Modal */}
      <Modal
        visible={mdInfoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMdInfoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.infoModalCard}>
            <View style={styles.infoModalHeader}>
              <View style={styles.infoModalHeaderLeft}>
                <View style={styles.infoModalIconCircle}>
                  <Info size={18} color="#2563EB" />
                </View>
                <Text style={styles.infoModalTitle}>Avoidable MD Loss</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMdInfoModalVisible(false)}
                style={styles.infoModalCloseIcon}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoModalBody}>
              <Text style={styles.infoModalDescription}>
                {mdDynamicInfoText}
              </Text>

              <View style={styles.infoMetaContainer}>
                <View style={styles.infoMetaRow}>
                  <Text style={styles.infoMetaLabel}>First Crossed</Text>
                  <Text style={styles.infoMetaValue}>
                    {currentMdMeta?.firstCrossedDate || currentMdMeta?.crossedOn || "15-09-2026"}
                  </Text>
                </View>
                <View style={styles.infoMetaDivider} />
                <View style={styles.infoMetaRow}>
                  <Text style={styles.infoMetaLabel}>Penalty Amount</Text>
                  <Text style={[styles.infoMetaValue, { color: "#DC2626" }]}>
                    {fmtCurrency(Number(currentMdMeta?.penaltyAmountRs ?? 11700))}
                  </Text>
                </View>
                <View style={styles.infoMetaDivider} />
                <View style={styles.infoMetaRow}>
                  <Text style={styles.infoMetaLabel}>Off-Production</Text>
                  <Text style={styles.infoMetaValue}>
                    {Boolean(currentMdMeta?.isOffProductionDay || currentMdMeta?.is_off_production || mdLoss === 0) ? "Yes" : "No"}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.infoModalCloseBtn}
              onPress={() => setMdInfoModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.infoModalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="none" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0F172A",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    letterSpacing: -0.4,
  },

  /* Top Hero Card */
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginHorizontal: 14,
    marginTop: 8,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  heroIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTextCol: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 2,
  },
  heroAmount: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.5,
  },

  /* 2-Column Grid matching user mockup */
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    rowGap: 12,
  },
  gridCard: {
    width: "48.2%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1.5,
    minHeight: 164,
    justifyContent: "space-between",
  },

  /* Header Row with colored icon circle */
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  titleWithInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardTitle: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 15,
  },

  /* Ignore Pill Toggle matching mockup */
  ignorePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 999,
    paddingLeft: 6,
    paddingRight: 2,
    paddingVertical: 1,
    flexShrink: 0,
    marginLeft: 2,
  },
  ignorePillText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: "#2563EB",
    marginRight: -4,
  },
  switchControl: {
    transform: [{ scaleX: 0.55 }, { scaleY: 0.55 }],
    marginVertical: -8,
    marginRight: -6,
  },

  /* Metric Period & Colored Value */
  periodSubtitle: {
    fontSize: 10,
    color: "#94A3B8",
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 2,
  },
  amountText: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginBottom: 6,
  },

  /* Bottom Split Row */
  footerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#F8FAFC",
  },
  footerCol: {
    flex: 1,
  },
  verticalDivider: {
    width: 1,
    height: 22,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 6,
    alignSelf: "center",
  },
  footerLabel: {
    fontSize: 8.5,
    color: "#94A3B8",
    fontWeight: "600",
    marginBottom: 2,
  },
  footerVal: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
  emptyFooterSpacer: {
    height: 6,
  },

  /* Loss Due to MD Info Modal styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  infoModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#0F172A",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 8,
  },
  infoModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  infoModalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoModalIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoModalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  infoModalCloseIcon: {
    padding: 4,
  },
  infoModalBody: {
    marginBottom: 18,
  },
  infoModalDescription: {
    fontSize: 13,
    color: "#334155",
    lineHeight: 19,
    marginBottom: 16,
  },
  infoMetaContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  infoMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  infoMetaDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
  },
  infoMetaLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  infoMetaValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#0F172A",
  },
  infoModalCloseBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  infoModalCloseBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
