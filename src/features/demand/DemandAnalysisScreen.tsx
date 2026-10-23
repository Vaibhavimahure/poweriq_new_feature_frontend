/**
 * DemandAnalysisScreen.tsx
 * ----------------------------------------------------------------------------
 * 100% Dynamic Demand Charges & Analysis Screen matching the Mobile App Design:
 * - Header: "DEMAND CHARGES & ANALYSIS" with Month & Year pickers:
 *   * Calendar shows ONLY: May, June, July, August, September
 *   * Year shows ONLY: 2026
 * - Metadata Box (2 Columns):
 *   * Left Column:
 *     - Demand Charges Type: KVA (3-Phase)
 *     - Discom Billing MD Interval: 15 min
 *     - Max Demand (Billing Cycle): Last rolling month
 *   * Right Column:
 *     - Last 11 Months Consumption MD - KVA: 402
 *     - Contract Demand (KVA): 500
 *     - Excess Demand Factor: 1.5
 *   * NOTE: "Current Window" box removed completely as requested.
 * - "CD vs KVA Comparison" Chart:
 *   * Red dashed benchmark line across: CD: 500 (Contract Demand)
 *   * Bar 1: Current (402 KVA, Blue #0284C7)
 *   * Bar 2: Last 11M (402 KVA, Teal #059669)
 *   * Bar 3: Last Year (293 KVA, Purple #8B5CF6)
 *   * Bar 4: Previous (293 KVA, Amber #F59E0B)
 * - 10 KPI Cards (2 Columns × 5 Rows Grid):
 *   1. Actual MD (402 KVA, Max of 15Min Interval in Selected Period)
 *   2. Last 11 Months Max (402 KVA, Max of 15Min Interval (Last 11M))
 *   3. Previous MD (293 KVA, Max of 15Min Interval (Previous))
 *   4. MD Load Factor (3.08 %, (Actual MD / Contract Demand))
 *   5. Demand Charges (₹ 2,61,300, (Billed Demand × Rate))
 *   6. Excess Demand Charges (₹ 2,73,000, (Excess × Factor))
 *   7. Penalty (₹ 11,700, (If Applicable))
 *   8. Min & Max MD (Min: 293 KVA, Max: 402 KVA)
 *   9. Month Consumption (402 KVA, Equivalent 37 MUs)
 *   10. Reactive MD / KVAh (₹ 0, (Additional Charges))
 * ----------------------------------------------------------------------------
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from "react-native";
import { AppHeader } from "../../components/common/AppHeader";
import { AppFooter } from "../../components/common/AppFooter";
import {
  fetchDemandAnalysis,
  fetchHistoricalBills,
} from "../../api/demandApi";
import { fetchMyCompany } from "../../api/companyApi";
import { fetchDeviceById } from "../../api/deviceApi";
import { CONFIG } from "../../config/constants";
import { CardSkeleton } from "../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../components/common/ErrorCard";
import {
  Gauge,
  BarChart2,
  RotateCcw,
  Clock,
  IndianRupee,
  FileText,
  TrendingUp,
  Zap,
  Atom,
  ChevronDown,
  Info,
  Check,
  Calendar,
} from "lucide-react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Restricted Allowed Calendar Months & Year as requested:
// ONLY May, June, July, August, September & ONLY 2026 Year
export const ALLOWED_MONTHS = [
  { index: 4, name: "May", short: "MAY" },
  { index: 5, name: "June", short: "JUN" },
  { index: 6, name: "July", short: "JUL" },
  { index: 7, name: "August", short: "AUG" },
  { index: 8, name: "September", short: "SEP" },
];
export const ALLOWED_YEARS = [2026];

function firstPresent(...vals: any[]): any {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function getBillFields(source: any = {}) {
  const bill = source?.raw || source || {};
  const fields = bill?.jsonObj?.fields || bill?.fields || {};
  const demand = bill?.demand || {};
  const rates = bill?.rates || {};

  const bMonthRaw = firstPresent(fields?.bill_month, bill?.bill_month, bill?.billingMonth, bill?.month);
  const bYearRaw = firstPresent(fields?.bill_year, bill?.bill_year, bill?.billingYear, bill?.year);

  return {
    ...fields,
    bill_month: String(bMonthRaw || "").toUpperCase().slice(0, 3),
    bill_year: Number(bYearRaw),
    contract_demand_kva: firstPresent(
      fields?.contract_demand_kva,
      fields?.cont_demand_kva,
      fields?.contract_demand,
      demand?.contract_kva,
      bill?.contract_kva,
      bill?.contract_demand_kva,
      bill?.contract_demand
    ),
    demand_75pct_kva: firstPresent(
      fields?.demand_75pct_kva,
      demand?.demand_75pct_kva,
      bill?.demand_75pct_kva,
      bill?.seventy_five_contract_demand
    ),
    recorder_max_demand: firstPresent(
      fields?.recorder_max_demand,
      demand?.recorded_kva,
      bill?.recorded_kva,
      bill?.recorder_max_demand
    ),
    billed_demand_kva: firstPresent(
      fields?.billed_demand_kva,
      demand?.billed_kva,
      bill?.billed_kva,
      bill?.billed_demand_kva
    ),
    billed_demand_rate_rskva: firstPresent(
      fields?.billed_demand_rate_rskva,
      fields?.billed_demand_rkva,
      rates?.billed_demand_rskva,
      bill?.billed_demand_rate_rskva,
      bill?.billed_demand_rskva
    ),
  };
}

function fmtINR(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "₹ 0";
  return (
    "₹ " +
    new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 0,
    }).format(Math.round(n))
  );
}

function niceStep(range: number, maxTicks = 4): number {
  const step0 = range / Math.max(1, maxTicks);
  const p = Math.pow(10, Math.floor(Math.log10(step0)));
  const n = step0 / p;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return m * p;
}

export const DemandAnalysisScreen: React.FC = () => {
  // Calendar restricts to 2026 and May..September; default to September (index 8) 2026
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(8); // September by default

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [company, setCompany] = useState<any>(null);
  const [bills, setBills] = useState<any[]>([]);
  const [kpiCurrent, setKpiCurrent] = useState<any>(null);
  const [kpiPrev, setKpiPrev] = useState<any>(null);

  // Modals for pickers
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const currentMonthItem = useMemo(() => {
    return ALLOWED_MONTHS.find((m) => m.index === selectedMonth) || ALLOWED_MONTHS[4]; // Default to September
  }, [selectedMonth]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Company details
      const comp = await fetchMyCompany();
      setCompany(comp);
      const companyId = comp?._id || comp?.companyId || comp?.id || "";

      // Resolve main did
      const didToUse =
        comp?.main_device ||
        comp?.mainDevice ||
        comp?.defaultDid ||
        comp?.deviceId ||
        comp?.did ||
        (Array.isArray(comp?.devices) && comp.devices[0]?.deviceId) ||
        "E_BA_Z_B_M_P0002_D1";

      // 2. Fetch Device Meta for formType
      let formType = "HT";
      try {
        const dev = await fetchDeviceById(didToUse);
        formType = (dev?.formType || dev?.formtype || "HT").toUpperCase();
      } catch {
        formType = "HT";
      }

      // 3. Fetch Historical Bills (12-month bills)
      let historicalBills: any[] = [];
      if (companyId) {
        try {
          const raw = await fetchHistoricalBills(companyId);
          historicalBills = Array.isArray(raw) ? raw : raw?.data || [];
          setBills(historicalBills);
        } catch (bErr) {
          console.warn("[DemandAnalysis] fetchHistoricalBills error:", bErr);
        }
      }

      // 4. Exact matching bill & fallback bill with contract demand & rate
      const currentMonthShort = currentMonthItem.short;
      const prevMonthIdx = selectedMonth === 0 ? 11 : selectedMonth - 1;
      const prevYearVal = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
      const prevMonthShort = ALLOWED_MONTHS.find((m) => m.index === prevMonthIdx)?.short || "AUG";

      const normalizedBills = historicalBills.map((b) => ({
        raw: b,
        fields: getBillFields(b),
      }));

      const exactSelectedBill = normalizedBills.find(
        (b) => b.fields.bill_month === currentMonthShort && b.fields.bill_year === selectedYear
      );

      const exactPrevBill = normalizedBills.find(
        (b) => b.fields.bill_month === prevMonthShort && b.fields.bill_year === prevYearVal
      );

      const billWithDemandFields = normalizedBills.find(
        (b) =>
          b.fields.contract_demand_kva !== null &&
          b.fields.billed_demand_rate_rskva !== null
      );

      const currentBillSource = exactSelectedBill || billWithDemandFields || normalizedBills[0] || null;

      // 5. Dynamic 11-Month Rolling Window relative to (selectedYear, selectedMonth)
      const prev11List: { year: number; monthKey: string }[] = [];
      for (let i = 1; i <= 11; i++) {
        let m = selectedMonth - i;
        let y = selectedYear;
        while (m < 0) {
          m += 12;
          y -= 1;
        }
        const mObj = ALLOWED_MONTHS.find((it) => it.index === m);
        const mCode = mObj ? mObj.short : new Date(y, m, 1).toLocaleString("en-US", { month: "short" }).toUpperCase();
        prev11List.push({
          year: y,
          monthKey: mCode,
        });
      }
      const prev11Set = new Set(prev11List.map((p) => `${p.year}-${p.monthKey}`));

      // Collect all actual billed demands recorded in this 11-month window
      const recordsIn11M: { month: string; year: number; kva: number; label: string }[] = [];
      (comp?.demandManagement?.months || []).forEach((r: any) => {
        const mKey = String(r?.month || "").toUpperCase().slice(0, 3);
        const y = Number(r?.year);
        const kva = Number(r?.billedDemandKVA);
        if (prev11Set.has(`${y}-${mKey}`) && Number.isFinite(kva) && kva > 0) {
          recordsIn11M.push({
            month: mKey,
            year: y,
            kva,
            label: `${mKey} ${y}`,
          });
        }
      });

      normalizedBills.forEach((b: any) => {
        const mKey = b.fields.bill_month;
        const y = b.fields.bill_year;
        const kva = Number(b.fields.billed_demand_kva);
        if (prev11Set.has(`${y}-${mKey}`) && Number.isFinite(kva) && kva > 0) {
          if (!recordsIn11M.some((r) => r.month === mKey && r.year === y)) {
            recordsIn11M.push({
              month: mKey,
              year: y,
              kva,
              label: `${mKey} ${y}`,
            });
          }
        }
      });

      const maxBdPercentage = Number(comp?.demandManagement?.max_bd_percentage ?? 75);
      const peakKvaIn11M = recordsIn11M.length > 0 ? Math.max(...recordsIn11M.map((r) => r.kva)) : 0;
      const dynamicLast11MConsidered = peakKvaIn11M > 0
        ? Math.round((peakKvaIn11M * maxBdPercentage) / 100)
        : Number(comp?.demandManagement?.maxMd || 402);

      const activeFields = currentBillSource?.fields || {};
      const contractDemand = Number(activeFields.contract_demand_kva || comp?.contract_demand_kva || 500);
      const demandRate = Number(activeFields.billed_demand_rate_rskva || 650);
      const demand75 = Number(((contractDemand * maxBdPercentage) / 100).toFixed(2));
      const excessFactor = Number(comp?.demandManagement?.excessFactor ?? 1.5);

      // 6. Build Dynamic KPI Payloads with dynamic maxMd
      const payloadCurrent = {
        did: didToUse,
        formType,
        bill_month: currentMonthShort,
        bill_year: selectedYear,
        billingCycleStartDay: comp?.billingCycleStartDay ?? 1,
        maxMd: dynamicLast11MConsidered,
        billed_demand_rate_rskva: demandRate,
        demand_75pct_kva: demand75,
        contract_demand_kva: contractDemand,
        cd_kva: contractDemand,
        excessFactor,
        companyId,
      };

      const payloadPrev = {
        ...payloadCurrent,
        bill_month: prevMonthShort,
        bill_year: prevYearVal,
      };

      // 7. Parallel KPI fetch
      const [curRes, prevRes] = await Promise.allSettled([
        fetchDemandAnalysis(payloadCurrent),
        fetchDemandAnalysis(payloadPrev),
      ]);

      if (curRes.status === "fulfilled") {
        setKpiCurrent(curRes.value);
      } else {
        // Fallback default structure for graceful offline / missing server handling
        setKpiCurrent(null);
      }

      if (prevRes.status === "fulfilled") {
        setKpiPrev(prevRes.value);
      } else {
        setKpiPrev(null);
      }
    } catch (err: any) {
      console.error("[DemandAnalysisScreen] loadData error:", err);
      setError(err?.message || "Failed to load Demand Analysis.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentMonthItem, selectedMonth, selectedYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Exact web-dashboard data extraction logic (mirrors DemandAnalysis.jsx ui = useMemo) ──
  const cur = kpiCurrent || {};
  const prev = kpiPrev || {};

  function numW(v: any, fallback = 0): number {
    if (v === '' || v === '—') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function numOrNullW(v: any): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const bdPercentage = numW(company?.demandManagement?.max_bd_percentage, 75);
  const contractDemand = numW(cur?.input?.contract_demand_kva || cur?.billing_demand?.contract_demand_kva || company?.contract_demand_kva, 0);
  const billDemand75 = contractDemand * bdPercentage * 0.01;
  const demandRate = numW(cur?.input?.billed_demand_rate_rskva, 0);
  const excessFactor = numW(company?.demandManagement?.excessFactor, 1.5);

  // ui.current fields — exact web logic
  const currentRecorded = numW(cur?.current?.recorded_md?.md_kva, 0);
  const currentActual = numW(cur?.current?.actual_md?.md_kva, 0);
  const currentBillingDemand = numW(cur?.billing_demand?.billing_demand_kva, 0);
  const currentLast11m75 = numW(cur?.billing_demand?.candidate_B_75pct_last11_max, 0);
  const current75cd = numW(cur?.billing_demand?.candidate_C_75pct_cd ?? billDemand75, 0);
  const currentExceedPct = numW(cur?.exceedance?.exceedance_pct ?? cur?.exceedence?.exceedance_pct, 0);
  const currentBaseRs = numW(cur?.charges?.base_rs, 0);
  const currentTotalRs = numW(cur?.charges?.total_rs, 0);
  const currentPenaltyRs = Math.max(
    0,
    numOrNullW(cur?.charges?.penalty_rs) ??
      numOrNullW(cur?.charges?.penalty_amount_rs) ??
      numOrNullW(cur?.charges?.penalty_amount) ??
      numOrNullW(cur?.charges?.penalty) ??
      (currentTotalRs - currentBaseRs)
  );
  const avoidableLossesRs = numW(cur?.avoidable_md_loss?.amount_rs ?? cur?.charges?.avoidable_md_loss_rs, 0);

  const prevRecordedMd = numW(prev?.current?.recorded_md?.md_kva, 0);

  // Min & Max from company.demandManagement.months (same year) — exact minMax logic from web
  const { minMdVal, minMdIdx, maxMdVal, maxMdIdx, minMaxHas } = useMemo(() => {
    const MONTHS_BILL = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    function monthIndexFromKey(mon3: string) {
      const m = String(mon3 || '').toUpperCase().slice(0, 3);
      return MONTHS_BILL.indexOf(m);
    }
    const dmMonths = company?.demandManagement?.months || [];
    const rows = dmMonths
      .filter((r: any) => Number(r?.year) === Number(selectedYear) && r?.billedDemandKVA !== null && r?.billedDemandKVA !== undefined)
      .map((r: any) => ({ monthIdx: monthIndexFromKey(r.month), value: numW(r.billedDemandKVA, 0) }))
      .filter((r: any) => r.monthIdx >= 0 && r.monthIdx <= selectedMonth);

    if (!rows.length) return { minMdVal: 0, minMdIdx: 0, maxMdVal: 0, maxMdIdx: 0, minMaxHas: false };

    let minV = rows[0];
    let maxV = rows[0];
    for (const r of rows) {
      if (r.value < minV.value) minV = r;
      if (r.value > maxV.value) maxV = r;
    }
    return { minMdVal: minV.value, minMdIdx: minV.monthIdx, maxMdVal: maxV.value, maxMdIdx: maxV.monthIdx, minMaxHas: true };
  }, [company, selectedYear]);

  // Comparison: month-over-month delta (web: diff = round(cur) - round(prev))
  const comparisonCur = currentRecorded;
  const comparisonPrev = prevRecordedMd;
  const comparisonDiff = Math.round(comparisonCur) - Math.round(comparisonPrev);
  const comparisonPct = comparisonPrev ? (comparisonDiff / comparisonPrev) * 100 : 0;
  const comparisonIsUp = comparisonDiff > 0;
  const comparisonIsDown = comparisonDiff < 0;

  // For chart & legacy calcs
  const actualMd = currentActual || Math.round(numW(cur?.actual_md, 402));
  const recordedMd = currentRecorded || actualMd;
  const last11MConsideredMd = Math.round(currentLast11m75) || 0;
  const lastYearMd = Math.round(numW(cur?.input?.maxMd ?? company?.demandManagement?.maxMd, 0));

  // Chart Geometry — exact match to web "CD vs KVA Comparison"
  // Web bars: Recorded (blue) | Actual (teal) | Last 11M (purple) | 75% CD (yellow)
  const plotH = 175;
  const { ticks, toY, bars } = useMemo(() => {
    const cd = contractDemand > 0 ? contractDemand : 0;

    // Exact bar definitions matching web dashboard
    const barList = [
      { key: "Recorded",  value: currentRecorded,   color: "#2196F3" }, // Blue
      { key: "Actual",    value: currentActual,      color: "#009688" }, // Teal
      { key: "Last 11M",  value: currentLast11m75,   color: "#9C27B0" }, // Purple
      { key: "75% CD",    value: current75cd,         color: "#F9A825" }, // Yellow/Gold
    ];

    // Dynamic Y scale: round up to nearest 100, min 400
    const allVals = [cd, ...barList.map((b) => b.value)].filter((v) => v > 0);
    const dataMax = allVals.length ? Math.max(...allVals) : 400;
    const max = Math.max(Math.ceil(dataMax / 100) * 100 + 100, 450);
    const min = 0;
    const range = max - min;

    // Y-axis ticks: 0, max/4, max/2, 3*max/4, max  → rounded to 50
    const step = Math.ceil((max / 4) / 50) * 50;
    const tList: number[] = [];
    for (let v = max; v >= 0; v -= step) tList.push(Math.round(v));
    if (tList[tList.length - 1] !== 0) tList.push(0);

    const toYFunc = (v: number) => {
      const clamped = Math.max(min, Math.min(max, v));
      return plotH - Math.round(((clamped - min) / range) * plotH);
    };

    return { ticks: tList, toY: toYFunc, bars: barList, max, cd };
  }, [contractDemand, currentRecorded, currentActual, currentLast11m75, current75cd]);

  return (
    <View style={styles.container}>
      <AppHeader title="PowerIQ-AI" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[CONFIG.THEME.primary]}
            tintColor={CONFIG.THEME.primary}
          />
        }
      >
        {/* Header Title + Month/Year Pickers (Matching Image 1) */}
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>DEMAND CHARGES &amp; ANALYSIS</Text>

          <View style={styles.selectorsGroup}>
            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowMonthPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownBtnText}>{currentMonthItem.name}</Text>
              <ChevronDown size={14} color="#64748B" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dropdownBtn}
              onPress={() => setShowYearPicker(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.dropdownBtnText}>{selectedYear}</Text>
              <ChevronDown size={14} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        {loading && !refreshing ? (
          <View style={{ paddingVertical: 16 }}>
            <CardSkeleton height={110} />
            <CardSkeleton height={240} />
            <CardSkeleton height={200} />
          </View>
        ) : error && !cur ? (
          <ErrorCard title="Error" message={error} onRetry={loadData} />
        ) : (
          <>
            {/* Top Specifications Card (2 Columns, Exact Match to Image 1) */}
            <View style={styles.specCard}>
              <View style={styles.specRow}>
                {/* Left Column */}
                <View style={styles.specCol}>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Demand Charges Type: </Text>
                    <Text style={styles.specVal}>KVA (3-Phase)</Text>
                  </Text>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Discom Billing MD Interval: </Text>
                    <Text style={styles.specVal}>15 min</Text>
                  </Text>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Max Demand (Billing Cycle): </Text>
                    <Text style={styles.specVal}>Last rolling month</Text>
                  </Text>
                </View>

                {/* Right Column */}
                <View style={styles.specCol}>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Last 11 Months Consumption MD - KVA: </Text>
                    <Text style={styles.specVal}>{last11MConsideredMd}</Text>
                  </Text>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Contract Demand (KVA): </Text>
                    <Text style={styles.specVal}>{contractDemand}</Text>
                  </Text>
                  <Text style={styles.specLine}>
                    <Text style={styles.specLabel}>Excess Demand Factor: </Text>
                    <Text style={styles.specVal}>{excessFactor}</Text>
                  </Text>
                </View>
              </View>
              {/* NOTE: "Current Window" box removed completely per user instructions */}
            </View>

            {/* CD vs KVA Comparison Bar Chart (Exact Match to Image 1) */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>CD vs KVA Comparison</Text>
                <Info size={16} color="#94A3B8" />
              </View>

              {/* Chart Lane (Y-Axis + Plot) */}
              <View style={styles.chartLaneRow}>
                {/* Y-Axis Lane */}
                <View style={[styles.yAxisLane, { height: plotH }]}>
                  {ticks.map((v) => (
                    <Text
                      key={v}
                      style={[
                        styles.yAxisTickText,
                        { top: Math.max(0, Math.min(plotH - 12, toY(v) - 7)) },
                      ]}
                    >
                      {v}
                    </Text>
                  ))}
                </View>

                {/* Plot Area */}
                <View style={[styles.plotArea, { height: plotH }]}>
                  {/* Grid Lines */}
                  {ticks.map((v) => (
                    <View
                      key={v}
                      style={[
                        styles.gridLine,
                        { top: toY(v) },
                      ]}
                    />
                  ))}

                  {/* Red Dashed Contract Demand Line with web-matching label "CD = X kVA" */}
                  {contractDemand > 0 && (
                  <View
                    style={[
                      styles.cdLineWrapper,
                      { top: toY(contractDemand) },
                    ]}
                  >
                    <View style={styles.cdDashedLine} />
                    <Text style={styles.cdLineTag}>
                      CD = {contractDemand} kVA
                    </Text>
                  </View>
                  )}

                  {/* 4 Vertical Bars */}
                  <View style={styles.barsRow}>
                    {bars.map((b) => {
                      const barH = Math.max(4, plotH - toY(b.value));
                      return (
                        <View key={b.key} style={styles.barSlot}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: barH,
                                backgroundColor: b.color,
                              },
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>

              {/* Labels & Values Under Bars */}
              <View style={styles.barLabelsRow}>
                {bars.map((b) => (
                  <View key={b.key} style={styles.barLabelSlot}>
                    <Text style={styles.barLabelTitle}>{b.key}</Text>
                    <Text style={styles.barLabelValue}>{Math.round(b.value)} KVA</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 11 KPI Cards (2 Columns Grid — exact match to web DemandAnalysis.jsx) */}
            <View style={styles.kpiGrid}>

              {/* Card 1: Billing Demand */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#CCFBF1" }]}>
                    <Gauge size={16} color="#0D9488" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Billing Demand</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{Math.round(currentBillingDemand)} <Text style={styles.unitText}>KVA</Text></Text>
                </View>
                <Text style={styles.subFormula}>
                  max{" {"} Actual MD, {bdPercentage}% Last 11M, {bdPercentage}% CD {"}"}  
                </Text>
              </View>

              {/* Card 2: Recorded MD */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#DBEAFE" }]}>
                    <BarChart2 size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Recorded MD</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{Math.round(currentRecorded)} <Text style={styles.unitText}>KVA</Text></Text>
                </View>
                <Text style={styles.subFormula}>
                  Max of all hours MD &amp; Impact on Exceedence
                </Text>
              </View>

              {/* Card 3: Actual MD */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#E0E7FF" }]}>
                    <Zap size={16} color="#4F46E5" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Actual MD</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{Math.round(currentActual)} <Text style={styles.unitText}>KVA</Text></Text>
                </View>
                <Text style={styles.subFormula}>
                  Max of TOD Zones MD except A Zone
                </Text>
              </View>

              {/* Card 4: Last 11 Month Max */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEF3C7" }]}>
                    <Clock size={16} color="#D97706" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Last 11 Month Max</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{Math.round(currentLast11m75)} <Text style={styles.unitText}>KVA</Text></Text>
                </View>
                <Text style={styles.subFormula}>
                  {bdPercentage}% of Last 11 Months Highest MD
                </Text>
              </View>

              {/* Card 5: 75% CD */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEE2E2" }]}>
                    <FileText size={16} color="#EF4444" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{bdPercentage}% CD</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{Math.round(current75cd)} <Text style={styles.unitText}>KVA</Text></Text>
                </View>
                <Text style={styles.subFormula}>
                  {bdPercentage}% of Contract Demand
                </Text>
              </View>

              {/* Card 6: Exceedence */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEE2E2" }]}>
                    <TrendingUp size={16} color="#EF4444" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Exceedence</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>
                    {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(currentExceedPct)}
                    {" "}<Text style={styles.unitText}>%</Text>
                  </Text>
                </View>
                <Text style={styles.subFormula}>
                  Recorded MD &gt; CD
                </Text>
              </View>

              {/* Card 7: Base Demand Charges */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#E0F2FE" }]}>
                    <IndianRupee size={16} color="#0284C7" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Base Demand Charges</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={styles.mainNumber}>{fmtINR(currentBaseRs)}</Text>
                </View>
                <Text style={styles.subFormula}>
                  Billing Demand x Rate
                </Text>
              </View>

              {/* Card 8: Bill Demand Charges */}
              <View style={[styles.kpiCard, { minHeight: 130 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#E0F2FE" }]}>
                    <IndianRupee size={16} color="#0284C7" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Bill Demand Charges</Text>
                </View>
                <View style={[styles.cardValueRow, { flexDirection: "column", alignItems: "flex-start", gap: 4 }]}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Text style={styles.mainNumber}>{fmtINR(currentTotalRs)}</Text>
                  </View>
                  <Text style={[styles.subFormula, { marginTop: 0 }]}>(Base + Penalty)</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Text style={[styles.mainNumber, { fontSize: 14 }]}>{fmtINR(currentPenaltyRs)}</Text>
                  </View>
                  <Text style={[styles.subFormula, { marginTop: 0 }]}>(Penalty)</Text>
                </View>
              </View>

              {/* Card 9: Min & Max Months */}
              <View style={styles.kpiCard}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#D1FAE5" }]}>
                    <RotateCcw size={16} color="#059669" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Min &amp; Max Months</Text>
                </View>
                <View style={styles.minMaxSplitRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.minMaxVal}>{Math.round(minMdVal)} <Text style={styles.minMaxUnit}>kVA</Text></Text>
                    <Text style={styles.subFormula}>Min {minMaxHas ? `(${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][minMdIdx]})` : ""}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={styles.minMaxVal}>{Math.round(maxMdVal)} <Text style={styles.minMaxUnit}>kVA</Text></Text>
                    <Text style={styles.subFormula}>Max {minMaxHas ? `(${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][maxMdIdx]})` : ""}</Text>
                  </View>
                </View>
                <Text style={styles.subFormula}>
                  Min &amp; Max Billed MD Readings in current year
                </Text>
              </View>

              {/* Card 10: Month Comparison */}
              <View style={[styles.kpiCard, { minHeight: 130 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#F3E8FF" }]}>
                    <BarChart2 size={16} color="#9333EA" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Month Comparison</Text>
                </View>
                <View style={{ alignItems: "flex-start", marginTop: 4 }}>
                  <Text style={styles.subFormula}>Current Month</Text>
                  <Text style={styles.mainNumber}>
                    {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(comparisonCur))}
                    {" "}<Text style={styles.unitText}>kVA</Text>
                  </Text>
                  <Text style={[styles.subFormula, { marginTop: 4, color: comparisonIsUp ? "#EF4444" : comparisonIsDown ? "#059669" : "#64748B" }]}>
                    {comparisonDiff === 0
                      ? "No Change"
                      : `${comparisonIsUp ? "Increase" : "Decrease"} of ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(comparisonDiff))} kVA`}
                  </Text>
                  {comparisonPrev > 0 && comparisonDiff !== 0 && (
                    <Text style={[styles.subFormula, { color: "#64748B" }]}>
                      {Math.abs(comparisonPct).toFixed(1)}% from previous month
                    </Text>
                  )}
                </View>
              </View>

              {/* Card 11: Avoidable MD Losses — full-width card */}
              <View style={[styles.kpiCard, { width: "100%", minHeight: 100 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconCircle, { backgroundColor: "#FEE2E2" }]}>
                    <IndianRupee size={16} color="#EF4444" />
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={1}>Avoidable MD Losses</Text>
                </View>
                <View style={styles.cardValueRow}>
                  <Text style={[styles.mainNumber, { color: avoidableLossesRs <= 0 ? "#0F172A" : "#EF4444" }]}>
                    {fmtINR(avoidableLossesRs)}
                  </Text>
                </View>
                <Text style={styles.subFormula}>
                  Avoidable MD Losses = max((75% CD − Actual MD) × Rate, ₹0)
                </Text>
              </View>

            </View>
          </>
        )}
      </ScrollView>

      {/* Month Selection Modal (ONLY May, June, July, August, September) */}
      <Modal
        visible={showMonthPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMonthPicker(false)}
        >
          <View style={styles.pickerModalContent}>
            <Text style={styles.pickerModalTitle}>Select Month</Text>
            {ALLOWED_MONTHS.map((mObj) => {
              const isSelected = selectedMonth === mObj.index;
              return (
                <TouchableOpacity
                  key={mObj.index}
                  style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedMonth(mObj.index);
                    setShowMonthPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      isSelected && styles.pickerItemTextSelected,
                    ]}
                  >
                    {mObj.name}
                  </Text>
                  {isSelected && <Check size={16} color={CONFIG.THEME.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Year Selection Modal (ONLY 2026) */}
      <Modal
        visible={showYearPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowYearPicker(false)}
        >
          <View style={styles.pickerModalContent}>
            <Text style={styles.pickerModalTitle}>Select Year</Text>
            {ALLOWED_YEARS.map((yr) => {
              const isSelected = selectedYear === yr;
              return (
                <TouchableOpacity
                  key={yr}
                  style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                  onPress={() => {
                    setSelectedYear(yr);
                    setShowYearPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerItemText,
                      isSelected && styles.pickerItemTextSelected,
                    ]}
                  >
                    {yr}
                  </Text>
                  {isSelected && <Check size={16} color={CONFIG.THEME.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <AppFooter />
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },

  /* Header Row: Title & Selectors */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexWrap: "wrap",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: 0.3,
  },
  selectorsGroup: {
    flexDirection: "row",
    gap: 8,
  },
  dropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  dropdownBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#334155",
  },

  /* Top Specifications Card */
  specCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  specCol: {
    flex: 1,
    gap: 4,
  },
  specLine: {
    fontSize: 10,
    lineHeight: 14,
  },
  specLabel: {
    color: "#64748B",
    fontWeight: "500",
  },
  specVal: {
    color: "#0F172A",
    fontWeight: "700",
  },

  /* CD vs KVA Comparison Bar Chart */
  chartCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  chartLaneRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  yAxisLane: {
    width: 28,
    position: "relative",
    marginRight: 6,
  },
  yAxisTickText: {
    position: "absolute",
    right: 0,
    fontSize: 9.5,
    fontWeight: "600",
    color: "#94A3B8",
  },
  plotArea: {
    flex: 1,
    position: "relative",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#F1F5F9",
  },
  cdLineWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 10,
  },
  cdDashedLine: {
    flex: 1,
    height: 1.5,
    borderWidth: 1,
    borderColor: "#EF4444",
    borderStyle: "dashed",
  },
  cdLineTag: {
    fontSize: 9.5,
    fontWeight: "800",
    color: "#EF4444",
    marginLeft: 6,
    position: "absolute",
    right: 0,
    top: -14,
  },
  barsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "flex-end",
    paddingHorizontal: 12,
  },
  barSlot: {
    width: 28,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barFill: {
    width: 24,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  barLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 8,
    paddingLeft: 34,
  },
  barLabelSlot: {
    width: 58,
    alignItems: "center",
  },
  barLabelTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
    textAlign: "center",
  },
  barLabelValue: {
    fontSize: 10,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },

  /* 10 KPI Cards Grid (2 Columns) */
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 32 - 10) / 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 8,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
  },
  cardValueRow: {
    marginBottom: 4,
  },
  mainNumber: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  unitText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#334155",
  },
  subFormula: {
    fontSize: 9.5,
    color: "#64748B",
    fontWeight: "500",
    lineHeight: 13,
  },
  minMaxSplitRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  minMaxVal: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  minMaxUnit: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748B",
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  pickerModalContent: {
    width: "100%",
    maxWidth: 280,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerModalTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
    textAlign: "center",
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  pickerItemSelected: {
    backgroundColor: "#EFF6FF",
  },
  pickerItemText: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },
  pickerItemTextSelected: {
    color: CONFIG.THEME.primary,
    fontWeight: "700",
  },
});
