/**
 * SolarAndConsumptionCards.tsx
 * ----------------------------------------------------------------------------
 * Auxiliary Plant Breakdown Cards for Home Dashboard matching user's design:
 * 1. Solar Inverters (Bold Total badge + 3 column Inverter breakdown)
 * 2. Machine Consumption (High-contrast Product, kWh, Hrs. Table)
 * 3. Utility Consumption (High-contrast Product, kWh, Hrs. Table)
 * 4. Footer info note with Main Meter PF
 * ----------------------------------------------------------------------------
 */

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Settings, Zap, Info, Edit3 } from "lucide-react-native";

// ── Solid Filled Solar Panel Icon matching user reference image ──────────────
const SolarPanelIcon = () => (
  <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    {/* Blue panel surface */}
    <Path
      d="M3.5 14.5L5.8 4H18.2L20.5 14.5H3.5Z"
      fill="#2563EB"
      stroke="#2563EB"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    {/* White grid lines */}
    <Path d="M4.6 9.25H19.4" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
    <Path d="M10 4L9 14.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
    <Path d="M14 4L15 14.5" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
    {/* Stand */}
    <Path d="M12 14.5V19.5" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" />
    <Path d="M8 19.5H16" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" />
  </Svg>
);

export interface InverterItem {
  name: string;
  kw: number | string;
}

export interface ConsumptionRow {
  product: string;
  kwh: number | string;
  hours: number | string;
}

interface SolarAndConsumptionCardsProps {
  invertersData?: {
    totalKw?: number | string;
    inverters?: InverterItem[];
  };
  machineConsumption?: ConsumptionRow[];
  utilityConsumption?: ConsumptionRow[];
  mainMeterPf?: number | string;
  onPressSolarInverters?: () => void;
}

// ── Default Mock/Fallback Data from reference image ─────────────────────────
const DEFAULT_INVERTERS: InverterItem[] = [
  { name: "INV-1", kw: "141.2" },
  { name: "INV-2", kw: "177.4" },
  { name: "INV-3", kw: "187.2" },
];

const DEFAULT_MACHINE_CONSUMPTION: ConsumptionRow[] = [
  { product: "HDPE", kwh: "230", hours: "12" },
  { product: "FLAT", kwh: "230", hours: "8" },
  { product: "ROUND", kwh: "32.0", hours: "10" },
];

const DEFAULT_UTILITY_CONSUMPTION: ConsumptionRow[] = [
  { product: "HDPE", kwh: "230", hours: "12" },
  { product: "FLAT", kwh: "230", hours: "8" },
  { product: "ROUND", kwh: "32.0", hours: "10" },
];

export const SolarAndConsumptionCards: React.FC<SolarAndConsumptionCardsProps> = ({
  invertersData,
  machineConsumption,
  utilityConsumption,
  mainMeterPf = "0.99",
  onPressSolarInverters,
}) => {
  const inverters = invertersData?.inverters?.length
    ? invertersData.inverters
    : DEFAULT_INVERTERS;

  const totalKw =
    invertersData?.totalKw !== undefined
      ? invertersData.totalKw
      : "505.8";

  const machines = machineConsumption?.length
    ? machineConsumption
    : DEFAULT_MACHINE_CONSUMPTION;

  const utilities = utilityConsumption?.length
    ? utilityConsumption
    : DEFAULT_UTILITY_CONSUMPTION;

  return (
    <View style={styles.container}>
      {/* ── 1. Solar Inverters Card ────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.card}
        activeOpacity={onPressSolarInverters ? 0.75 : 1}
        onPress={onPressSolarInverters}
        disabled={!onPressSolarInverters}
      >
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <SolarPanelIcon />
            </View>
            <Text style={styles.cardTitle}>Solar Inverters</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.totalBadge}>
              <Text style={styles.totalLabel}>Total </Text>
              <Text style={styles.totalValue}>
                {typeof totalKw === "number" ? `${totalKw.toFixed(1)} kW` : `${totalKw} kW`}
              </Text>
            </View>
            {onPressSolarInverters && (
              <View style={styles.editActionBtn}>
                <Edit3 size={15} color="#2563EB" />
              </View>
            )}
          </View>
        </View>

        <View style={styles.invertersRow}>
          {inverters.map((inv, idx) => (
            <React.Fragment key={inv.name || idx}>
              <View style={styles.inverterCol}>
                <Text style={styles.inverterName}>{inv.name}</Text>
                <Text style={styles.inverterKw}>
                  {typeof inv.kw === "number" ? `${inv.kw.toFixed(1)} kW` : `${inv.kw} kW`}
                </Text>
              </View>
              {idx < inverters.length - 1 && <View style={styles.verticalDivider} />}
            </React.Fragment>
          ))}
        </View>
      </TouchableOpacity>

      {/* ── 2. Machine Consumption Card ───────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <Settings size={22} color="#2563EB" fill="#2563EB" />
            </View>
            <Text style={styles.cardTitle}>Machine Consumption</Text>
          </View>
        </View>

        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.colProduct]}>Product</Text>
            <Text style={[styles.tableHeaderText, styles.colKwh]}>kWh</Text>
            <Text style={[styles.tableHeaderText, styles.colHrs]}>Hrs.</Text>
          </View>

          {/* Table Body */}
          {machines.map((row, idx) => (
            <View
              key={`${row.product}-${idx}`}
              style={[
                styles.tableRow,
                idx === machines.length - 1 && styles.tableRowLast,
              ]}
            >
              <Text style={[styles.tableCellProduct, styles.colProduct]}>
                {row.product}
              </Text>
              <Text style={[styles.tableCellKwh, styles.colKwh]}>
                {typeof row.kwh === "number" ? row.kwh.toLocaleString("en-IN") : row.kwh}
              </Text>
              <Text style={[styles.tableCellHrs, styles.colHrs]}>
                {row.hours}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 3. Utility Consumption Card ───────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <Zap size={22} color="#2563EB" fill="#2563EB" />
            </View>
            <Text style={styles.cardTitle}>Utility Consumption</Text>
          </View>
        </View>

        <View style={styles.tableContainer}>
          {/* Table Header */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderText, styles.colProduct]}>Product</Text>
            <Text style={[styles.tableHeaderText, styles.colKwh]}>kWh</Text>
            <Text style={[styles.tableHeaderText, styles.colHrs]}>Hrs.</Text>
          </View>

          {/* Table Body */}
          {utilities.map((row, idx) => (
            <View
              key={`${row.product}-${idx}`}
              style={[
                styles.tableRow,
                idx === utilities.length - 1 && styles.tableRowLast,
              ]}
            >
              <Text style={[styles.tableCellProduct, styles.colProduct]}>
                {row.product}
              </Text>
              <Text style={[styles.tableCellKwh, styles.colKwh]}>
                {typeof row.kwh === "number" ? row.kwh.toLocaleString("en-IN") : row.kwh}
              </Text>
              <Text style={[styles.tableCellHrs, styles.colHrs]}>
                {row.hours}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── 4. Footer Note matching reference image ───────────────────────── */}
      <View style={styles.footerNoteRow}>
        <View style={styles.footerNoteLeft}>
          <Info size={16} color="#64748B" style={{ marginRight: 6 }} />
          <Text style={styles.footerNoteText}>
            All values are accumulated for the selected period.
          </Text>
        </View>
        <View style={styles.footerDivider} />
        <View style={styles.footerPfRight}>
          <Text style={styles.footerPfLabel}>Main Meter PF </Text>
          <Text style={styles.footerPfValue}>{mainMeterPf}</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  totalBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  totalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  totalValue: {
    fontSize: 15,
    fontWeight: "900",
    color: "#2563EB",
    letterSpacing: -0.2,
  },
  // Inverters Row
  invertersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  inverterCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inverterName: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 6,
  },
  inverterKw: {
    fontSize: 18,
    fontWeight: "900",
    color: "#2563EB",
    letterSpacing: -0.4,
  },
  verticalDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#E2E8F0",
  },
  // Table Styling
  tableContainer: {
    borderRadius: 10,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F7FF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#475569",
  },
  colProduct: {
    flex: 1.5,
    textAlign: "left",
  },
  colKwh: {
    flex: 1.2,
    textAlign: "center",
  },
  colHrs: {
    flex: 1,
    textAlign: "right",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  tableCellProduct: {
    fontSize: 14.5,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.1,
  },
  tableCellKwh: {
    fontSize: 16,
    fontWeight: "900",
    color: "#2563EB",
    textAlign: "center",
    letterSpacing: -0.2,
  },
  tableCellHrs: {
    fontSize: 14.5,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "right",
  },
  // Footer Note
  footerNoteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 8,
  },
  footerNoteLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  footerNoteText: {
    fontSize: 11.5,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 16,
    flex: 1,
  },
  footerDivider: {
    width: 1,
    height: 18,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 8,
  },
  footerPfRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerPfLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#475569",
  },
  footerPfValue: {
    fontSize: 14.5,
    fontWeight: "900",
    color: "#0F172A",
  },
});
