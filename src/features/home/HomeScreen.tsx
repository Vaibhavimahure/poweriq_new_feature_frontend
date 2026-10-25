/**
 * HomeScreen.tsx
 * ----------------------------------------------------------------------------
 * Primary PowerIQ Mobile Landing Screen:
 * - App Header with Brand Logo, Bell Badge, Avatar
 * - Greeting / Hero Area (Time-aware Good Morning/Afternoon/Evening + User Name)
 * - Date Range / Billing Period Selector
 * - Plant Power Flow Card (with Energy/Cost toggle)
 * - Alert Summary Card (Total, Pending Crit/Warn, Solved, Acked)
 * - Recent Alerts Card
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { AppHeader } from "../../components/common/AppHeader";
import {
  DateRangeSelector,
  CustomDateRange,
} from "../../components/common/DateRangeSelector";
import { PlantPowerFlowCard } from "./components/PlantPowerFlowCard";
import { SolarInverterEditModal } from "./components/SolarInverterEditModal";
import {
  MachineWiseSecCard,
  MachineSecData,
  isSecProductionDid,
} from "./components/MachineWiseSecCard";
import { useAuth } from "../../context/AuthContext";
import { useDateFilter } from "../../context/DateFilterContext";
import { CONFIG } from "../../config/constants";
import {
  calculateBillingWindow,
  BillingWindowResult,
  getProductionTodayWindow,
} from "../../utils/dashboardWindowUtils";
import { fetchMyCompany } from "../../api/companyApi";
import {
  fetchPlantPowerFlow,
  fetchOwnerSolarPerformance,
  fetchEnergyCostAnalysis,
  fetchPlantOverview,
  fetchFavoriteMachines,
} from "../../api/kpiApi";
import { fetchIncomerPfTelemetry } from "../../api/telemetryApi";
import {
  fetchSecOverview,
  fetchSecMachineOverview,
  fetchSecProductConfigs,
} from "../../api/secApi";
import { alertApi } from "../../api/alertApi";
import { AlertItem } from "../../types/alert";
import { useNavigation } from "@react-navigation/native";

interface HomeScreenProps {
  onNavigateToAlerts?: () => void;
  onNavigateToSec?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigateToAlerts,
  onNavigateToSec,
}) => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const lastRequestSeq = useRef(0);

  // Global Shared Calendar / Date Filter Context
  const {
    billingWindow,
    customRange,
    setCustomRange,
    handlePeriodChange,
    productionTimeEnabled,
    handleProductionTimeToggle,
    activeFromSec,
    activeToSec,
    resolvedDateRange,
    setBillingCycleDay,
  } = useDateFilter();

  // Data States
  const [refreshing, setRefreshing] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<any>(null);

  // Power Flow States
  const [powerFlowLoading, setPowerFlowLoading] = useState(true);
  const [powerFlowData, setPowerFlowData] = useState<any>(null);
  const [powerFlowCostData, setPowerFlowCostData] = useState<any>(null);
  const [solarPerf, setSolarPerf] = useState<any>(null);
  const [incomerPf, setIncomerPf] = useState<number | null>(null);
  const [secOverviewData, setSecOverviewData] = useState<any>(null);
  const [machineSecList, setMachineSecList] = useState<MachineSecData[]>([
    {
      did: "E_BA_Z_B_R_P0002_D3",
      name: "Flat line",
      primaryUnit: "kg",
      secondaryUnit: "mts",
      primaryProductionQtyEntered: 0,
      secondaryProductionQtyEntered: 0,
      wastageQty: 0,
      machineEnergy: 227.6,
      productionRuntimeHours: 11.517, // 11 hrs 31 mins
      targetProduction: null,
      targetCost: null,
      costPerProductionUnit: null,
    },
    {
      did: "E_BA_Z_B_X_P0002_D2",
      name: "HDPE Kabra",
      primaryUnit: "kg",
      secondaryUnit: "mts",
      primaryProductionQtyEntered: null,
      secondaryProductionQtyEntered: null,
      wastageQty: null,
      machineEnergy: 155.6,
      productionRuntimeHours: 10.017, // 10 hrs 1 mins
      targetProduction: null,
      targetCost: null,
      costPerProductionUnit: null,
    },
    {
      did: "E_BA_Z_B_R_P0002_D4",
      name: "RR Round Drip",
      primaryUnit: "kg",
      secondaryUnit: "mts",
      primaryProductionQtyEntered: null,
      secondaryProductionQtyEntered: null,
      wastageQty: null,
      machineEnergy: null,
      productionRuntimeHours: 24.0,
      targetProduction: null,
      targetCost: null,
      costPerProductionUnit: null,
    },
    {
      did: "E_BA_Z_B_X_P0002_D1",
      name: "Extrusion Line 2",
      primaryUnit: "kg",
      secondaryUnit: "mts",
      primaryProductionQtyEntered: null,
      secondaryProductionQtyEntered: null,
      wastageQty: null,
      machineEnergy: null,
      productionRuntimeHours: 0,
      targetProduction: null,
      targetCost: null,
      costPerProductionUnit: null,
    },
  ]);
  const [machineSecLoading, setMachineSecLoading] = useState(false);
  const [powerFlowError, setPowerFlowError] = useState<string | null>(null);
  const [isSolarModalVisible, setIsSolarModalVisible] = useState(false);

  // Alert States
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertSummary, setAlertSummary] = useState({
    total: 0,
    pendingCritical: 0,
    pendingWarning: 0,
    totalSolved: 0,
    acknowledged: 0,
  });
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);

  // Time-aware greeting
  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return "Good Morning";
    if (hours < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const displayName = user?.name || (user as any)?.username || "Colleague";

  // Load initial Company context
  useEffect(() => {
    let alive = true;
    fetchMyCompany().then((comp) => {
      if (!alive || !comp) return;
      setCompanyInfo(comp);
      if (comp.billingCycleStartDay) {
        setBillingCycleDay(Number(comp.billingCycleStartDay));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fetch Plant Power Flow data
  const loadPlantPowerFlow = useCallback(async () => {
    const reqSeq = ++lastRequestSeq.current;
    setPowerFlowLoading(true);
    setPowerFlowError(null);

    const fromSec = activeFromSec;
    const toSec = activeToSec;

    try {
      const startIso = new Date(fromSec * 1000).toISOString();
      const endIso = new Date(toSec * 1000).toISOString();
      const mode = customRange ? customRange.mode : "billing_cycle";

      // 1. Fetch Energy Cost Analysis, Plant Power Flow, and SEC Overview
      const [costResRaw, flowResRaw, secResRaw] = await Promise.allSettled([
        fetchEnergyCostAnalysis({ fromSec, toSec, from: startIso, to: endIso, mode }),
        fetchPlantPowerFlow({ fromSec, toSec, from: startIso, to: endIso, mode }),
        fetchSecOverview(true),
      ]);

      if (reqSeq !== lastRequestSeq.current) return;

      const costVal = costResRaw.status === "fulfilled" ? costResRaw.value : null;
      if (costVal) setPowerFlowCostData(costVal);

      if (secResRaw.status === "fulfilled") {
        setSecOverviewData(secResRaw.value);
      }

      if (flowResRaw.status === "fulfilled") {
        setPowerFlowData(flowResRaw.value);
      } else {
        const reason = (flowResRaw as any)?.reason;
        const is502 =
          reason?.response?.status === 502 ||
          String(reason?.message || "").includes("502");
        setPowerFlowError(
          is502
            ? "Server telemetry service is temporarily offline (502 Bad Gateway). Tap Retry to reload once restarted."
            : "Unable to load plant power flow data."
        );
      }

      // 2. Extract mainDid matching useOwnerPageStore.js line 627
      const plantMainDid = String(
        costVal?.inputs?.dids?.plantMainDid ||
        costVal?.meta?.dids?.plantMainDid ||
        costVal?.meta?.plantMainDid ||
        costVal?.plantMainDid ||
        companyInfo?.mainDid ||
        companyInfo?.company?.main_device ||
        ""
      ).trim();

      // 3. Fetch Solar Performance and Incomer PF using resolved plantMainDid
      const [solarRes, pfVal] = await Promise.allSettled([
        fetchOwnerSolarPerformance({
          fromSec,
          toSec,
          from: startIso,
          to: endIso,
          mode,
          mainDid: plantMainDid || undefined,
          companyId: companyInfo?._id || companyInfo?.companyId || undefined,
        }),
        fetchIncomerPfTelemetry({
          did: plantMainDid || undefined,
          from: fromSec,
          to: toSec,
        }),
      ]);

      if (reqSeq !== lastRequestSeq.current) return;

      if (solarRes.status === "fulfilled") {
        setSolarPerf(solarRes.value);
      }

      if (pfVal.status === "fulfilled") {
        setIncomerPf(pfVal.value);
      }

      // 4. Fetch Machine-wise SEC metrics, config mappings & favorite machines runtime
      setMachineSecLoading(true);
      try {
        const dateFromStr = resolvedDateRange?.from || startIso.split("T")[0];
        const dateToStr = resolvedDateRange?.to || endIso.split("T")[0];

        const [machineOverviewRes, configsRes, favMachinesRes] = await Promise.allSettled([
          fetchSecMachineOverview({
            productionDateFrom: dateFromStr,
            productionDateTo: dateToStr,
            forceRefresh: true,
          }),
          fetchSecProductConfigs(),
          fetchFavoriteMachines({
            from: fromSec,
            to: toSec,
            mode,
          }),
        ]);

        if (reqSeq !== lastRequestSeq.current) return;

        const configsData = configsRes.status === "fulfilled" ? configsRes.value : [];
        const productsList = Array.isArray(configsData) ? configsData : (configsData as any)?.products || [];

        const machineOverviewData = machineOverviewRes.status === "fulfilled" ? machineOverviewRes.value : {};
        const metricsMachines = Array.isArray(machineOverviewData?.machines)
          ? machineOverviewData.machines
          : Array.isArray(machineOverviewData)
          ? machineOverviewData
          : [];

        const favData = favMachinesRes.status === "fulfilled" ? favMachinesRes.value : null;
        const favList = Array.isArray(favData?.favorites)
          ? favData.favorites
          : Array.isArray(favData?.cards)
          ? favData.cards
          : Array.isArray(favData?.data)
          ? favData.data
          : Array.isArray(favData)
          ? favData
          : [];

        const runtimeByDid = new Map<string, number>();
        favList.forEach((fav: any) => {
          const didKey = String(fav?.did || fav?.deviceId || fav?.id || "").trim().toUpperCase();
          if (!didKey) return;
          const rt = Number(
            fav?.runtime?.fullLoadHours ??
            fav?.fullLoadHours ??
            fav?.runtimeBreakdown?.fullLoadHours ??
            fav?.efficientHours ??
            fav?.runtime?.current?.bands?.full_load?.hours ??
            0
          );
          if (Number.isFinite(rt) && rt > 0) {
            runtimeByDid.set(didKey, rt);
          }
        });

        const byDid = new Map<string, MachineSecData>();

        productsList.forEach((prod: any) => {
          const candidates = [
            prod?.selectedLtDevices,
            prod?.selected_lt_devices,
            prod?.primaryDevices,
            prod?.primary_devices,
            prod?.devices,
          ];
          const devices = candidates.find((arr) => Array.isArray(arr) && arr.length > 0) || [];

          devices.forEach((dev: any) => {
            if (dev?.isActive === false) return;
            const didKey = String(dev?.did || "").trim().toUpperCase();
            if (!didKey || !isSecProductionDid(didKey)) return;

            if (!byDid.has(didKey)) {
              byDid.set(didKey, {
                did: didKey,
                name: String(dev?.name || dev?.panelName || dev?.label || didKey).trim(),
                primaryUnit: prod?.primaryProductUnit || prod?.productUnit || "kg",
                secondaryUnit: prod?.secondaryProductUnit || "mts",
                targetProduction: prod?.targetProduction ?? null,
                targetCost: prod?.targetCost ?? null,
                logCount: 0,
                productCount: 1,
              });
            } else {
              const existing = byDid.get(didKey)!;
              existing.productCount = (existing.productCount || 1) + 1;
            }
          });
        });

        const metricsMap = new Map<string, any>();
        metricsMachines.forEach((m: any) => {
          const didKey = String(m?.did || "").trim().toUpperCase();
          if (didKey) metricsMap.set(didKey, m);
        });

        metricsMachines.forEach((m: any) => {
          const didKey = String(m?.did || "").trim().toUpperCase();
          if (didKey && !byDid.has(didKey) && isSecProductionDid(didKey)) {
            byDid.set(didKey, {
              did: didKey,
              name: String(m?.name || didKey).trim(),
              primaryUnit: m?.primaryUnit || "kg",
              secondaryUnit: m?.secondaryUnit || "mts",
              logCount: Number(m?.logCount) || 0,
              productCount: Number(m?.productCount) || 1,
            });
          }
        });

        // Query missing machine runtimes in parallel matching ProductSecScreen
        const missingDids = Array.from(byDid.keys()).filter((did) => !runtimeByDid.has(did));
        if (missingDids.length > 0) {
          await Promise.allSettled(
            missingDids.map(async (did) => {
              try {
                const res = await fetchFavoriteMachines({
                  did,
                  from: fromSec,
                  to: toSec,
                  mode,
                });
                const card =
                  res?.favorites?.[0] ||
                  res?.cards?.[0] ||
                  (Array.isArray(res?.data) ? res.data[0] : res?.data) ||
                  res;
                const rt = Number(
                  card?.runtime?.fullLoadHours ??
                  card?.fullLoadHours ??
                  card?.runtimeBreakdown?.fullLoadHours ??
                  card?.efficientHours ??
                  card?.runtime?.current?.bands?.full_load?.hours ??
                  0
                );
                if (Number.isFinite(rt) && rt >= 0) {
                  runtimeByDid.set(did, rt);
                }
              } catch {
                // Ignore failure for individual device
              }
            })
          );
        }

        if (reqSeq !== lastRequestSeq.current) return;

        const mergedList: MachineSecData[] = [];
        byDid.forEach((configuredMachine, didKey) => {
          const metric = metricsMap.get(didKey) || {};
          const runtime = runtimeByDid.get(didKey) ?? null;

          mergedList.push({
            ...configuredMachine,
            name: metric?.name || configuredMachine.name,
            primaryUnit: metric?.primaryUnit || configuredMachine.primaryUnit || "kg",
            secondaryUnit: metric?.secondaryUnit || configuredMachine.secondaryUnit || "mts",
            primaryProductionQtyEntered: metric?.primaryProductionQtyEntered ?? null,
            secondaryProductionQtyEntered: metric?.secondaryProductionQtyEntered ?? null,
            wastageQty: metric?.wastageQty ?? null,
            totalProductionQty: metric?.totalProductionQty ?? metric?.grossProductionQty ?? null,
            machineEnergy: metric?.machineEnergy ?? metric?.totalEnergy ?? null,
            secPerProductionUnit: metric?.secPerProductionUnit ?? metric?.sec ?? null,
            costPerProductionUnit: metric?.costPerProductionUnit ?? null,
            logCount: Number(metric?.logCount) || 0,
            productionRuntimeHours: runtime,
          });
        });

        if (reqSeq === lastRequestSeq.current) {
          setMachineSecList(mergedList);
        }
      } catch (secErr) {
        console.warn("[HomeScreen] Machine-wise SEC fetch error:", secErr);
      } finally {
        if (reqSeq === lastRequestSeq.current) {
          setMachineSecLoading(false);
        }
      }
    } catch (err: any) {
      if (reqSeq === lastRequestSeq.current) {
        setPowerFlowError(err?.message || "Failed to load power flow.");
      }
    } finally {
      if (reqSeq === lastRequestSeq.current) {
        setPowerFlowLoading(false);
      }
    }
  }, [activeFromSec, activeToSec, resolvedDateRange, customRange, companyInfo]);

  // Fetch Alerts (Deduplicated single query)
  const loadAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await alertApi.listAlerts({
        page: 1,
        pageSize: 5,
        includeSummary: true,
      });

      const summary = (res as any).summary || {};
      const totals: any = res.totals || {};

      const pendingCrit = Number(summary.pending_critical ?? totals.pending_critical ?? 0);
      const pendingWarn = Number(summary.pending_warning ?? totals.pending_warning ?? 0);
      const solved = Number(summary.total_solved ?? totals.total_solved ?? 0);
      const ackCrit = Number(totals.ack_critical ?? 0);
      const ackWarn = Number(totals.ack_warning ?? 0);
      const acked = ackCrit + ackWarn;

      const total = Number(summary.total_alerts ?? res.total ?? pendingCrit + pendingWarn + solved + acked);

      setAlertSummary({
        total,
        pendingCritical: pendingCrit,
        pendingWarning: pendingWarn,
        totalSolved: solved,
        acknowledged: acked,
      });

      if (Array.isArray(res.rows)) {
        setRecentAlerts(res.rows);
      }
    } catch (err) {
      console.warn("[HomeScreen] loadAlerts failed:", err);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  // Run alerts query once on mount
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Run power flow when time bounds change
  useEffect(() => {
    loadPlantPowerFlow();
  }, [loadPlantPowerFlow]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPlantPowerFlow(), loadAlerts()]);
    setRefreshing(false);
  }, [loadPlantPowerFlow, loadAlerts]);

  const invertersData = useMemo(() => {
    const rawInv =
      solarPerf?.values?.inverters ||
      solarPerf?.raw?.inverters ||
      solarPerf?.inverters ||
      solarPerf?.raw?.values?.inverters;

    if (Array.isArray(rawInv) && rawInv.length > 0) {
      return {
        totalKw:
          solarPerf?.values?.totalKw ??
          solarPerf?.totalKw ??
          rawInv.reduce((sum: number, item: any) => sum + Number(item?.kw || item?.power || 0), 0),
        inverters: rawInv.map((inv: any, idx: number) => ({
          name: String(inv?.name || inv?.inverterName || `INV-${idx + 1}`),
          kw: Number(inv?.kw ?? inv?.power ?? inv?.generation ?? 0),
        })),
      };
    }
    return undefined;
  }, [solarPerf]);

  const handleViewAllAlerts = () => {
    if (onNavigateToAlerts) {
      onNavigateToAlerts();
    } else {
      navigation.navigate("Alerts");
    }
  };

  const handleSelectAlert = (alert: AlertItem) => {
    navigation.navigate("AlertDetail", {
      alertId: alert._id || alert.alert_id,
      alert,
    });
  };

  return (
    <View style={styles.container}>
      <AppHeader
        unreadAlertCount={alertSummary.pendingCritical + alertSummary.pendingWarning}
        onNotificationPress={handleViewAllAlerts}
      />

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
        {/* Hero / Greeting Header */}
        <View style={styles.heroSection}>
          <View style={styles.heroTextContainer}>
            <Text style={styles.greetingText}>{getGreeting()},</Text>
            <Text style={styles.userNameText}>{displayName}</Text>
            {companyInfo?.name || companyInfo?.company_name ? (
              <Text style={styles.plantNameText}>
                {companyInfo.name || companyInfo.company_name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Date / Billing Period Selector */}
        <DateRangeSelector
          billingWindow={billingWindow}
          onPeriodChange={handlePeriodChange}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          isProductionTime={productionTimeEnabled}
          onProductionTimeToggle={handleProductionTimeToggle}
        />

        {/* Plant Power Flow Card - Solar Generation opens Solar Inverters Modal */}
        <PlantPowerFlowCard
          data={powerFlowData}
          costData={powerFlowCostData}
          solarPerformance={solarPerf}
          mainIncomerPf={incomerPf}
          loading={powerFlowLoading}
          error={powerFlowError}
          onRetry={loadPlantPowerFlow}
          onPressSolarGeneration={() => setIsSolarModalVisible(true)}
        />

        {/* Machine-wise Specific Energy Consumption (SEC) Card */}
        <MachineWiseSecCard
          machines={machineSecList}
          loading={machineSecLoading}
          onPressMachine={() => {
            if (onNavigateToSec) {
              onNavigateToSec();
            } else {
              navigation.navigate("SEC" as never);
            }
          }}
        />

        {/* Solar Inverter Readings & Camera Slip OCR Modal */}
        <SolarInverterEditModal
          visible={isSolarModalVisible}
          onClose={() => setIsSolarModalVisible(false)}
          solarDid={
            solarPerf?.solarDid ||
            (companyInfo as any)?.solarDid ||
            (companyInfo as any)?.company?.solarDid ||
            "SOLAR_MAIN"
          }
          plantId={(companyInfo as any)?._id || (companyInfo as any)?.plantId}
          initialInverters={invertersData?.inverters}
          initialTotalKw={invertersData?.totalKw}
          onSaved={() => {
            loadPlantPowerFlow();
          }}
        />
      </ScrollView>
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
    paddingBottom: 24,
  },
  heroSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: CONFIG.THEME.bgCard,
  },
  heroTextContainer: {
    justifyContent: "center",
  },
  greetingText: {
    fontSize: 13,
    color: CONFIG.THEME.textSecondary,
    fontWeight: "500",
  },
  userNameText: {
    fontSize: 22,
    fontWeight: "800",
    color: CONFIG.THEME.textPrimary,
    letterSpacing: -0.5,
    marginTop: 2,
  },
  plantNameText: {
    fontSize: 12,
    fontWeight: "600",
    color: CONFIG.THEME.primary,
    marginTop: 3,
  },
});
