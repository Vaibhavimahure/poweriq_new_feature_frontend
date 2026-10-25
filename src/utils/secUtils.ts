/**
 * secUtils.ts
 * ----------------------------------------------------------------------------
 * Shared calculation and extraction utilities for Product-wise and
 * Machine-wise Specific Energy Consumption (SEC) features.
 * Matches the Web Dashboard formulas, band prioritization, and null handling.
 * ----------------------------------------------------------------------------
 */

/**
 * Extracts configured Primary Machine devices from a product object.
 * Authoritative Web Dashboard mapping: product.selectedLtDevices.
 * Preserves compatibility fallbacks for primaryDevices and devices.
 */
export function getPrimaryDevices(product: any): any[] {
  const candidates = [
    product?.selectedLtDevices,
    product?.selected_lt_devices,
    product?.primaryDevices,
    product?.primary_devices,
    product?.devices,
  ];

  const found = candidates.find((arr) => Array.isArray(arr) && arr.length > 0) || [];
  return found.filter((d: any) => d?.isActive !== false && String(d?.did || "").trim());
}

/**
 * Extracts normalized, unique Primary Machine DIDs from a product.
 */
export function getPrimaryDids(product: any): string[] {
  const devices = getPrimaryDevices(product);
  const seen = new Set<string>();
  const dids: string[] = [];

  devices.forEach((d) => {
    const did = String(d?.did || "").trim().toUpperCase();
    if (did && !seen.has(did)) {
      seen.add(did);
      dids.push(did);
    }
  });

  return dids;
}

/**
 * Parses Primary Machine Efficient Run Time (full_load) from a favorite machine card
 * or runtime breakdown object.
 *
 * Precedence matches Web Dashboard CostDashboardPage.jsx:
 * 1. runtime.current.bands (item.id === 'full_load') -> runtimeMinutes / 60 or runtimeHours
 * 2. runtime.bands (item.id === 'full_load')
 * 3. Flat fullLoadHours fields (current.fullLoadHours, runtime.fullLoadHours, etc.)
 * 4. Flat efficientHours fallback
 *
 * Returns null if not found or invalid; preserves valid 0.
 */
export function parseEfficientRunTimeHours(favOrRuntime: any): number | null {
  if (!favOrRuntime) return null;

  const runtime = favOrRuntime.runtime || favOrRuntime.runtimeBreakdown || favOrRuntime;
  const current = runtime?.current || {};

  const bandCandidates = [
    current?.bands,
    current?.loadAnalysis,
    runtime?.bands,
    runtime?.loadAnalysis,
  ];
  const bands = bandCandidates.find((c) => Array.isArray(c) && c.length > 0) || [];

  // 1. Search bands array for 'full_load' (Web Dashboard precedence)
  const fullLoadBand = bands.find((b: any) => {
    const key = String(b?.id || b?.key || b?.name || b?.label || b?.type || "")
      .trim()
      .toLowerCase();
    return key === "full_load" || key === "full load" || key === "efficient";
  });

  if (fullLoadBand) {
    if (fullLoadBand.runtimeMinutes !== undefined && fullLoadBand.runtimeMinutes !== null) {
      const mins = Number(fullLoadBand.runtimeMinutes);
      if (Number.isFinite(mins) && mins >= 0) return mins / 60;
    }
    const hrs = Number(
      fullLoadBand.runtimeHours ?? fullLoadBand.hours ?? fullLoadBand.value
    );
    if (Number.isFinite(hrs) && hrs >= 0) return hrs;
  }

  // 2. Search flat candidates
  const flatCandidates = [
    current?.fullLoadHours,
    current?.full_load_hours,
    current?.efficientHours,
    current?.efficient_hours,
    runtime?.fullLoadHours,
    runtime?.full_load_hours,
    runtime?.efficientHours,
    runtime?.efficient_hours,
    favOrRuntime?.fullLoadHours,
    favOrRuntime?.efficientHours,
  ];

  for (const val of flatCandidates) {
    if (val !== undefined && val !== null && val !== "") {
      const num = Number(val);
      if (Number.isFinite(num) && num >= 0) return num;
    }
  }

  return null;
}

/**
 * Formats decimal hours into a readable string: "${hrs} hrs ${mins} mins".
 * Returns "0 hrs 0 mins" for zero or null values.
 */
export function formatRuntimeHours(hoursVal: number | null | undefined): string {
  if (hoursVal == null || !Number.isFinite(Number(hoursVal)) || Number(hoursVal) <= 0) {
    return "0 hrs 0 mins";
  }
  const h = Number(hoursVal);
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs} hrs ${mins} mins`;
}

/**
 * Formats a number with Indian grouping (e.g. 23,06,550.000, 29,567.9, 57,234.070).
 * Preserves decimals, handles negative values, valid zero, and returns "—" for null/undefined/empty.
 * Hermes and React Native safe with regex fallback.
 */
export function formatIndianNumber(val: any, decimals = 3): string {
  if (val === null || val === undefined || val === "") return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return "—";

  try {
    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(num);
  } catch {
    const parts = num.toFixed(decimals).split(".");
    let intPart = parts[0];
    const decPart = parts.length > 1 ? `.${parts[1]}` : "";
    const isNegative = intPart.startsWith("-");
    if (isNegative) intPart = intPart.slice(1);

    const lastThree = intPart.slice(-3);
    const otherNumbers = intPart.slice(0, -3);
    const formatted =
      otherNumbers.length > 0
        ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
        : lastThree;

    return (isNegative ? "-" : "") + formatted + decPart;
  }
}

/**
 * Standard Indian-format number formatter for metric values.
 * Returns "—" for null or undefined.
 */
export function formatNum(v: any, decimals = 2): string {
  return formatIndianNumber(v, decimals);
}

/**
 * Parses numeric target value safely.
 * Returns null for null, undefined, empty string "", or whitespace string "  ".
 * Preserves genuine 0 or positive numbers.
 */
function parseTargetValue(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "string" && val.trim() === "") return null;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Extracts raw configured Target Production from dynamic target API response,
 * product configuration, or summary.
 * Returns null if unconfigured/unavailable; preserves genuine configured numeric value (including 0).
 */
export function getProductTargetProduction(
  product: any,
  metric?: any,
  target?: any
): number | null {
  const candidates = [
    target?.targetProduction,
    target?.productionTarget,
    target?.target_production,
    target?.production_target,
    product?.targetProduction,
    product?.productionTarget,
    product?.target_production,
    product?.production_target,
    product?.targetQty,
    product?.target_qty,
    metric?.targetProduction,
    metric?.productionTarget,
    product?.summary?.targetProduction,
    product?.summary?.productionTarget,
  ];

  for (const c of candidates) {
    const parsed = parseTargetValue(c);
    if (parsed !== null) return parsed;
  }

  // Frontend calculation fallback if SEC target benchmark and total energy exist
  const secTarget = Number(product?.secTarget ?? product?.sec_target);
  const tec = Number(metric?.tec ?? metric?.totalEnergy ?? product?.summary?.tec);
  if (Number.isFinite(secTarget) && secTarget > 0 && Number.isFinite(tec) && tec > 0) {
    return tec / secTarget;
  }

  return null;
}

/**
 * Extracts raw configured Target Cost from dynamic target API response,
 * computed totalCost / targetProduction (Web logic), or product configuration.
 * Returns null if unconfigured/unavailable; preserves genuine configured numeric value (including 0).
 */
export function getProductTargetCost(
  product: any,
  metric?: any,
  target?: any
): number | null {
  // 1. Direct targetCostPerUnit from target object
  const directTargetCost = parseTargetValue(
    target?.targetCostPerUnit ?? target?.targetCost ?? target?.costTarget
  );
  if (directTargetCost !== null) return directTargetCost;

  // 2. Computed from totalCost / targetProduction (Web Dashboard formula)
  const targetProd = getProductTargetProduction(product, metric, target);
  const totalCost = Number(
    metric?.totalCost ??
      product?.summary?.totalCost ??
      metric?.cost ??
      product?.summary?.cost
  );
  if (
    targetProd !== null &&
    targetProd > 0 &&
    Number.isFinite(totalCost) &&
    totalCost >= 0
  ) {
    return totalCost / targetProd;
  }

  // 3. Static configuration fallbacks
  const candidates = [
    product?.targetCost,
    product?.energyCostPerUnitTarget,
    product?.costTarget,
    product?.target_cost,
    product?.cost_target,
    product?.targetCostPerUnit,
    product?.target_cost_per_unit,
    metric?.targetCost,
    metric?.energyCostPerUnitTarget,
    product?.summary?.targetCost,
    product?.summary?.energyCostPerUnitTarget,
  ];

  for (const c of candidates) {
    const parsed = parseTargetValue(c);
    if (parsed !== null) return parsed;
  }

  return null;
}

/**
 * Formats Target Production display value.
 * Matches Web Dashboard: 3 decimal places using Indian numbering.
 * If target is unavailable / null, defaults to "0.000" in display layer while preserving raw null in data.
 */
export function formatTargetProduction(rawTarget: number | null | undefined): string {
  if (rawTarget === null || rawTarget === undefined) return "0.000";
  const val = Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : 0;
  return formatIndianNumber(val, 3);
}

/**
 * Formats Target Cost display value.
 * Matches Web Dashboard: 2 decimal places with currency symbol ₹.
 * If target is unavailable / null, defaults to "₹0.00" in display layer while preserving raw null in data.
 */
export function formatTargetCost(rawTarget: number | null | undefined): string {
  if (rawTarget === null || rawTarget === undefined) return "₹0.00";
  const val = Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : 0;
  return `₹${formatIndianNumber(val, 2)}`;
}

/**
 * Reproduces Web Dashboard metricFromSummary() from index.jsx lines 492-548.
 * Safely aggregates product history summary metrics.
 */
export function metricFromSummary(summary: any, latestLog: any = null): any {
  const logCount = Number(summary?.logCount) || 0;
  if (!summary || logCount <= 0) {
    return {
      status: "no-log",
      logCount: 0,
      qtyProduced: null,
      primaryProductionQtyEntered: null,
      secondaryProductionQtyEntered: null,
      wastageQty: null,
      totalEnergy: null,
      tec: null,
      totalCost: null,
      costPerProductionUnit: null,
      secPerProductionUnit: null,
    };
  }

  const primaryProductionQtyEntered =
    summary.primaryProductionQtyEntered ?? summary.productionQtyEntered ?? summary.qtyProduced ?? null;
  const secondaryProductionQtyEntered = summary.secondaryProductionQtyEntered ?? 0;
  const totalProductionQty = summary.totalProductionQty ?? summary.qtyProduced ?? null;
  const wastageQty = summary.wastageQty ?? 0;
  const totalEnergy = summary.tec ?? summary.totalEnergy ?? null;
  const totalCost = summary.totalCost ?? null;

  const costPerProductionUnit =
    summary.costPerProductionUnit ??
    summary.costPerUnit ??
    (primaryProductionQtyEntered && totalCost && Number(primaryProductionQtyEntered) > 0
      ? Number(totalCost) / Number(primaryProductionQtyEntered)
      : null);

  const secPerProductionUnit = summary.secPerProductionUnit ?? summary.sec ?? null;

  return {
    status: "ready",
    logCount,
    qtyProduced: summary.qtyProduced ?? null,
    productionQtyEntered: summary.productionQtyEntered ?? null,
    primaryProductionQtyEntered,
    secondaryProductionQtyEntered,
    totalProductionQty,
    wastageQty,
    grossProductionQty: summary.grossProductionQty ?? null,
    totalEnergy,
    tec: totalEnergy,
    totalCost,
    sec: secPerProductionUnit,
    secPerProductionUnit,
    costPerUnit: costPerProductionUnit,
    costPerProductionUnit,
    productionDate: latestLog?.productionDate ?? null,
  };
}

/**
 * Executes async task for all items with bounded concurrency.
 * Matches Web Dashboard mapWithConcurrency implementation.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!items.length) return [];
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: limit }, () => worker());
  await Promise.all(workers);
  return results;
}
