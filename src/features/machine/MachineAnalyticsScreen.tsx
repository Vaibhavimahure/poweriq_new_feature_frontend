
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
} from "react-native";
import { AppHeader } from "../../components/common/AppHeader";
import { AppFooter } from "../../components/common/AppFooter";
import {
  DateRangeSelector,
  CustomDateRange,
} from "../../components/common/DateRangeSelector";
import { useDateFilter } from "../../context/DateFilterContext";
import { fetchDeviceById, fetchAllPlantMachines } from "../../api/deviceApi";
import {
  fetchPerformanceTelemetry,
  fetchCurrentTelemetry,
  fetchMachineSummary,
  fetchLatestTelemetry,
} from "../../api/telemetryApi";
import {
  fetchEnergyCostCard,
  fetchPfAnalysisSummary,
  fetchThdAnalysisSummary,
  fetchPowerImbalance,
  fetchLoadAnalysis,
  fetchTimeVsLoad,
  fetchTodAnalysis,
  fetchFavoriteOptions,
  fetchPowerQualityLosses,
  fetchLfiKpi,
  fetchDemandAnalysis,
} from "../../api/kpiApi";
import { alertApi } from "../../api/alertApi";
import { CONFIG } from "../../config/constants";
import { useNavigation } from "@react-navigation/native";
import { useAlerts } from "../../context/AlertContext";
import {
  calculateBillingWindow,
  BillingWindowResult,
  getProductionTodayWindow,
  MONTHS_FULL,
  shiftLocalMonth,
} from "../../utils/dashboardWindowUtils";
import { CardSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../components/common/ErrorCard";
import {
  Zap,
  Activity,
  Gauge,
  Clock,
  ChevronDown,
  ChevronUp,
  BarChart2,
  AlertTriangle,
  Scale,
  TrendingUp,
  Cpu,
  Check,
  Percent,
  Sliders,
  Info,
  IndianRupee,
} from "lucide-react-native";

interface MachineOption {
  did: string;
  name: string;
  panelType?: string;
  location?: string;
  ratedLoadKw?: number | null;
  ratedPf?: number | null;
  benchmarkScore?: number | null;
}

function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtMins(minutes: any): string {
  if (minutes == null || minutes === "") return "—";
  const num = Number(minutes);
  if (!Number.isFinite(num)) return "—";
  if (num < 60) {
    return `${Math.round(num)} mins`;
  }
  const hrs = Math.floor(num / 60);
  const remMins = Math.round(num % 60);
  return remMins > 0 ? `${hrs} h ${remMins} min` : `${hrs} hrs`;
}

function fmtHoursHM(hours: any): string {
  const h = Number(hours);
  if (!Number.isFinite(h)) return "—";
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h ${String(mm).padStart(2, "0")} min`;
}

const DEFAULT_MACHINES: MachineOption[] = [
  {
    did: "E_BA_Z_B_T_P0006_D3",
    name: "Chiller - Evaporator Pumps",
    panelType: "MCC",
    location: "Utility Area",
  },
  {
    did: "E_BA_Z_B_T_P0006_D2",
    name: "Chiller - Process Pumps",
    panelType: "MCC",
    location: "Utility Area",
  },
  {
    did: "E_BA_Z_B_M_P0002_D1",
    name: "HDFE Kabra Panel",
    panelType: "MCC",
    location: "Main Plant",
  },
  {
    did: "E_BA_Z_B_T_P0005_D2",
    name: "Air Compressor",
    panelType: "MCC",
    location: "Utility Room",
  },
  {
    did: "E_BA_Z_B_R_P0002_D3",
    name: "Flat line",
    panelType: "MCC",
    location: "Flat Drip",
  },
];

interface MachineAnalyticsScreenProps {
  route?: {
    params?: {
      did?: string;
      panelName?: string;
    };
  };
}

export const MachineAnalyticsScreen: React.FC<MachineAnalyticsScreenProps> = ({
  route,
}) => {
  const initialDid = route?.params?.did || "E_BA_Z_B_T_P0006_D3";
  const [selectedDid, setSelectedDid] = useState<string>(initialDid);

  // Date and Time Window setup from Shared Filter Context
  const {
    selectedYear,
    selectedMonth,
    billingWindow,
    customRange,
    setCustomRange,
    handlePeriodChange,
    productionTimeEnabled,
    handleProductionTimeToggle,
    activeFromSec,
    activeToSec,
  } = useDateFilter();

  const navigation = useNavigation<any>();
  const { setFilters } = useAlerts();

  const handleNavigateToAlerts = (severity: "critical" | "warning") => {
    try {
      setFilters({
        panel: selectedDid,
        severity,
        status: "open",
      });
    } catch (e) {
      console.warn("setFilters error:", e);
    } 
    navigation.navigate("Dashboard", {
      tab: "Alerts",
      filterDeviceId: selectedDid,
      filterDeviceName: currentMachine.name,
      filterSeverity: severity,
      timestamp: Date.now(),
    });
  };

  // Loading & State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Machine Picker Modal
  const [machineModalVisible, setMachineModalVisible] = useState(false);
  const [machinesList, setMachinesList] = useState<MachineOption[]>(DEFAULT_MACHINES);

  // Collapsible Panel Info
  const [panelInfoExpanded, setPanelInfoExpanded] = useState(true);

  // Card Toggles
  const [energyCostMode, setEnergyCostMode] = useState<"cost" | "energy">("cost");
  const [mdMode, setMdMode] = useState<"analysis" | "utilization">("analysis");
  const [thdMode, setThdMode] = useState<"thdv" | "thdi">("thdv");
  const [phaseMode, setPhaseMode] = useState<"voltage" | "current">("voltage");

  // Data States
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [machineSummaryData, setMachineSummaryData] = useState<any>(null);
  const [energyCostData, setEnergyCostData] = useState<any>(null);
  const [perfData, setPerfData] = useState<any>(null);
  const [pfData, setPfData] = useState<any>(null);
  const [thdData, setThdData] = useState<any>(null);
  const [loadData, setLoadData] = useState<any>(null);
  const [currentData, setCurrentData] = useState<any>(null);
  const [timeLoadData, setTimeLoadData] = useState<any>(null);
  const [powerImbalanceData, setPowerImbalanceData] = useState<any>(null);
  const [todData, setTodData] = useState<any>(null);
  const [pqLossesData, setPqLossesData] = useState<any>(null);
  const [lfiData, setLfiData] = useState<any>(null);
  const [demandData, setDemandData] = useState<any>(null);
  const [alertCountsData, setAlertCountsData] = useState<any>(null);
  const [latestTelemetryData, setLatestTelemetryData] = useState<any>(null);

  // Fetch machine options for selector (Loads all MCC machines matching Web Dashboard)
  useEffect(() => {
    let alive = true;

    const loadMachines = async () => {
      try {
        const plantMachines = await fetchAllPlantMachines();
        if (!alive) return;

        let mergedList: MachineOption[] = Array.isArray(plantMachines) ? [...plantMachines] : [];

        try {
          const favRes = await fetchFavoriteOptions();
          if (alive && Array.isArray(favRes) && favRes.length > 0) {
            const mapped: MachineOption[] = favRes.map((m: any) => ({
              did: m.did || m.deviceId || m.id,
              name: m.label || m.machineName || m.panelName || m.did,
              panelType: m.panelType || "MCC",
              location: m.location || "Utility Area",
            }));
            const existingDids = new Set(mergedList.map((x) => x.did));
            mapped.forEach((m) => {
              if (m.did && !existingDids.has(m.did)) {
                mergedList.push(m);
                existingDids.add(m.did);
              }
            });
          }
        } catch {
          // ignore favorite options failure
        }

        if (mergedList.length > 0) {
          setMachinesList(mergedList);
          setSelectedDid((prev) => (mergedList.some((m) => m.did === prev) ? prev : mergedList[0].did));
        }
      } catch (err) {
        console.warn("[MachineAnalytics] Error loading plant machines:", err);
      }
    };

    loadMachines();

    return () => {
      alive = false;
    };
  }, []);


  const fallbackPrevRange = useMemo(() => {
    const prevFrom = shiftLocalMonth(new Date(activeFromSec * 1000), -1);
    const prevTo = shiftLocalMonth(new Date(activeToSec * 1000), -1);
    return {
      from: Math.floor(prevFrom.getTime() / 1000),
      to: Math.floor(prevTo.getTime() / 1000),
    };
  }, [activeFromSec, activeToSec]);
  const activePrevFromSec = customRange?.prevFromSec ?? fallbackPrevRange.from;
  const activePrevToSec = customRange?.prevToSec ?? fallbackPrevRange.to;

  const currentMachine = useMemo(() => {
    return (
      machinesList.find((m) => m.did === selectedDid) || {
        did: selectedDid,
        name: machineSummaryData?.name || deviceInfo?.machine_name || deviceInfo?.panel_name || "Machine",
        panelType: "MCC",
        location: deviceInfo?.location || "Utility Area",
        ratedLoadKw: null,
        ratedPf: null,
        benchmarkScore: null,
      }
    );
  }, [machinesList, selectedDid, deviceInfo, machineSummaryData]);

  const loadAllCards = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const summaryMode = (customRange && customRange.mode !== "today") ? "custom" : "today";

      const [
        devRes,
        summaryRes,
        ecRes,
        perfRes,
        pfRes,
        thdRes,
        loadRes,
        curRes,
        timeRes,
        powImbRes,
        todRes,
        pqRes,
        lfiRes,
        demandRes,
        alertRes,
        latestTelRes,
      ] = await Promise.allSettled([
        fetchDeviceById(selectedDid),
        fetchMachineSummary({
          did: selectedDid,
          mode: summaryMode,
          from: activeFromSec,
          to: activeToSec,
        }),
        fetchEnergyCostCard(selectedDid, activeFromSec, activeToSec),
        fetchPerformanceTelemetry(selectedDid, activeFromSec, activeToSec, activePrevFromSec, activePrevToSec),
        fetchPfAnalysisSummary({ did: selectedDid, type: "MCC", billingDay: 1, from: activeFromSec, to: activeToSec }),
        fetchThdAnalysisSummary({ did: selectedDid, from: activeFromSec, to: activeToSec, prevFrom: activePrevFromSec, prevTo: activePrevToSec }),
        fetchLoadAnalysis({ did: selectedDid, from: activeFromSec, to: activeToSec, prevFrom: activePrevFromSec, prevTo: activePrevToSec }),
        fetchCurrentTelemetry(selectedDid, activeFromSec, activeToSec),
        fetchTimeVsLoad({ did: selectedDid, from: activeFromSec, to: activeToSec }),
        fetchPowerImbalance({ did: selectedDid, from: activeFromSec, to: activeToSec }),
        fetchTodAnalysis({ deviceId: selectedDid, from: activeFromSec, to: activeToSec }),
        fetchPowerQualityLosses({ did: selectedDid, curr_from: activeFromSec, curr_to: activeToSec, prev_from: activePrevFromSec, prev_to: activePrevToSec }),
        fetchLfiKpi({ did: selectedDid, from: billingWindow.fromSec, to: billingWindow.toSec }),
        fetchDemandAnalysis({
          did: selectedDid,
          formType: "mcc",
          bill_month: MONTHS_FULL[selectedMonth],
          bill_year: selectedYear,
          billingCycleStartDay: 1,
          excessFactor: 1.5,
        }),
        alertApi.listAlerts({ device_id: selectedDid, start: String(activeFromSec), end: String(activeToSec) }),
        fetchLatestTelemetry(selectedDid),
      ]);

      if (devRes.status === "fulfilled") setDeviceInfo(devRes.value);
      if (summaryRes.status === "fulfilled") setMachineSummaryData(summaryRes.value);
      if (ecRes.status === "fulfilled") setEnergyCostData(ecRes.value);
      if (perfRes.status === "fulfilled") setPerfData(perfRes.value);
      if (pfRes.status === "fulfilled") setPfData(pfRes.value);
      if (thdRes.status === "fulfilled") setThdData(thdRes.value);
      if (loadRes.status === "fulfilled") setLoadData(loadRes.value);
      if (curRes.status === "fulfilled") setCurrentData(curRes.value);
      if (timeRes.status === "fulfilled") setTimeLoadData(timeRes.value);
      if (powImbRes.status === "fulfilled") setPowerImbalanceData(powImbRes.value);
      if (todRes.status === "fulfilled") setTodData(todRes.value);
      if (pqRes.status === "fulfilled") setPqLossesData(pqRes.value);
      if (lfiRes.status === "fulfilled") setLfiData(lfiRes.value);
      if (demandRes.status === "fulfilled") setDemandData(demandRes.value);
      if (alertRes.status === "fulfilled") setAlertCountsData(alertRes.value);
      if (latestTelRes.status === "fulfilled") setLatestTelemetryData(latestTelRes.value);
    } catch (err: any) {
      setError(err?.message || "Failed to load machine analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedDid, activeFromSec, activeToSec, activePrevFromSec, activePrevToSec, customRange]);

  useEffect(() => {
    loadAllCards();
  }, [loadAllCards]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAllPlantMachines(true)
      .then((m) => {
        if (Array.isArray(m) && m.length > 0) setMachinesList(m);
      })
      .catch(() => {});
    loadAllCards();
  }, [loadAllCards]);

  const fmt = (n: any, dec = 2, fallback = "—") => {
    const num = Number(n);
    if (!Number.isFinite(num)) return fallback;
    return num.toFixed(dec);
  };

  const fmtSmart = (n: any, dec = 2, fallback = "—") => {
    const num = Number(n);
    if (!Number.isFinite(num)) return fallback;
    if (Number.isInteger(num)) return num.toString();
    return num.toFixed(dec);
  };

  const fmtCurrency = (n: any, fallback = "₹ 0.00") => {
    const num = Number(n);
    if (!Number.isFinite(num)) return fallback;
    return (
      "₹ " +
      new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num)
    );
  };

  // 1. Panel Info metrics
  const machineName = machineSummaryData?.name || deviceInfo?.machine_name || deviceInfo?.panel_name || currentMachine.name || selectedDid;
  const machineLocation = deviceInfo?.panel_location || deviceInfo?.location || deviceInfo?.plant_location || currentMachine.location || "Utility Area";
  const upMins = toNum(machineSummaryData?.upMinutes);
  const isPanelOn = upMins !== null ? upMins > 0 : String(deviceInfo?.status || "").toUpperCase() === "ON";

  // Dynamic Telemetry timestamp & relative time matching Web Dashboard
  const formatAbsoluteTime = (ts: any) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "—";
    const s = d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    return s.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
  };

  const formatRelativeTime = (ts: any) => {
    if (!ts) return "";
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const isFuture = diffMs < 0;

    const absMin = Math.floor(Math.abs(diffMs) / (1000 * 60));
    if (absMin < 1) return isFuture ? "In moments" : "Just now";
    if (absMin < 60) return isFuture ? `In ${absMin} min${absMin === 1 ? "" : "s"}` : `${absMin} min${absMin === 1 ? "" : "s"} ago`;

    const absHr = Math.floor(absMin / 60);
    if (absHr < 24) return isFuture ? `In ${absHr} hr${absHr === 1 ? "" : "s"}` : `${absHr} hr${absHr === 1 ? "" : "s"} ago`;

    const absDay = Math.floor(absHr / 24);
    return isFuture ? `In ${absDay} day${absDay === 1 ? "" : "s"}` : `${absDay} day${absDay === 1 ? "" : "s"} ago`;
  };

  const latestTs =
    latestTelemetryData?.TS ||
    latestTelemetryData?.ts ||
    latestTelemetryData?.timestamp ||
    latestTelemetryData?.lastTelemetryTs ||
    machineSummaryData?.lastTelemetryTs ||
    deviceInfo?.last_telemetry_time ||
    deviceInfo?.lastTelemetryTs ||
    null;
  const absoluteTimeText = useMemo(() => formatAbsoluteTime(latestTs), [latestTs]);
  const relativeTimeText = useMemo(() => formatRelativeTime(latestTs), [latestTs]);

  // 2. Energy Cost values (merged with QuestDB source breakdown from details API)
  const ecCur = energyCostData?.current || energyCostData || {};
  const ecCost = toNum(ecCur.totalCost ?? ecCur.totalCostWithDemandToD ?? ecCur.total_cost);
  const ecEnergy = toNum(ecCur.totalEnergy ?? ecCur.total_energy);

  const sbCurrent = ecCur?.sourceBreakdown || energyCostData?.sourceBreakdown?.current || {};
  const ecSolarCost = toNum(sbCurrent?.solar?.cost ?? ecCur.solarCost ?? ecCur.solar_cost);
  const ecSolarUnits = toNum(sbCurrent?.solar?.energyUnits ?? ecCur.solarEnergy ?? ecCur.solar_energy);
  const ecDgCost = toNum(sbCurrent?.dg?.cost ?? ecCur.dgCost ?? ecCur.dg_cost);
  const ecDgUnits = toNum(sbCurrent?.dg?.energyUnits ?? ecCur.dgEnergy ?? ecCur.dg_energy);
  const ecGridCost = toNum(sbCurrent?.grid?.cost ?? ecCur.gridCost ?? ecCur.grid_cost);
  const ecGridUnits = toNum(sbCurrent?.grid?.energyUnits ?? ecCur.gridEnergy ?? ecCur.grid_energy);

  const ecSolarVal = energyCostMode === "cost" ? ecSolarCost : ecSolarUnits;
  const ecDgVal = energyCostMode === "cost" ? ecDgCost : ecDgUnits;
  const ecGridVal = energyCostMode === "cost" ? ecGridCost : ecGridUnits;

  // 3. Performance Index (RTPS Telemetry matching Web Dashboard)
  const curPerf = perfData?.current || perfData || {};
  const prevPerf = perfData?.previous || {};
  const curPerfRtps = toNum(curPerf.rtps ?? curPerf.RTPS);
  const perfScore =
    curPerfRtps !== null && curPerfRtps > 0
      ? curPerfRtps
      : toNum(machineSummaryData?.performanceScore ?? curPerfRtps);
  const perfPrev = toNum(prevPerf.rtps ?? prevPerf.RTPS);
  const perfDelta = perfScore != null && perfPrev != null ? perfScore - perfPrev : null;
  const isOptimal = perfScore != null ? perfScore >= 75 : null;
  const perfRating = isOptimal === null ? "—" : isOptimal ? "Optimal" : "Sub-optimal";

  // 4. PF Analysis (Matching Web Dashboard pf-analysis/summary)
  const pfSummary = pfData?.pf || pfData || {};
  const pfAvg = toNum(pfSummary.avg ?? pfData?.avg_pf ?? pfData?.avgPf ?? machineSummaryData?.avgPf);
  const pfMin = toNum(pfSummary.min ?? pfData?.min_pf ?? pfData?.minPf);
  const pfMax = toNum(pfSummary.max ?? pfData?.max_pf ?? pfData?.maxPf);
  const pfRated = toNum(pfSummary.rated ?? pfData?.rated_pf ?? pfData?.ratedPf ?? currentMachine.ratedPf ?? 0.87);

  const pfLoadBands = pfData?.load || {};
  const pfAvgLoadPct = toNum(pfLoadBands.avgLoadPct ?? pfData?.avgLoadPct);
  const pfIdlePct = toNum(pfLoadBands.bands?.idlePct ?? pfLoadBands.idlePct);
  const pfLoadPct = toNum(pfLoadBands.bands?.loadPct ?? pfLoadBands.loadPct);
  const pfOverPct = toNum(pfLoadBands.bands?.overPct ?? pfLoadBands.overPct);

  // 5. MD & Operating Load Analysis (Matching Web Dashboard Demand Analysis)
  const mdCur = demandData?.currentData || demandData?.current || demandData || {};
  const ratedLoadKw = toNum(currentMachine.ratedLoadKw ?? deviceInfo?.total_rated_power_kw ?? deviceInfo?.machine_power_value ?? machineSummaryData?.ratedLoadKw);
  const ratedPf = toNum(currentMachine.ratedPf ?? deviceInfo?.rated_pf ?? 0.87);
  const operatingLoadKva = (ratedLoadKw && ratedPf && ratedPf > 0) ? ratedLoadKw / ratedPf : ratedLoadKw;

  const rawActual = toNum(
    mdCur.actualMD ??
    mdCur.actual_md?.md_kva ??
    mdCur.actual_md_kva ??
    demandData?.exceedance?.actual_md?.md_kva ??
    demandData?.actual_md?.md_kva ??
    demandData?.actual_md ??
    loadData?.metrics?.actualMD ??
    loadData?.metrics?.actual_md
  );
  const rawRecorded = toNum(
    mdCur.recordedMD ??
    mdCur.recorded_md?.md_kva ??
    mdCur.recorded_md_kva ??
    demandData?.exceedance?.recorded_md?.md_kva ??
    demandData?.recorded_md?.md_kva ??
    demandData?.recorded_md ??
    loadData?.metrics?.recordedMD ??
    loadData?.metrics?.recorded_md
  );
  const contractDemand = toNum(
    demandData?.contractDemand ??
    demandData?.exceedance?.cd_kva ??
    demandData?.input?.cd_kva
  );

  const mdRecorded = rawRecorded ?? rawActual;
  const mdActual = rawActual ?? mdRecorded;

  const exceedanceKva = (mdRecorded !== null && operatingLoadKva !== null) ? Math.max(0, mdRecorded - operatingLoadKva) : null;
  const exceedancePct = (exceedanceKva !== null && operatingLoadKva && operatingLoadKva > 0) ? (exceedanceKva / operatingLoadKva) * 100 : null;
  const shareOnCdPct = (operatingLoadKva !== null && contractDemand && contractDemand > 0) ? (operatingLoadKva / contractDemand) * 100 : null;

  // 6. ToD Table (Matching Web Dashboard ToD analysis)
  const rawTod = Array.isArray(todData?.data) ? todData.data : (Array.isArray(todData) ? todData : []);
  const todRows = rawTod.length > 0 ? rawTod.map((z: any) => {
    const h = toNum(z?.hours ?? z?.opTime);
    const timeStr = h != null ? `${Math.floor(h)} h ${Math.round((h % 1) * 60).toString().padStart(2, "0")} min` : (z?.time || "0 h 00 min");
    const chg = toNum(z?.charges);
    return {
      tod: z?.zone || z?.zoneKey || z?.tod || "—",
      md: fmt(z?.md_kva ?? z?.md, 2, "0.00"),
      time: timeStr,
      charges: fmt(chg, 2, "0.00"),
      isGreen: chg != null && chg > 0,
    };
  }) : [
    { tod: "A", md: "0.00", time: "0 h 00 min", charges: "0.00", isGreen: false },
    { tod: "B", md: "0.00", time: "0 h 00 min", charges: "0.00", isGreen: false },
    { tod: "C", md: "0.00", time: "0 h 00 min", charges: "0.00", isGreen: false },
    { tod: "D", md: "0.00", time: "0 h 00 min", charges: "0.00", isGreen: false },
  ];

  // 7. THD Analysis (Matching Web Dashboard THD summary)
  const thdRaw = thdData?.data || thdData || {};
  const thdV = toNum(
    thdRaw?.thdV?.current ??
    thdRaw?.thd_v?.current ??
    thdRaw?.current?.thdV ??
    thdRaw?.current?.thd_v ??
    thdRaw?.thdV?.avg ??
    thdRaw?.thd_v?.avg ??
    thdRaw?.thdV ??
    thdRaw?.thd_v ??
    thdRaw?.THD_V
  );
  const thdVPrev = toNum(
    thdRaw?.thdV?.previous ??
    thdRaw?.thd_v?.previous ??
    thdRaw?.previous?.thdV ??
    thdRaw?.previous?.thd_v ??
    thdRaw?.prev?.thdV ??
    thdRaw?.prev?.thd_v
  );
  const thdI = toNum(
    thdRaw?.thdI?.current ??
    thdRaw?.thd_i?.current ??
    thdRaw?.current?.thdI ??
    thdRaw?.current?.thd_i ??
    thdRaw?.thdI?.avg ??
    thdRaw?.thd_i?.avg ??
    thdRaw?.thdI ??
    thdRaw?.thd_i ??
    thdRaw?.THD_I
  );
  const thdIPrev = toNum(
    thdRaw?.thdI?.previous ??
    thdRaw?.thd_i?.previous ??
    thdRaw?.previous?.thdI ??
    thdRaw?.previous?.thd_i ??
    thdRaw?.prev?.thdI ??
    thdRaw?.prev?.thd_i
  );
  const activeThdVal = thdMode === "thdv" ? thdV : thdI;
  const activeThdPrev = thdMode === "thdv" ? thdVPrev : thdIPrev;
  const activeThdDelta = (activeThdVal != null && activeThdPrev != null) ? activeThdVal - activeThdPrev : null;
  const activeThdDeltaPct = (activeThdDelta != null && activeThdPrev != null && activeThdPrev > 0) ? (activeThdDelta / activeThdPrev) * 100 : null;

  // 8. Phase Imbalances (Matching Web Dashboard Phase Imbalance)
  const volImb = toNum(curPerf.llVolImb ?? curPerf.LL_VOL_IMB);
  const volImbPrev = toNum(prevPerf.llVolImb ?? prevPerf.LL_VOL_IMB);
  const currImb = toNum(curPerf.iCurrImb ?? curPerf.I_CURR_IMB);
  const currImbPrev = toNum(prevPerf.iCurrImb ?? prevPerf.I_CURR_IMB);
  const activePhaseVal = phaseMode === "voltage" ? volImb : currImb;
  const activePhasePrev = phaseMode === "voltage" ? volImbPrev : currImbPrev;
  const activePhaseDelta = (activePhaseVal != null && activePhasePrev != null) ? activePhaseVal - activePhasePrev : null;

  // 9. Alert Logs (Live counts from Alert API)
  const alertTotals = alertCountsData?.totals || {};
  const pendingCritical = Number(alertTotals.pending_critical ?? 0);
  const pendingWarning = Number(alertTotals.pending_warning ?? 0);

  // 10. Avoidable Losses (Matching Web Dashboard Power Quality Losses)
  const pqCur = pqLossesData?.current ?? pqLossesData?.data?.current ?? pqLossesData ?? {};
  const pqPrev = pqLossesData?.previous ?? pqLossesData?.data?.previous ?? {};
  const lossCurrent = toNum(pqCur.total_loss ?? pqCur.totalLoss);
  const lossPrevious = toNum(pqPrev.total_loss ?? pqPrev.totalLoss);
  const lossDelta = (lossCurrent != null && lossPrevious != null) ? lossCurrent - lossPrevious : null;
  const lossDeltaPct = (lossCurrent != null && lossPrevious != null && lossPrevious > 0)
    ? ((lossCurrent - lossPrevious) / Math.abs(lossPrevious)) * 100
    : (lossCurrent != null && lossCurrent > 0 ? 100 : null);

  // 11. Machine Load Factor (LFI KPI matching Web Dashboard)
  const lfiCur = lfiData?.data || lfiData || {};
  const loadFactorPct = toNum(
    lfiCur.lf_percent ??
    lfiCur.lf_rated_percent ??
    lfiCur.load_factor ??
    lfiCur.loadFactor ??
    lfiCur.summary?.load_factor_pct
  );
  const lfiTarget = toNum(lfiCur.target_lf_percent ?? lfiCur.target_load_factor ?? lfiCur.target ?? 75) || 75;
  const isLfiEligible = typeof lfiCur.is_eligible === "boolean"
    ? lfiCur.is_eligible
    : (loadFactorPct != null && loadFactorPct >= lfiTarget);
  const totalH = toNum(lfiCur.total_hours ?? lfiCur.configured_operating_hours ?? lfiCur.totalHours);
  const runH = toNum(lfiCur.running_hours ?? lfiCur.run_hours ?? lfiCur.runHours);
  const remH = toNum(lfiCur.remaining_hours ?? lfiCur.available_hours) ?? (totalH != null && runH != null ? Math.max(0, totalH - runH) : null);
  const availHoursText = remH != null && totalH != null
    ? `${Math.round(remH)} hrs / ${Math.round(totalH)} hrs`
    : (remH != null ? `${Math.round(remH)} hrs` : (lfiCur.available_hours_fraction || (lfiCur.available_hours ? `${fmt(lfiCur.available_hours, 0)} hrs` : (timeLoadData?.available_hours || "—"))));
  const diffBelowTarget = loadFactorPct != null && loadFactorPct < lfiTarget ? lfiTarget - loadFactorPct : null;

  // 12. Time vs Load runtimes (Matching Web Dashboard Time vs Load)
  const timeCur = timeLoadData?.summary || timeLoadData?.data?.summary || timeLoadData || {};
  const timeBands = Array.isArray(timeLoadData?.bands) ? timeLoadData.bands : (Array.isArray(timeLoadData?.data?.bands) ? timeLoadData.data.bands : []);
  const pickBandHM = (label: string) => {
    const row = timeBands.find((b: any) => String(b?.id || b?.name || b?.label || "").toLowerCase().replace(/[^a-z0-9]/g, "").includes(label.toLowerCase().replace(/[^a-z0-9]/g, "")));
    if (!row) return null;
    const dh = Number(row?.hours);
    if (Number.isFinite(dh)) return fmtHoursHM(dh);
    const rm = Number(row?.runtimeMinutes ?? row?.runtime_minutes);
    return Number.isFinite(rm) ? fmtHoursHM(rm / 60) : null;
  };
  const offH = pickBandHM("poweroff") || (machineSummaryData?.downMinutes != null ? fmtHoursHM(machineSummaryData.downMinutes / 60) : "0 h 00 min");
  const idleH = pickBandHM("idle") || (machineSummaryData?.idleMinutes != null ? fmtHoursHM(machineSummaryData.idleMinutes / 60) : "0 h 00 min");
  const fullH = pickBandHM("full") || (machineSummaryData?.upMinutes != null ? fmtHoursHM(machineSummaryData.upMinutes / 60) : "0 h 00 min");
  const overH = pickBandHM("overload") || (machineSummaryData?.overloadMinutes != null ? fmtHoursHM(machineSummaryData.overloadMinutes / 60) : "0 h 00 min");
  const runTimeHrs = toNum(timeCur.current_run_time ?? (machineSummaryData?.upMinutes != null ? machineSummaryData.upMinutes / 60 : null));
  const availTimeHrs = toNum(timeCur.current_available_time ?? (machineSummaryData?.availableMinutes != null ? machineSummaryData.availableMinutes / 60 : null));
  const runTimeText = runTimeHrs != null ? fmtHoursHM(runTimeHrs) : "—";
  const availTimeText = availTimeHrs != null ? fmtHoursHM(availTimeHrs) : "—";

  // 13. Power Imbalance (Matching Web Dashboard Power Imbalance card)
  const powCur = powerImbalanceData?.data ?? powerImbalanceData ?? {};
  const powerImbVal = toNum(powCur.loadImbalance ?? powCur.imbalance?.current ?? powCur.kwImbalancePct?.current ?? powCur.power_imbalance);
  const maxPowerImb = toNum(powCur.maxImbalance ?? powCur.imbalance?.max ?? powCur.kwImbalancePct?.max);
  const worstParam = powCur.worstParameter || (powerImbVal != null ? "kVA Imbalance" : "—");
  const worstPhase = powCur.worstPhase || "—";
  const timeAboveLimit = powCur.timeAboveLimit || (powCur.time_above_limit ? `${powCur.time_above_limit}` : "0 min");
  const powerImbStatus = powCur.status || powCur.imbalance?.status || (powerImbVal != null ? (powerImbVal > 10 ? "Critical" : powerImbVal > 5 ? "Warning" : "Acceptable") : "Acceptable");
  const powerImbStatusLabel = String(powerImbStatus).charAt(0).toUpperCase() + String(powerImbStatus).slice(1);

  // 14. Load Analysis (Matching Web Dashboard Load Analysis card)
  const loadMetrics = loadData?.metrics || loadData?.data?.metrics || loadData?.data || loadData || {};
  const currentLoadVal = toNum(loadMetrics.currentLoadPct ?? loadMetrics.current_load ?? loadFactorPct);
  const peakLoadVal = toNum(loadMetrics.peakLoadPct ?? loadMetrics.peak_load);
  const selectedPeriodAvg = toNum(loadMetrics.selectedAvgLoadPct ?? loadMetrics.selected_avg_load);
  const previousPeriodAvg = toNum(loadMetrics.previousAvgLoadPct ?? loadMetrics.prevAvgLoadPct ?? loadMetrics.prev_avg_load ?? loadMetrics.previous_avg_load);
  const loadDelta = toNum(loadMetrics.deltaLoadPct ?? loadMetrics.delta_load ?? (selectedPeriodAvg != null && previousPeriodAvg != null ? selectedPeriodAvg - previousPeriodAvg : null));
  const loadCardStatus = String(loadMetrics.status || (currentLoadVal != null ? (currentLoadVal > 100 ? "Critical" : currentLoadVal > 80 ? "Warning" : "Acceptable") : "Acceptable"));
  const loadCardStatusLabel = loadCardStatus.charAt(0).toUpperCase() + loadCardStatus.slice(1);

  // 15. Current Analysis (Dynamic telemetry rows matching Web Dashboard)
  const currentRows = Array.isArray(currentData)
    ? currentData
    : (Array.isArray(currentData?.data) ? currentData.data : (Array.isArray(currentData?.rows) ? currentData.rows : []));
  let sumCurrentAvg = 0;
  let countCurrentAvg = 0;
  let peakCurrent: number | null = null;
  let peakPhase = "—";

  currentRows.forEach((row: any) => {
    const ir = toNum(row?.IR ?? row?.Ir ?? row?.ir ?? row?.avg_IR ?? row?.AVG_IR ?? row?.avg_ir);
    const iy = toNum(row?.IY ?? row?.Iy ?? row?.iy ?? row?.avg_IY ?? row?.AVG_IY ?? row?.avg_iy);
    const ib = toNum(row?.IB ?? row?.Ib ?? row?.ib ?? row?.avg_IB ?? row?.AVG_IB ?? row?.avg_ib);
    const rowAvg = toNum(row?.AVG_I ?? row?.avg_i ?? row?.IAVG ?? row?.I_AVG ?? row?.avg_AVG_I ?? row?.average_current);

    const phaseVals = [ir, iy, ib].filter((v): v is number => v !== null);
    const effectiveAvg = rowAvg !== null ? rowAvg : (phaseVals.length > 0 ? phaseVals.reduce((a, b) => a + b, 0) / phaseVals.length : null);

    if (effectiveAvg !== null) {
      sumCurrentAvg += effectiveAvg;
      countCurrentAvg += 1;
    }

    if (ir !== null && (peakCurrent === null || ir > peakCurrent)) {
      peakCurrent = ir;
      peakPhase = "R Phase";
    }
    if (iy !== null && (peakCurrent === null || iy > peakCurrent)) {
      peakCurrent = iy;
      peakPhase = "Y Phase";
    }
    if (ib !== null && (peakCurrent === null || ib > peakCurrent)) {
      peakCurrent = ib;
      peakPhase = "B Phase";
    }
  });

  const avgCurrentVal = countCurrentAvg > 0 ? sumCurrentAvg / countCurrentAvg : toNum(currentData?.current?.average_current ?? machineSummaryData?.avgCurrent);
  const ratedCurrentVal = toNum(deviceInfo?.rated_current || deviceInfo?.rated_panel_current || deviceInfo?.benchmark_current_value);
  const currentUtilPct = avgCurrentVal != null && ratedCurrentVal != null && ratedCurrentVal > 0 ? (avgCurrentVal / ratedCurrentVal) * 100 : null;
  const prevAvgCurrent = toNum(currentData?.previous?.average_current ?? currentData?.prev_average_current);
  const currentDelta = avgCurrentVal != null && prevAvgCurrent != null ? avgCurrentVal - prevAvgCurrent : null;
  const currentCardStatus = currentUtilPct != null ? (currentUtilPct > 100 ? "Critical" : currentUtilPct > 80 ? "Warning" : "Acceptable") : "Acceptable";

  return (
    <View style={styles.container}>
      <AppHeader title="Machine Analytics" />

      {/* Date Range Selector */}
      <DateRangeSelector
        billingWindow={billingWindow}
        onPeriodChange={handlePeriodChange}
        onCustomRangeChange={setCustomRange}
        customRange={customRange}
        isProductionTime={productionTimeEnabled}
        onProductionTimeToggle={handleProductionTimeToggle}
      />

      {/* Machine Selector Bar */}
      <View style={styles.machineBar}>
        <Text style={styles.machineBarLabel}>Machines</Text>
        <TouchableOpacity
          style={styles.machineDropdown}
          activeOpacity={0.8}
          onPress={() => setMachineModalVisible(true)}
        >
          <Text style={styles.machineDropdownText} numberOfLines={1}>
            {currentMachine.name}
          </Text>
          <ChevronDown size={18} color="#64748B" />
        </TouchableOpacity>
      </View>

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
        {loading && !refreshing ? (
          <View style={{ padding: 14 }}>
            <CardSkeleton height={140} />
            <CardSkeleton height={140} />
            <CardSkeleton height={140} />
          </View>
        ) : error && !deviceInfo ? (
          <ErrorCard title="Error" message={error} onRetry={loadAllCards} />
        ) : (
          <>
            {/* 1. Panel Information (Collapsible) */}
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.cardHeaderToggle}
                activeOpacity={0.8}
                onPress={() => setPanelInfoExpanded(!panelInfoExpanded)}
              >
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                    <Cpu size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>Panel Information</Text>
                </View>
                {panelInfoExpanded ? (
                  <ChevronUp size={18} color="#64748B" />
                ) : (
                  <ChevronDown size={18} color="#64748B" />
                )}
              </TouchableOpacity>

              {panelInfoExpanded && (
                <View style={styles.panelInfoBody}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>NAME:</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {machineName}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>LOCATION:</Text>
                    <Text style={styles.infoValue}>{machineLocation}</Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>ALARM:</Text>
                    <View style={styles.pillsRow}>
                      <View style={[styles.badgePill, { backgroundColor: "#FEF2F2" }]}>
                        <Text style={[styles.badgePillText, { color: "#EF4444" }]}>
                          🚨 0 CRIT
                        </Text>
                      </View>
                      <View style={[styles.badgePill, { backgroundColor: "#FFFBEB" }]}>
                        <Text style={[styles.badgePillText, { color: "#D97706" }]}>
                          ⚠️ 0 WARN
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>PANEL:</Text>
                    <View style={styles.pillsRow}>
                      <View style={[styles.badgePill, { backgroundColor: isPanelOn ? "#ECFDF5" : "#FEF2F2" }]}>
                        <Text style={[styles.badgePillText, { color: isPanelOn ? "#059669" : "#EF4444" }]}>
                          ● {isPanelOn ? "ON" : "OFF"}
                        </Text>
                      </View>
                      <View style={[styles.badgePill, { backgroundColor: isPanelOn ? "#ECFDF5" : "#F1F5F9" }]}>
                        <Text style={[styles.badgePillText, { color: isPanelOn ? "#059669" : "#64748B" }]}>
                          ● {isPanelOn ? "Online" : "Offline"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>UPDATED:</Text>
                    <Text style={styles.infoSubtext}>
                      {absoluteTimeText !== "—" ? `${absoluteTimeText}${relativeTimeText ? ` (${relativeTimeText})` : ""}` : "Live Telemetry (Updated)"}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* 2. Energy Cost Analysis Card */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                   <IndianRupee size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>Energy Cost Analysis</Text>
                </View>
                <View style={styles.togglePillGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, energyCostMode === "cost" && styles.toggleBtnActive]}
                    onPress={() => setEnergyCostMode("cost")}
                  >
                    <Text style={[styles.toggleBtnText, energyCostMode === "cost" && styles.toggleBtnTextActive]}>
                      Cost
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, energyCostMode === "energy" && styles.toggleBtnActive]}
                    onPress={() => setEnergyCostMode("energy")}
                  >
                    <Text style={[styles.toggleBtnText, energyCostMode === "energy" && styles.toggleBtnTextActive]}>
                      Energy
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.heroMetricRow}>
                <Text style={styles.heroAmount}>
                  {energyCostMode === "cost" ? fmtCurrency(ecCost) : (ecEnergy != null ? `${fmt(ecEnergy, 1)} kWh` : "—")}
                </Text>
                <Text style={styles.deltaPositive}>
                  {energyCostMode === "cost"
                    ? (ecCost != null ? `▲ +${fmtCurrency(ecCost)}` : "—")
                    : (ecEnergy != null ? `▲ +${fmt(ecEnergy, 1)} kWh` : "—")}
                </Text>
              </View>

              <View style={styles.threeColRow}>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Solar</Text>
                  <Text style={styles.subVal}>
                    {energyCostMode === "cost" ? fmtCurrency(ecSolarVal) : (ecSolarVal != null ? `${fmt(ecSolarVal, 1)} kWh` : "—")}
                  </Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Grid</Text>
                  <Text style={styles.subVal}>
                    {energyCostMode === "cost" ? fmtCurrency(ecGridVal) : (ecGridVal != null ? `${fmt(ecGridVal, 1)} kWh` : "—")}
                  </Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>DG</Text>
                  <Text style={styles.subVal}>
                    {energyCostMode === "cost" ? fmtCurrency(ecDgVal) : (ecDgVal != null ? `${fmt(ecDgVal, 1)} kWh` : "—")}
                  </Text>
                </View>
              </View>
            </View>

            {/* 3. Performance Index */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F5F3FF" }]}>
                    <Gauge size={16} color="#7C3AED" />
                  </View>
                  <Text style={styles.cardTitle}>Performance Index</Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Today</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {perfScore != null ? `${fmt(perfScore, 2)} %` : "—"}
              </Text>

              <View style={styles.threeColRow}>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Previous</Text>
                  <Text style={styles.subVal}>{perfPrev != null ? `${fmt(perfPrev, 2)} %` : "—"}</Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: perfDelta != null && perfDelta >= 0 ? "#16A34A" : "#EF4444" }]}>
                    {perfDelta != null ? (perfDelta >= 0 ? `▲ +${fmt(perfDelta, 2)} %` : `▼ ${fmt(perfDelta, 2)} %`) : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 4. PF Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                    <TrendingUp size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>PF Analysis</Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>PF</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {fmt(pfAvg, 3)}
              </Text>

              <View style={styles.threeColRow}>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Min</Text>
                  <Text style={styles.subVal}>{fmt(pfMin, 3)}</Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Max</Text>
                  <Text style={styles.subVal}>{fmt(pfMax, 3)}</Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Rated</Text>
                  <Text style={styles.subVal}>{fmt(pfRated, 3)}</Text>
                </View>
              </View>
            </View>

            {/* 5. MD Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F0FDF4" }]}>
                    <Activity size={16} color="#16A34A" />
                  </View>
                  <Text style={styles.cardTitle}>MD Analysis</Text>
                </View>
                <View style={styles.togglePillGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, mdMode === "analysis" && styles.toggleBtnActive]}
                    onPress={() => setMdMode("analysis")}
                  >
                    <Text style={[styles.toggleBtnText, mdMode === "analysis" && styles.toggleBtnTextActive]}>
                      Analysis
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, mdMode === "utilization" && styles.toggleBtnActive]}
                    onPress={() => setMdMode("utilization")}
                  >
                    <Text style={[styles.toggleBtnText, mdMode === "utilization" && styles.toggleBtnTextActive]}>
                      Utilization
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>
                {mdMode === "analysis" ? "Actual MD" : "Exceedance"}
              </Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {mdMode === "analysis"
                  ? (mdActual != null ? `${fmtSmart(mdActual, 2)} kVA` : "—")
                  : (exceedanceKva != null ? `${fmtSmart(exceedanceKva, 2)} kVA` : "0.0 kVA")}
              </Text>

              <View style={styles.twoColRow}>
                {mdMode === "analysis" ? (
                  <>
                    <View style={styles.twoCol}>
                      <Text style={styles.subLabel}>Recorded MD (All Time)</Text>
                      <Text style={styles.subVal}>{mdRecorded != null ? `${fmtSmart(mdRecorded, 2)} kVA` : "—"}</Text>
                    </View>
                    <View style={styles.twoCol}>
                      <Text style={styles.subLabel}>Operating Load ⓘ</Text>
                      <Text style={styles.subVal}>{operatingLoadKva != null ? `${fmt(operatingLoadKva, 2)} kVA` : "—"}</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.twoCol}>
                      <Text style={styles.subLabel}>Exceedance %</Text>
                      <Text style={styles.subVal}>{exceedancePct != null ? `${fmt(exceedancePct, 1)} %` : "0.0 %"}</Text>
                    </View>
                    <View style={styles.twoCol}>
                      <Text style={styles.subLabel}>Share on CD</Text>
                      <Text style={styles.subVal}>{shareOnCdPct != null ? `${fmt(shareOnCdPct, 1)} %` : "—"}</Text>
                    </View>
                  </>
                )}
              </View>
            </View>

            {/* 6. ToD Analysis Table */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                    <Clock size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>ToD Analysis</Text>
                </View>
              </View>

              <View style={styles.todTable}>
                <View style={styles.todHeaderRow}>
                  <Text style={[styles.todHeaderCell, { flex: 0.8 }]}>ToD</Text>
                  <Text style={[styles.todHeaderCell, { flex: 1.2 }]}>MD(kVA)</Text>
                  <Text style={[styles.todHeaderCell, { flex: 1.6 }]}>Time(Hrs)</Text>
                  <Text style={[styles.todHeaderCell, { flex: 1.4, textAlign: "right" }]}>Charges (₹)</Text>
                </View>
                {todRows.map((r, i) => (
                  <View key={i} style={styles.todBodyRow}>
                    <Text style={[styles.todBodyCell, { flex: 0.8, fontWeight: "800" }]}>{r.tod}</Text>
                    <Text style={[styles.todBodyCell, { flex: 1.2 }]}>{r.md}</Text>
                    <Text style={[styles.todBodyCell, { flex: 1.6 }]}>{r.time}</Text>
                    <Text style={[styles.todBodyCell, { flex: 1.4, textAlign: "right", color: r.isGreen ? "#059669" : "#1E293B", fontWeight: "700" }]}>
                      ₹ {r.charges}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 7. THD Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FFFBEB" }]}>
                    <Percent size={16} color="#D97706" />
                  </View>
                  <Text style={styles.cardTitle}>THD Analysis</Text>
                </View>
                <View style={styles.togglePillGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, thdMode === "thdv" && styles.toggleBtnActive]}
                    onPress={() => setThdMode("thdv")}
                  >
                    <Text style={[styles.toggleBtnText, thdMode === "thdv" && styles.toggleBtnTextActive]}>
                      THD-V
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, thdMode === "thdi" && styles.toggleBtnActive]}
                    onPress={() => setThdMode("thdi")}
                  >
                    <Text style={[styles.toggleBtnText, thdMode === "thdi" && styles.toggleBtnTextActive]}>
                      THD-I
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Today</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {fmt(activeThdVal, 3)} %
              </Text>

              <View style={styles.threeColRow}>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Previous</Text>
                  <Text style={styles.subVal}>{activeThdPrev != null ? `${fmt(activeThdPrev, 3)} %` : "—"}</Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: activeThdDelta != null && activeThdDelta > 0 ? "#EF4444" : "#16A34A" }]}>
                    {activeThdDelta != null ? (activeThdDelta >= 0 ? `▲ ${fmt(activeThdDelta, 3)}` : `▼ ${fmt(Math.abs(activeThdDelta), 3)}`) : "—"}
                  </Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Delta %</Text>
                  <Text style={[styles.subVal, { color: activeThdDeltaPct != null && activeThdDeltaPct > 0 ? "#EF4444" : "#16A34A" }]}>
                    {activeThdDeltaPct != null ? (activeThdDeltaPct >= 0 ? `▲ ${fmt(activeThdDeltaPct, 1)}%` : `▼ ${fmt(Math.abs(activeThdDeltaPct), 1)}%`) : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 8. Phase Imbalances */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F1F5F9" }]}>
                    <Sliders size={16} color="#475569" />
                  </View>
                  <Text style={styles.cardTitle}>Phase Imbalances</Text>
                </View>
                <View style={styles.togglePillGroup}>
                  <TouchableOpacity
                    style={[styles.toggleBtn, phaseMode === "voltage" && styles.toggleBtnActive]}
                    onPress={() => setPhaseMode("voltage")}
                  >
                    <Text style={[styles.toggleBtnText, phaseMode === "voltage" && styles.toggleBtnTextActive]}>
                      Voltage
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleBtn, phaseMode === "current" && styles.toggleBtnActive]}
                    onPress={() => setPhaseMode("current")}
                  >
                    <Text style={[styles.toggleBtnText, phaseMode === "current" && styles.toggleBtnTextActive]}>
                      Current
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Today</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {fmt(activePhaseVal, 2)} %
              </Text>

              <View style={styles.twoColRow}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Previous</Text>
                  <Text style={styles.subVal}>{activePhasePrev != null ? `${fmt(activePhasePrev, 2)} %` : "—"}</Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: activePhaseDelta != null && activePhaseDelta > 0 ? "#EF4444" : "#16A34A" }]}>
                    {activePhaseDelta != null ? (activePhaseDelta >= 0 ? `▲ ${fmt(activePhaseDelta, 2)}` : `▼ ${fmt(Math.abs(activePhaseDelta), 2)}`) : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 9. Alert Logs */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEF2F2" }]}>
                    <AlertTriangle size={16} color="#EF4444" />
                  </View>
                  <Text style={styles.cardTitle}>Alert Logs</Text>
                </View>
              </View>

              <View style={styles.twoColRow}>
                <TouchableOpacity
                  style={styles.twoColCenter}
                  activeOpacity={0.7}
                  onPress={() => handleNavigateToAlerts("critical")}
                >
                  <Text style={styles.subLabel}>Pending Critical</Text>
                  <Text style={[styles.heroAmount, { color: pendingCritical > 0 ? "#EF4444" : "#0F172A" }]}>
                    {pendingCritical}
                  </Text>
                </TouchableOpacity>
                <View style={styles.vertDivider} />
                <TouchableOpacity
                  style={styles.twoColCenter}
                  activeOpacity={0.7}
                  onPress={() => handleNavigateToAlerts("warning")}
                >
                  <Text style={styles.subLabel}>Pending Warning</Text>
                  <Text style={[styles.heroAmount, { color: pendingWarning > 0 ? "#D97706" : "#0F172A" }]}>
                    {pendingWarning}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 10. Avoidable Losses */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                    <AlertTriangle size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>Avoidable Losses</Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Losses</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {fmtCurrency(lossCurrent)}
              </Text>

              <View style={styles.threeColRow}>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Previous</Text>
                  <Text style={styles.subVal}>{fmtCurrency(lossPrevious)}</Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: lossDelta != null && lossDelta > 0 ? "#EF4444" : "#16A34A" }]}>
                    {lossDelta != null ? (lossDelta >= 0 ? `▲ ${fmtCurrency(lossDelta)}` : `▼ ${fmtCurrency(Math.abs(lossDelta))}`) : "—"}
                  </Text>
                </View>
                <View style={styles.threeCol}>
                  <Text style={styles.subLabel}>Delta %</Text>
                  <Text style={[styles.subVal, { color: lossDeltaPct != null && lossDeltaPct > 0 ? "#EF4444" : "#16A34A" }]}>
                    {lossDeltaPct != null ? (lossDeltaPct >= 0 ? `▲ ${fmt(lossDeltaPct, 2)}%` : `▼ ${fmt(Math.abs(lossDeltaPct), 2)}%`) : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 11. Machine Load Factor */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#EFF6FF" }]}>
                    <BarChart2 size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle}>Machine Load Factor</Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Load Factor ⓘ</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {loadFactorPct != null ? `${fmt(loadFactorPct, 2)} %` : "—"}
              </Text>

              {/* Target Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, loadFactorPct || 0))}%` }]} />
                  <View style={[styles.targetIndicator, { left: `${lfiTarget}%` }]} />
                </View>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressMin}>0%</Text>
                  <Text style={styles.progressTarget}>{lfiTarget}% (Target)</Text>
                  <Text style={styles.progressMax}>100%</Text>
                </View>
              </View>

              {loadFactorPct != null && (
                <Text style={styles.belowTargetText}>
                  {loadFactorPct >= lfiTarget ? "✅ Target achieved" : `⚠️ ${fmt(diffBelowTarget, 2)} % below target`}
                </Text>
              )}

              <View style={styles.twoColRow}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Available Hours ⓘ</Text>
                  <Text style={styles.subVal}>{availHoursText}</Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Status</Text>
                  <Text style={[styles.subVal, { color: isLfiEligible ? "#059669" : "#EF4444" }]}>
                    ● {loadFactorPct != null ? (isLfiEligible ? "Eligible" : "Ineligible") : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 12. Time vs Load Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F0FDF4" }]}>
                    <Activity size={16} color="#16A34A" />
                  </View>
                  <Text style={styles.cardTitle}>Time vs Load Analysis</Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Production Runtime ⓘ</Text>
              <Text style={[styles.heroAmount, { color: "#0F172A" }]}>
                {runTimeText} {availTimeText !== "—" ? `/ ${availTimeText}` : ""}
              </Text>

              <View style={styles.fourColRow}>
                <View style={styles.fourCol}>
                  <Text style={styles.subLabel}>Power Off</Text>
                  <Text style={styles.subVal}>{offH}</Text>
                </View>
                <View style={styles.fourCol}>
                  <Text style={styles.subLabel}>Idle</Text>
                  <Text style={styles.subVal}>{idleH}</Text>
                </View>
                <View style={styles.fourCol}>
                  <Text style={styles.subLabel}>Full</Text>
                  <Text style={styles.subVal}>{fullH}</Text>
                </View>
                <View style={styles.fourCol}>
                  <Text style={styles.subLabel}>Overload</Text>
                  <Text style={styles.subVal}>{overH}</Text>
                </View>
              </View>
            </View>

            {/* 13. Power Imbalance */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEF2F2" }]}>
                    <Scale size={16} color="#DC2626" />
                  </View>
                  <Text style={styles.cardTitle}>Power Imbalance</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: powerImbStatus === "critical" ? "#FEF2F2" : powerImbStatus === "warning" ? "#FFFBEB" : "#F0FDF4" }]}>
                  <Text style={[styles.statusBadgeText, { color: powerImbStatus === "critical" ? "#DC2626" : powerImbStatus === "warning" ? "#D97706" : "#16A34A" }]}>
                    {powerImbStatusLabel}
                  </Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Power Imbalance</Text>
              <Text style={[styles.heroAmount, { color: powerImbStatus === "critical" ? "#DC2626" : powerImbStatus === "warning" ? "#D97706" : "#16A34A" }]}>
                {powerImbVal != null ? `${fmt(powerImbVal, 1)} %` : "—"}
              </Text>

              <View style={styles.twoColRow}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Max. Imbalance (This Period)</Text>
                  <Text style={[styles.subVal, { color: maxPowerImb != null && maxPowerImb > 10 ? "#DC2626" : "#1E293B" }]}>
                    {maxPowerImb != null ? `${fmt(maxPowerImb, 1)} %` : "—"}
                  </Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Worst Parameter</Text>
                  <Text style={styles.subVal}>{worstParam}</Text>
                </View>
              </View>

              <View style={[styles.twoColRow, { marginTop: 10 }]}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Worst Phase</Text>
                  <Text style={styles.subVal}>{worstPhase}</Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Time Above Limit</Text>
                  <Text style={[styles.subVal, { color: timeAboveLimit && timeAboveLimit !== "0 min" && timeAboveLimit !== "—" ? "#DC2626" : "#1E293B" }]}>
                    {timeAboveLimit}
                  </Text>
                </View>
              </View>
            </View>

            {/* 14. Load Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEF2F2" }]}>
                    <TrendingUp size={16} color="#DC2626" />
                  </View>
                  <Text style={styles.cardTitle}>Load Analysis</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: loadCardStatus === "Critical" ? "#FEF2F2" : loadCardStatus === "Warning" ? "#FFFBEB" : "#F0FDF4" }]}>
                  <Text style={[styles.statusBadgeText, { color: loadCardStatus === "Critical" ? "#DC2626" : loadCardStatus === "Warning" ? "#D97706" : "#16A34A" }]}>
                    {loadCardStatusLabel}
                  </Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Current Load</Text>
              <Text style={[styles.heroAmount, { color: loadCardStatus === "Critical" ? "#DC2626" : loadCardStatus === "Warning" ? "#D97706" : "#16A34A" }]}>
                {currentLoadVal != null ? `${fmt(currentLoadVal, 1)} %` : "—"}
              </Text>

              <View style={styles.twoColRow}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Peak Load (Current Period)</Text>
                  <Text style={[styles.subVal, { color: peakLoadVal != null && peakLoadVal > 100 ? "#DC2626" : "#1E293B" }]}>
                    {peakLoadVal != null ? `${fmt(peakLoadVal, 1)} %` : "—"}
                  </Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Selected Period Avg</Text>
                  <Text style={styles.subVal}>{selectedPeriodAvg != null ? `${fmt(selectedPeriodAvg, 1)} %` : "—"}</Text>
                </View>
              </View>

              <View style={[styles.twoColRow, { marginTop: 10 }]}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Previous Period Avg</Text>
                  <Text style={styles.subVal}>{previousPeriodAvg != null ? `${fmt(previousPeriodAvg, 1)} %` : "—"}</Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: loadDelta != null && loadDelta > 0 ? "#DC2626" : loadDelta != null && loadDelta < 0 ? "#16A34A" : "#1E293B" }]}>
                    {loadDelta != null ? (loadDelta >= 0 ? `▲ +${fmt(loadDelta, 1)} %` : `▼ ${fmt(loadDelta, 1)} %`) : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* 15. Current Analysis */}
            <View style={styles.card}>
              <View style={styles.cardHeaderWithControls}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F0FDF4" }]}>
                    <Zap size={16} color="#16A34A" />
                  </View>
                  <Text style={styles.cardTitle}>Current Analysis</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: currentCardStatus === "Critical" ? "#FEF2F2" : currentCardStatus === "Warning" ? "#FFFBEB" : "#F0FDF4" }]}>
                  <Text style={[styles.statusBadgeText, { color: currentCardStatus === "Critical" ? "#DC2626" : currentCardStatus === "Warning" ? "#D97706" : "#16A34A" }]}>
                    {currentCardStatus}
                  </Text>
                </View>
              </View>

              <Text style={styles.periodSubtitle}>Average Current</Text>
              <Text style={[styles.heroAmount, { color: currentCardStatus === "Critical" ? "#DC2626" : currentCardStatus === "Warning" ? "#D97706" : "#16A34A" }]}>
                {avgCurrentVal != null ? `${fmt(avgCurrentVal, 1)} A` : "—"}
              </Text>

              <View style={styles.twoColRow}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Peak Current (This Period)</Text>
                  <Text style={[styles.subVal, { color: peakCurrent != null && ratedCurrentVal != null && peakCurrent > ratedCurrentVal ? "#DC2626" : "#1E293B" }]}>
                    {peakCurrent != null && peakCurrent > 0 ? `${fmt(peakCurrent, 1)} A` : "—"}
                  </Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Peak Phase</Text>
                  <Text style={styles.subVal}>{peakPhase}</Text>
                </View>
              </View>

              <View style={[styles.twoColRow, { marginTop: 10 }]}>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Current Utilization</Text>
                  <Text style={[styles.subVal, { color: currentUtilPct != null && currentUtilPct > 100 ? "#DC2626" : currentUtilPct != null && currentUtilPct > 80 ? "#D97706" : "#16A34A" }]}>
                    {currentUtilPct != null ? `${fmt(currentUtilPct, 1)} %` : "—"}
                  </Text>
                </View>
                <View style={styles.twoCol}>
                  <Text style={styles.subLabel}>Delta</Text>
                  <Text style={[styles.subVal, { color: currentDelta != null && currentDelta > 0 ? "#DC2626" : currentDelta != null && currentDelta < 0 ? "#16A34A" : "#1E293B" }]}>
                    {currentDelta != null ? (currentDelta >= 0 ? `▲ +${fmt(currentDelta, 1)} A` : `▼ ${fmt(currentDelta, 1)} A`) : "—"}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Persistent Bottom Bar */}
      <AppFooter activeTab="none" />

      {/* Machine Picker Modal */}
      <Modal
        visible={machineModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMachineModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMachineModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Machine</Text>
              <TouchableOpacity onPress={() => setMachineModalVisible(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={machinesList}
              keyExtractor={(item) => item.did}
              renderItem={({ item }) => {
                const isSelected = item.did === selectedDid;
                return (
                  <TouchableOpacity
                    style={[styles.modalOption, isSelected && styles.modalOptionSelected]}
                    onPress={() => {
                      setSelectedDid(item.did);
                      setMachineModalVisible(false);
                    }}
                  >
                    <View style={styles.modalOptionTextGroup}>
                      <Text style={[styles.modalOptionName, isSelected && styles.modalOptionNameSelected]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.modalOptionDid}>{item.did} • {item.panelType || "MCC"}</Text>
                    </View>
                    {isSelected && <Check size={18} color="#2563EB" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
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
    paddingHorizontal: 14,
    paddingBottom: 36,
  },

  /* Machine Selector Bar */
  machineBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginVertical: 8,
    gap: 10,
  },
  machineBarLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  machineDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  machineDropdownText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
    flex: 1,
    marginRight: 6,
  },

  /* Generic Card Container */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginTop: 10,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1.5 },
    shadowRadius: 5,
    elevation: 1.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardHeaderToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardHeaderWithControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  cardTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1E293B",
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  /* Segmented Pill Toggles */
  togglePillGroup: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  toggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  toggleBtnTextActive: {
    color: "#2563EB",
  },

  /* Badges */
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  /* Panel Info Body */
  panelInfoBody: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 10,
    gap: 8,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoLabel: {
    width: 84,
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  infoValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#1E293B",
  },
  infoSubtext: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#475569",
  },
  pillsRow: {
    flexDirection: "row",
    gap: 6,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 10.5,
    fontWeight: "700",
  },

  /* Main Metrics */
  periodSubtitle: {
    fontSize: 10.5,
    fontWeight: "600",
    color: "#94A3B8",
    marginBottom: 2,
  },
  heroMetricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  deltaPositive: {
    fontSize: 12,
    fontWeight: "800",
    color: "#EF4444",
  },

  /* Column Breakdowns */
  threeColRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 8,
  },
  threeCol: {
    flex: 1,
  },
  twoColRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 8,
  },
  twoCol: {
    flex: 1,
  },
  twoColCenter: {
    flex: 1,
    alignItems: "center",
  },
  vertDivider: {
    width: 1,
    height: "80%",
    backgroundColor: "#E2E8F0",
    alignSelf: "center",
  },
  fourColRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 8,
  },
  fourCol: {
    flex: 1,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    marginBottom: 2,
  },
  subVal: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#1E293B",
  },

  /* ToD Table */
  todTable: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 8,
    marginTop: 4,
  },
  todHeaderRow: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  todHeaderCell: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
  },
  todBodyRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  todBodyCell: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1E293B",
  },

  /* Progress Bar */
  progressContainer: {
    marginVertical: 6,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#F1F5F9",
    borderRadius: 4,
    position: "relative",
    overflow: "visible",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#EF4444",
    borderRadius: 4,
  },
  targetIndicator: {
    position: "absolute",
    top: -3,
    width: 3,
    height: 14,
    backgroundColor: "#64748B",
    borderRadius: 2,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  progressMin: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
  },
  progressTarget: {
    fontSize: 9,
    color: "#64748B",
    fontWeight: "800",
  },
  progressMax: {
    fontSize: 9,
    color: "#94A3B8",
    fontWeight: "700",
  },
  belowTargetText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
    marginVertical: 4,
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: "75%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#2563EB",
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  modalOptionSelected: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  modalOptionTextGroup: {
    flex: 1,
    marginRight: 8,
  },
  modalOptionName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#1E293B",
  },
  modalOptionNameSelected: {
    color: "#2563EB",
    fontWeight: "800",
  },
  modalOptionDid: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
    fontWeight: "600",
  },
});
