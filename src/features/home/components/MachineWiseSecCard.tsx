/**
 * MachineWiseSecCard.tsx
 * ----------------------------------------------------------------------------
 * Machine-wise Specific Energy Consumption (SEC) card section on the Home Dashboard.
 *
 * Requirements:
 *  1. Header with blue 8-petal rosette icon, "Machine-wise SEC", and pill badge:
 *     "{count} Machines ⓘ"
 *  2. DID Filtering:
 *     - Fetches from GET /sec-machine-overview and /sec-config
 *     - Displays only machines with production line identifiers (X and R),
 *       deduplicated by normalized DID, with no top-3 limit
 *  3. Sorting:
 *     - Machines with actual SEC data for the selected period first (numeric 0 is data)
 *     - Machines with entirely null/missing SEC data last (runtime alone != SEC data)
 *  4. Sourcing:
 *     - SEC metrics from KPI microservice /sec-machine-overview
 *     - Productive runtime mapped by exact DID from favorite machines
 *  5. 8-tile card layout per machine matching exact UI specifications:
 *     - Target Production, Target Cost/{unit}
 *     - Energy Consumption, Production Runtime
 *     - Primary Production, Secondary Production
 *     - Wastage, Machine Cost/{unit}
 * ----------------------------------------------------------------------------
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { Info } from "lucide-react-native";
import { CONFIG } from "../../../config/constants";
import { formatIndianNumber } from "../../../utils/secUtils";

export interface MachineSecData {
  did: string;
  name: string;
  primaryUnit?: string;
  secondaryUnit?: string;
  primaryProductionQtyEntered?: number | null;
  secondaryProductionQtyEntered?: number | null;
  wastageQty?: number | null;
  totalProductionQty?: number | null;
  machineEnergy?: number | null;
  secPerProductionUnit?: number | null;
  costPerProductionUnit?: number | null;
  targetProduction?: number | null;
  targetCost?: number | null;
  productionRuntimeHours?: number | null;
  logCount?: number;
  productCount?: number;
  [key: string]: any;
}

interface MachineWiseSecCardProps {
  machines: MachineSecData[];
  loading?: boolean;
  onPressMachine?: (machine: MachineSecData) => void;
  onPressInfo?: () => void;
}

/** Formats hours into `${hrs} hrs ${mins} mins` matching the screenshot */
export function formatRuntimeHours(hoursVal: number | null | undefined): string {
  if (hoursVal == null || !Number.isFinite(Number(hoursVal)) || Number(hoursVal) <= 0) {
    return "0 hrs 0 mins";
  }
  const h = Number(hoursVal);
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs} hrs ${mins} mins`;
}

/** Determines if a machine has genuine SEC data for the date range (numeric 0 is valid data) */
export function hasActualSecData(m: MachineSecData): boolean {
  const isNumeric = (val: any) =>
    val !== null && val !== undefined && val !== "" && Number.isFinite(Number(val));

  if (isNumeric(m.primaryProductionQtyEntered)) return true;
  if (isNumeric(m.secondaryProductionQtyEntered)) return true;
  if (isNumeric(m.wastageQty)) return true;
  if (isNumeric(m.totalProductionQty)) return true;
  if (isNumeric(m.machineEnergy)) return true;
  if (isNumeric(m.secPerProductionUnit)) return true;
  if (isNumeric(m.costPerProductionUnit)) return true;
  if (Number(m.logCount) > 0) return true;
  return false;
}

/** Filters production machines matching X and R identifiers (excluding utility T/M) */
export function isSecProductionDid(rawDid: string): boolean {
  if (!rawDid) return false;
  const d = String(rawDid).trim().toUpperCase();
  return d.includes("X") || d.includes("R");
}

function formatMetricVal(val: any, decimals = 3): string {
  return formatIndianNumber(val, decimals);
}

export const MachineWiseSecCard: React.FC<MachineWiseSecCardProps> = ({
  machines,
  loading = false,
  onPressMachine,
  onPressInfo,
}) => {
  // 1. Filter only production machines (DID containing X or R) and deduplicate by normalized DID
  const filteredAndSortedMachines = useMemo(() => {
    const byDid = new Map<string, MachineSecData>();

    (machines || []).forEach((m) => {
      const normDid = String(m?.did || "").trim().toUpperCase();
      if (!normDid) return;
      if (!isSecProductionDid(normDid)) return;

      if (!byDid.has(normDid)) {
        byDid.set(normDid, { ...m, did: normDid });
      } else {
        // Merge if additional fields exist
        const existing = byDid.get(normDid)!;
        byDid.set(normDid, { ...existing, ...m, did: normDid });
      }
    });

    const list = Array.from(byDid.values());

    // 2. Sort: Machines with actual SEC data first, null/missing data last
    list.sort((a, b) => {
      const aHas = hasActualSecData(a);
      const bHas = hasActualSecData(b);
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      return String(a.name || a.did).localeCompare(String(b.name || b.did));
    });

    return list;
  }, [machines]);

  if (!loading && filteredAndSortedMachines.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.titleGroup}>
          {/* Blue 8-petal rosette icon */}
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <Path
              d="M12 2C13.1 2 14.1 2.6 14.7 3.5C15.8 3.3 16.9 3.8 17.5 4.8C18.4 5.3 18.9 6.3 18.8 7.4C19.8 8.1 20.2 9.3 19.9 10.4C20.6 11.3 20.6 12.7 19.9 13.6C20.2 14.7 19.8 15.9 18.8 16.6C18.9 17.7 18.4 18.7 17.5 19.2C16.9 20.2 15.8 20.7 14.7 20.5C14.1 21.4 13.1 22 12 22C10.9 22 9.9 21.4 9.3 20.5C8.2 20.7 7.1 20.2 6.5 19.2C5.6 18.7 5.1 17.7 5.2 16.6C4.2 15.9 3.8 14.7 4.1 13.6C3.4 12.7 3.4 11.3 4.1 10.4C3.8 9.3 4.2 8.1 5.2 7.4C5.1 6.3 5.6 5.3 6.5 4.8C7.1 3.8 8.2 3.3 9.3 3.5C9.9 2.6 10.9 2 12 2Z"
              fill="#2563EB"
            />
          </Svg>
          <Text style={styles.sectionTitle}>Machine-wise SEC</Text>
        </View>

        {/* Count badge with info icon: "4 Machines ⓘ" */}
        <TouchableOpacity
          style={styles.countBadge}
          activeOpacity={0.7}
          onPress={onPressInfo}
        >
          <Text style={styles.countBadgeText}>
            {filteredAndSortedMachines.length} Machines
          </Text>
          <Info size={13} color="#2563EB" strokeWidth={2.4} style={styles.infoIcon} />
        </TouchableOpacity>
      </View>

      {/* Individual Machine Cards */}
      {filteredAndSortedMachines.map((machine) => {
        const primaryUnit = String(machine.primaryUnit || "kg").trim();
        const secondaryUnit = String(machine.secondaryUnit || "mts").trim();

        const hasEnergy =
          machine.machineEnergy !== null &&
          machine.machineEnergy !== undefined &&
          Number.isFinite(Number(machine.machineEnergy));

        const hasPrimary =
          machine.primaryProductionQtyEntered !== null &&
          machine.primaryProductionQtyEntered !== undefined &&
          Number.isFinite(Number(machine.primaryProductionQtyEntered));

        const hasSecondary =
          machine.secondaryProductionQtyEntered !== null &&
          machine.secondaryProductionQtyEntered !== undefined &&
          Number.isFinite(Number(machine.secondaryProductionQtyEntered));

        const hasWastage =
          machine.wastageQty !== null &&
          machine.wastageQty !== undefined &&
          Number.isFinite(Number(machine.wastageQty));

        const hasMachineCost =
          machine.costPerProductionUnit !== null &&
          machine.costPerProductionUnit !== undefined &&
          Number.isFinite(Number(machine.costPerProductionUnit));

        const hasTargetProd =
          machine.targetProduction !== null &&
          machine.targetProduction !== undefined &&
          Number.isFinite(Number(machine.targetProduction));

        const hasTargetCost =
          machine.targetCost !== null &&
          machine.targetCost !== undefined &&
          Number.isFinite(Number(machine.targetCost));

        return (
          <TouchableOpacity
            key={machine.did}
            style={styles.machineCard}
            activeOpacity={onPressMachine ? 0.75 : 1}
            onPress={() => onPressMachine && onPressMachine(machine)}
          >
            {/* Machine Header */}
            <Text style={styles.machineName} numberOfLines={1}>
              {machine.name || "Primary Machine"}
            </Text>
            <Text style={styles.machineDid}>DID: {machine.did}</Text>

            {/* 8-Tile Metric Grid (2 columns x 4 rows) */}
            <View style={styles.grid}>
              {/* Row 1: Target Production | Target Cost/unit */}
              <View style={styles.row}>
                <View style={[styles.tile, styles.tileGray]}>
                  <Text style={styles.tileLabel}>Target Production</Text>
                  <Text style={[styles.tileValue, styles.valGreenDash]}>
                    {hasTargetProd ? `${formatMetricVal(machine.targetProduction, 3)} ${primaryUnit}` : "—"}
                  </Text>
                </View>

                <View style={[styles.tile, styles.tilePurple]}>
                  <Text style={styles.tileLabel}>Target Cost/{primaryUnit}</Text>
                  <Text style={[styles.tileValue, styles.valPurpleDash]}>
                    {hasTargetCost ? `₹ ${formatMetricVal(machine.targetCost, 2)}` : "—"}
                  </Text>
                </View>
              </View>

              {/* Row 2: Energy Consumption | Production Runtime */}
              <View style={styles.row}>
                <View style={[styles.tile, styles.tileBlue]}>
                  <Text style={styles.tileLabel}>Energy Consumption</Text>
                  <Text style={[styles.tileValue, styles.valBlue]}>
                    {hasEnergy ? `${formatMetricVal(machine.machineEnergy, 1)} kWh` : "—"}
                  </Text>
                </View>

                <View style={[styles.tile, styles.tileGreen]}>
                  <Text style={styles.tileLabel}>Production Runtime</Text>
                  <Text style={[styles.tileValue, styles.valGreen]}>
                    {formatRuntimeHours(machine.productionRuntimeHours)}
                  </Text>
                </View>
              </View>

              {/* Row 3: Primary Production | Secondary Production */}
              <View style={styles.row}>
                <View style={[styles.tile, styles.tileGreenLight]}>
                  <Text style={styles.tileLabel}>Primary Production</Text>
                  <Text style={[styles.tileValue, styles.valGreen]}>
                    {hasPrimary ? `${formatMetricVal(machine.primaryProductionQtyEntered, 3)} ${primaryUnit}` : "—"}
                  </Text>
                </View>

                <View style={[styles.tile, styles.tileGray]}>
                  <Text style={styles.tileLabel}>Secondary Production</Text>
                  <Text style={[styles.tileValue, styles.valSlate]}>
                    {hasSecondary ? `${formatMetricVal(machine.secondaryProductionQtyEntered, 3)} ${secondaryUnit}` : "—"}
                  </Text>
                </View>
              </View>

              {/* Row 4: Wastage | Machine Cost/unit */}
              <View style={styles.row}>
                <View style={[styles.tile, styles.tileOrange]}>
                  <Text style={styles.tileLabel}>Wastage</Text>
                  <Text style={[styles.tileValue, styles.valOrange]}>
                    {hasWastage ? `${formatMetricVal(machine.wastageQty, 3)} ${primaryUnit}` : "—"}
                  </Text>
                </View>

                <View style={[styles.tile, styles.tilePink]}>
                  <Text style={styles.tileLabel}>Machine Cost/{primaryUnit}</Text>
                  <Text style={[styles.tileValue, styles.valPinkDash]}>
                    {hasMachineCost ? `₹ ${formatMetricVal(machine.costPerProductionUnit, 2)}` : "—"}
                  </Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  countBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 4.5,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2563EB",
  },
  infoIcon: {
    marginLeft: 4,
  },
  machineCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  machineName: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  machineDid: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 14,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 11,
    minHeight: 58,
    justifyContent: "space-between",
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 4,
  },
  tileValue: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  // Color Variants
  tileGray: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  tilePurple: {
    backgroundColor: "#FAF5FF",
    borderColor: "#F3E8FF",
  },
  tileBlue: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
  },
  tileGreen: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  tileGreenLight: {
    backgroundColor: "#F0FDF4",
    borderColor: "#DCFCE7",
  },
  tileOrange: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FFEDD5",
  },
  tilePink: {
    backgroundColor: "#FDF2F8",
    borderColor: "#FCE7F3",
  },
  // Text Colors
  valGreenDash: {
    color: "#059669",
    fontWeight: "900",
    fontSize: 16,
  },
  valPurpleDash: {
    color: "#9333EA",
    fontWeight: "900",
    fontSize: 16,
  },
  valBlue: {
    color: "#2563EB",
  },
  valGreen: {
    color: "#16A34A",
  },
  valSlate: {
    color: "#334155",
  },
  valOrange: {
    color: "#EA580C",
  },
  valPinkDash: {
    color: "#DB2777",
    fontWeight: "900",
    fontSize: 16,
  },
});
