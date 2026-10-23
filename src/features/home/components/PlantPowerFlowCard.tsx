/**
 * PlantPowerFlowCard.tsx
 * ----------------------------------------------------------------------------
 * Mobile Plant Power Flow card matching web dashboard logic & design specs:
 * - Plant Consumption (Hero Card with embedded Solar Yield & Performance Ratio)
 * - Overhead Dotted Flow: Grid Import
 * - Solar Generation (Left) <-- Net Grid Import (Right)
 * - Grid Export (Left) --> Bank Units (Right)
 * - Footer: Info message & Main Incomer PF
 * - Energy (kWh) / Cost (₹) View Toggle
 * ----------------------------------------------------------------------------
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { Zap, Info } from "lucide-react-native";
import { CONFIG } from "../../../config/constants";
import { CardSkeleton } from "../../../components/common/LoadingSkeleton";
import { ErrorCard } from "../../../components/common/ErrorCard";

// ============================================================================
// SVG Icons Matching Web Dashboard Exact Paths
// ============================================================================

const PlantIcon = () => (
  <Svg width="26" height="26" viewBox="0 0 48 48" fill="none">
    <Path d="M8 23L24 10L40 23" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M13 22V40H35V22" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M21 40V29H27V40" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M33 18V9H39V23" stroke="#334155" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SolarIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 48 48" fill="none">
    <Circle cx="24" cy="24" r="8" stroke="#EAB308" strokeWidth="3" />
    <Path d="M24 4V12" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M24 36V44" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M4 24H12" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M36 24H44" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M10 10L15.5 15.5" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M32.5 32.5L38 38" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M38 10L32.5 15.5" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
    <Path d="M15.5 32.5L10 38" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

const GridIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 48 48" fill="none">
    <Path d="M24 5L14 42" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
    <Path d="M24 5L34 42" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
    <Path d="M12 19H36" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
    <Path d="M10 29H38" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
    <Path d="M18 19L30 30" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
    <Path d="M30 19L18 30" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

const BankIcon = () => (
  <Svg width="22" height="22" viewBox="0 0 48 48" fill="none">
    <Path d="M7 19L24 10L41 19" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M10 22H38" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
    <Path d="M13 39H35" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
    <Path d="M16 26V35" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
    <Path d="M24 26V35" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
    <Path d="M32 26V35" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

interface PlantPowerFlowCardProps {
  data: any;
  costData?: any;
  mainIncomerPf?: number | null;
  solarPerformance?: any;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPressSolarGeneration?: () => void;
}

export const PlantPowerFlowCard: React.FC<PlantPowerFlowCardProps> = ({
  data,
  costData,
  mainIncomerPf,
  solarPerformance,
  loading = false,
  error = null,
  onRetry,
  onPressSolarGeneration,
}) => {
  const [viewMode, setViewMode] = useState<"energy" | "cost">("energy");

  if (loading) {
    return <CardSkeleton height={420} />;
  }

  if (error) {
    return <ErrorCard title="Plant Power Flow Unavailable" message={error} onRetry={onRetry} />;
  }

  const cur = data?.current || data?.values || data || {};
  const meter = data?.meter || {};
  const manual = data?.manual || data?.direct || {};

  const isCost = viewMode === "cost";
  const unit = isCost ? "₹" : "kWh";

  const toNum = (value: any, fallback: number | null = null): number | null => {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(String(value).replace(/,/g, "").replace(/%/g, "").replace(/kwh/gi, "").replace(/kw/gi, "").replace(/₹/g, "").trim());
    return Number.isFinite(n) ? n : fallback;
  };

  const firstNum = (...values: any[]): number | null => {
    for (const val of values) {
      if (val === null || val === undefined || val === "") continue;
      const n = toNum(val, null);
      if (n !== null && Number.isFinite(n)) return n;
    }
    return null;
  };

  // Raw energy metrics
  const rawSolar = firstNum(
    cur?.solarGeneration,
    cur?.solar_generation,
    cur?.solarSelfConsumedUnits,
    cur?.solar_self_consumed_units,
    data?.solarGeneration,
    data?.solar_generation
  );

  const rawConsumption = firstNum(
    cur?.plantConsumption,
    cur?.plantLoad,
    cur?.plant_load,
    cur?.consumption,
    data?.plantConsumption,
    data?.plantLoad,
    data?.plant_load
  );

  const rawGridImport = firstNum(
    meter?.htImport,
    meter?.gridImport,
    cur?.gridImport,
    cur?.grid_import,
    cur?.gross_import,
    data?.gridImport,
    manual?.gridImport
  );

  const rawGridExport = firstNum(
    meter?.htExport,
    meter?.gridExport,
    cur?.gridExport,
    cur?.grid_export,
    cur?.export,
    data?.gridExport,
    manual?.gridExport
  );

  const rawNetImport = firstNum(
    cur?.netImport,
    cur?.net_import,
    meter?.netGridImport,
    meter?.net_grid_import,
    data?.netImport,
    rawGridImport !== null && rawGridExport !== null ? rawGridImport - rawGridExport : null
  );

  const rawBankUnits = firstNum(
    cur?.bankUnits,
    cur?.solarBankUnits,
    data?.bankUnits,
    rawGridImport !== null && rawGridExport !== null ? Math.max(rawGridExport - rawGridImport, 0) : 0
  );

  // Exact Cost Data resolution matching web dashboard's buildOwnerPlantPowerFlowCostData
  const costCur = costData?.current || costData || {};
  const costSource = costCur?.source_breakdown || costCur?.sourceBreakdown || {};
  const costBreakdown = costCur?.cost_breakdown || costCur?.costBreakdown || {};
  const costTotals = costCur?.totals || {};

  const costGridImport = firstNum(
    costSource?.gridVariableCost,
    costSource?.grid_variable_cost,
    costBreakdown?.gridVariableCost,
    costBreakdown?.grid_variable_cost,
    costTotals?.gridVariableCost,
    costTotals?.grid_variable_cost,
    costCur?.gridCost,
    costCur?.gridVariableCost
  );

  const costSolar = firstNum(
    costSource?.solarEnergyCost,
    costSource?.solar_energy_cost,
    costBreakdown?.solarEnergyCost,
    costBreakdown?.solar_energy_cost,
    costTotals?.solarEnergyCost,
    costTotals?.solar_energy_cost,
    costCur?.solarCost,
    costCur?.solarEnergyCost
  );

  const costDg = firstNum(
    costSource?.dgEnergyCost,
    costSource?.dg_energy_cost,
    costBreakdown?.dgEnergyCost,
    costBreakdown?.dg_energy_cost,
    costTotals?.dgEnergyCost,
    costTotals?.dg_energy_cost
  );

  const costConsumption = firstNum(
    costCur?.totalSourceEnergyCost,
    costCur?.total_source_energy_cost,
    costSource?.totalSourceEnergyCost,
    costSource?.total_source_energy_cost,
    costBreakdown?.totalSourceEnergyCost,
    costBreakdown?.total_source_energy_cost,
    costTotals?.totalSourceEnergyCost,
    costTotals?.total_source_energy_cost,
    costCur?.totalCost,
    costCur?.total_cost,
    costGridImport !== null || costSolar !== null || costDg !== null
      ? (costGridImport || 0) + (costSolar || 0) + (costDg || 0)
      : null
  );

  // Values according to selected mode
  const plantConsumption = isCost ? costConsumption : rawConsumption;
  const solarGen = isCost ? costSolar : rawSolar;
  const gridImport = isCost ? costGridImport : rawGridImport;
  const netImport = isCost ? costGridImport : rawNetImport;
  const gridExport = isCost ? null : rawGridExport;
  const bankUnits = isCost ? null : rawBankUnits;

  // Solar Performance metrics matching mapSolarPerformance in web dashboard
  const solarValues = solarPerformance?.values || solarPerformance?.raw?.values || solarPerformance?.raw || solarPerformance || {};
  const solarYield = firstNum(
    solarValues?.solarYield,
    solarValues?.yield,
    solarPerformance?.solarYield,
    solarPerformance?.yield,
    solarPerformance?.solar_yield,
    cur?.solar_yield,
    cur?.solarYield,
    data?.solarYield
  );

  const performanceScore = firstNum(
    solarValues?.rtps,
    solarValues?.performanceScore,
    solarValues?.score,
    solarPerformance?.rtps,
    solarPerformance?.performanceScore,
    solarPerformance?.performance_score,
    solarPerformance?.performance_ratio,
    solarPerformance?.score,
    solarPerformance?.solarRtps,
    cur?.performance_score,
    cur?.performanceScore,
    cur?.solarPerformanceScore,
    data?.solarPerformanceScore
  );

  const formatVal = (v: number | null) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    const digits = abs < 1000 && abs % 1 > 0 ? 1 : 0;
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(v);
  };

  const formatPf = (pf: number | null | undefined) => {
    if (pf === null || pf === undefined || !Number.isFinite(pf)) return "—";
    return Number(pf).toFixed(3);
  };

  return (
    <View style={styles.card}>
      {/* Title & Energy / Cost Switch */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Zap size={22} color="#2563EB" fill="#2563EB" />
          <Text style={styles.cardTitle}>Plant Power Flow</Text>
        </View>

        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isCost && styles.toggleBtnActive]}
            onPress={() => setViewMode("energy")}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, !isCost && styles.toggleTextActive]}>Energy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isCost && styles.toggleBtnActive]}
            onPress={() => setViewMode("cost")}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, isCost && styles.toggleTextActive]}>Cost</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Node 1: Plant Consumption Hero Node (Green Border) */}
      <View style={styles.consumptionBox}>
        <View style={styles.nodeHeaderRow}>
          <PlantIcon />
          <Text style={styles.consumptionLabel}>Plant Consumption</Text>
        </View>

        <View style={styles.valRow}>
          {isCost && <Text style={styles.currencyPrefix}>₹ </Text>}
          <Text style={styles.consumptionValue}>{formatVal(plantConsumption)}</Text>
          {!isCost && <Text style={styles.consumptionUnit}> kWh</Text>}
        </View>

        {/* Embedded Solar Performance Sub-Box */}
        <View style={styles.subBoxContainer}>
          <View style={styles.subBoxCol}>
            <Text style={styles.subBoxLabel}>Solar Yield</Text>
            <Text style={[styles.subBoxVal, { color: "#16A34A" }]}>
              {solarYield !== null && Number.isFinite(solarYield) ? `${Number(solarYield).toFixed(2)} kWh/kWp` : "—"}
            </Text>
          </View>
          <View style={styles.subBoxDivider} />
          <View style={styles.subBoxCol}>
            <Text style={styles.subBoxLabel}>Performance Ratio</Text>
            <Text style={[styles.subBoxVal, { color: "#2563EB" }]}>
              {performanceScore !== null && Number.isFinite(performanceScore)
                ? `${Number(performanceScore).toFixed(2)}%`
                : "—"}
            </Text>
          </View>
        </View>
      </View>

      {/* Dotted Overhead Flow: Grid Import Banner */}
      <View style={styles.overheadFlowContainer}>
        <View style={styles.dashedLine} />
        <View style={styles.gridImportBadge}>
          <Text style={styles.gridImportBadgeText}>
            Grid Import: {isCost ? "₹ " : ""}{formatVal(gridImport)}{!isCost ? " kWh" : ""}
          </Text>
        </View>
        <View style={styles.dashedArrowsRow}>
          <Text style={styles.arrowDownDotted}>↓</Text>
          <Text style={styles.arrowDownDotted}>↓</Text>
        </View>
      </View>

      {/* Middle Row: Solar Generation <-- Net Grid Import */}
      <View style={styles.nodesRow}>
        {/* Solar Generation (Blue Border) - Clickable to open Solar Inverters modal */}
        <TouchableOpacity
          style={[styles.metricCard, { borderColor: "#93C5FD" }]}
          onPress={onPressSolarGeneration}
          activeOpacity={onPressSolarGeneration ? 0.7 : 1}
        >
          <View style={styles.cardHeader}>
            <SolarIcon />
            <Text style={styles.cardHeaderLabel} numberOfLines={1}>
              Solar Generation
            </Text>
          </View>
          <Text style={[styles.cardValue, { color: "#15803D" }]} numberOfLines={1}>
            {isCost && "₹ "}{formatVal(solarGen)}{!isCost && " kWh"}
          </Text>
        </TouchableOpacity>

        {/* Flow Arrow: Points Left into Plant/Solar */}
        <View style={styles.flowArrowContainer}>
          <Text style={[styles.flowArrowText, { color: "#F59E0B" }]}>←</Text>
        </View>

        {/* Net Grid Import (Orange Border) */}
        <View style={[styles.metricCard, { borderColor: "#FDBA74" }]}>
          <View style={styles.cardHeader}>
            <GridIcon />
            <Text style={styles.cardHeaderLabel} numberOfLines={1}>
              Net Grid Import
            </Text>
          </View>
          <Text style={[styles.cardValue, { color: "#D97706" }]} numberOfLines={1}>
            {isCost && "₹ "}{formatVal(netImport)}{!isCost && " kWh"}
          </Text>
        </View>
      </View>

      {/* Vertical Green Arrow: Solar Gen --> Grid Export */}
      <View style={styles.verticalArrowContainer}>
        <Text style={styles.verticalArrowText}>↓</Text>
      </View>

      {/* Bottom Row: Grid Export --> Bank Units */}
      <View style={styles.nodesRow}>
        {/* Grid Export (Green Border) */}
        <View style={[styles.metricCard, { borderColor: "#86EFAC" }, isCost && styles.mutedCard]}>
          <View style={styles.cardHeader}>
            <GridIcon />
            <Text style={[styles.cardHeaderLabel, isCost && styles.mutedText]} numberOfLines={1}>
              Grid Export
            </Text>
          </View>
          <Text style={[styles.cardValue, { color: isCost ? "#94A3B8" : "#15803D" }]} numberOfLines={1}>
            {isCost ? "—" : `${formatVal(gridExport)} kWh`}
          </Text>
        </View>

        {/* Flow Arrow: Points Right into Bank Units */}
        <View style={styles.flowArrowContainer}>
          <Text style={[styles.flowArrowText, { color: isCost ? "#CBD5E1" : "#16A34A" }]}>→</Text>
        </View>

        {/* Bank Units (Teal Border) */}
        <View style={[styles.metricCard, { borderColor: "#99F6E4" }, isCost && styles.mutedCard]}>
          <View style={styles.cardHeader}>
            <BankIcon />
            <Text style={[styles.cardHeaderLabel, isCost && styles.mutedText]} numberOfLines={1}>
              Bank Units
            </Text>
          </View>
          <Text style={[styles.cardValue, { color: isCost ? "#94A3B8" : "#0F766E" }]} numberOfLines={1}>
            {isCost ? "—" : `${formatVal(bankUnits)} kWh`}
          </Text>
        </View>
      </View>

      {/* Footer: Info + Incomer PF */}
      <View style={styles.footerRow}>
        <View style={styles.footerLeft}>
          <Info size={14} color="#64748B" style={{ marginRight: 4 }} />
          <Text style={styles.footerNote}>All values are accumulated for the selected period.</Text>
        </View>
        <View style={styles.footerRight}>
          <Text style={styles.pfLabel}>Main Incomer PF  </Text>
          <Text style={styles.pfValue}>{formatPf(mainIncomerPf)}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 20,
    padding: 3,
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  toggleBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  toggleTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },

  // Hero Node: Plant Consumption
  consumptionBox: {
    borderWidth: 1.5,
    borderColor: "#22C55E",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  nodeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  consumptionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
  },
  valRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginVertical: 4,
  },
  currencyPrefix: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
  },
  consumptionValue: {
    fontSize: 28,
    fontWeight: "900",
    color: "#1E293B",
    letterSpacing: -0.5,
  },
  consumptionUnit: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginLeft: 4,
  },

  // Embedded Sub Box
  subBoxContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  subBoxCol: {
    flex: 1,
  },
  subBoxLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 2,
  },
  subBoxVal: {
    fontSize: 13,
    fontWeight: "800",
  },
  subBoxDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 10,
  },

  // Overhead Dotted Flow: Grid Import
  overheadFlowContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 6,
    position: "relative",
  },
  dashedLine: {
    position: "absolute",
    top: 10,
    left: "15%",
    right: "15%",
    height: 1,
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderStyle: "dashed",
  },
  gridImportBadge: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    zIndex: 2,
  },
  gridImportBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#D97706",
  },
  dashedArrowsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "74%",
    marginTop: -2,
  },
  arrowDownDotted: {
    color: "#F59E0B",
    fontSize: 14,
    fontWeight: "900",
  },

  // Nodes Grid Rows
  nodesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricCard: {
    width: "44%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
  },
  mutedCard: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  cardHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#475569",
    flex: 1,
  },
  mutedText: {
    color: "#94A3B8",
  },
  cardValue: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  flowArrowContainer: {
    width: "12%",
    alignItems: "center",
    justifyContent: "center",
  },
  flowArrowText: {
    fontSize: 22,
    fontWeight: "900",
  },
  verticalArrowContainer: {
    width: "44%",
    alignItems: "center",
    marginVertical: 2,
  },
  verticalArrowText: {
    color: "#16A34A",
    fontSize: 18,
    fontWeight: "900",
  },

  // Footer Row
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  footerNote: {
    fontSize: 10.5,
    color: "#64748B",
    lineHeight: 14,
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  pfLabel: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "500",
  },
  pfValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0F172A",
  },
});
