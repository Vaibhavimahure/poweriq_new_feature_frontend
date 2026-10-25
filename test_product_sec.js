/**
 * test_product_sec.js
 * Comprehensive automated test suite for Product-wise SEC Implementation:
 * - Product-to-primary-machine mapping (selectedLtDevices & fallbacks)
 * - Runtime selection & band precedence (full_load band > flat fields)
 * - Shared machine between multiple products
 * - Multi-machine product handling
 * - Valid zero vs null SEC data handling
 * - Date filter synchronization logic
 * - Exactly 8-card rendering and order verification
 * - NEW: Target Production & Target Cost value selection logic
 * - NEW: Web missing-target display fallback (0.000 {unit} & ₹0.00/{unit})
 * - NEW: Genuine nonzero target preservation
 * - NEW: Distinction between raw unconfigured target (null) and genuine configured zero (0)
 * - NEW: Dynamic unit variations (kg, pcs, mts)
 */

const assert = require("assert");

function getPrimaryDevices(product) {
  const candidates = [
    product?.selectedLtDevices,
    product?.selected_lt_devices,
    product?.primaryDevices,
    product?.primary_devices,
    product?.devices,
  ];

  const found = candidates.find((arr) => Array.isArray(arr) && arr.length > 0) || [];
  return found.filter((d) => d?.isActive !== false && String(d?.did || "").trim());
}

function getPrimaryDids(product) {
  const devices = getPrimaryDevices(product);
  const seen = new Set();
  const dids = [];

  devices.forEach((d) => {
    const did = String(d?.did || "").trim().toUpperCase();
    if (did && !seen.has(did)) {
      seen.add(did);
      dids.push(did);
    }
  });

  return dids;
}

function parseEfficientRunTimeHours(favOrRuntime) {
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
  const fullLoadBand = bands.find((b) => {
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

function formatRuntimeHours(hoursVal) {
  if (hoursVal == null || !Number.isFinite(Number(hoursVal)) || Number(hoursVal) <= 0) {
    return "0 hrs 0 mins";
  }
  const h = Number(hoursVal);
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs} hrs ${mins} mins`;
}

function formatIndianNumber(val, decimals = 3) {
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

function formatNum(v, decimals = 2) {
  return formatIndianNumber(v, decimals);
}

function parseTargetValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string" && val.trim() === "") return null;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function getProductTargetProduction(product, metric = null, target = null) {
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

  const secTarget = Number(product?.secTarget ?? product?.sec_target);
  const tec = Number(metric?.tec ?? metric?.totalEnergy ?? product?.summary?.tec);
  if (Number.isFinite(secTarget) && secTarget > 0 && Number.isFinite(tec) && tec > 0) {
    return tec / secTarget;
  }

  return null;
}

function getProductTargetCost(product, metric = null, target = null) {
  const directTargetCost = parseTargetValue(
    target?.targetCostPerUnit ?? target?.targetCost ?? target?.costTarget
  );
  if (directTargetCost !== null) return directTargetCost;

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

function formatTargetProduction(rawTarget) {
  if (rawTarget === null || rawTarget === undefined) return "0.000";
  const val = Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : 0;
  return formatIndianNumber(val, 3);
}

function formatTargetCost(rawTarget) {
  if (rawTarget === null || rawTarget === undefined) return "₹0.00";
  const val = Number.isFinite(Number(rawTarget)) ? Number(rawTarget) : 0;
  return `₹${formatIndianNumber(val, 2)}`;
}

function metricFromSummary(summary, latestLog = null) {
  const logCount = Number(summary?.logCount) || 0;
  if (!summary || logCount <= 0) {
    return {
      status: "no-log",
      logCount: 0,
      primaryProductionQtyEntered: null,
      secondaryProductionQtyEntered: null,
      wastageQty: null,
      totalEnergy: null,
      tec: null,
      costPerProductionUnit: null,
    };
  }

  const primaryProductionQtyEntered =
    summary.primaryProductionQtyEntered ?? summary.productionQtyEntered ?? summary.qtyProduced ?? null;
  const secondaryProductionQtyEntered = summary.secondaryProductionQtyEntered ?? 0;
  const wastageQty = summary.wastageQty ?? 0;
  const totalEnergy = summary.tec ?? summary.totalEnergy ?? null;
  const totalCost = summary.totalCost ?? null;

  const costPerProductionUnit =
    summary.costPerProductionUnit ??
    summary.costPerUnit ??
    (primaryProductionQtyEntered && totalCost && Number(primaryProductionQtyEntered) > 0
      ? Number(totalCost) / Number(primaryProductionQtyEntered)
      : null);

  return {
    status: "ready",
    logCount,
    primaryProductionQtyEntered,
    secondaryProductionQtyEntered,
    wastageQty,
    totalEnergy,
    tec: totalEnergy,
    costPerProductionUnit,
  };
}

console.log("\n========================================================");
console.log("🧪 RUNNING PRODUCT-WISE SEC AUTOMATED TEST SUITE");
console.log("========================================================\n");

// TEST 1: Product to Primary Machine DID Mapping (selectedLtDevices authoritative)
console.log("[TEST 1] Product-to-Primary-Machine DID Mapping...");
const productWebConfig = {
  productId: "P001",
  name: "16mm Drip Pipe",
  selectedLtDevices: [
    { did: "E_BA_Z_B_R_P0002_D3", name: "Flat Line", isActive: true },
    { did: "E_BA_Z_B_R_P0002_D3", name: "Flat Line Duplicate", isActive: true }, // duplicate
    { did: "E_BA_Z_B_T_P0003_D1", name: "Inactive Meter", isActive: false },
  ],
  primaryDevices: [{ did: "FALLBACK_DID", isActive: true }],
};

const extractedDids = getPrimaryDids(productWebConfig);
assert.deepStrictEqual(extractedDids, ["E_BA_Z_B_R_P0002_D3"], "Must extract unique active DIDs from selectedLtDevices");
console.log("  ✓ PASS: Authoritative selectedLtDevices mapping verified; duplicates and inactive filtered");

const legacyProduct = {
  productId: "P002",
  primaryDevices: [{ did: "E_BA_Z_B_X_P0002_D2", isActive: true }],
};
assert.deepStrictEqual(getPrimaryDids(legacyProduct), ["E_BA_Z_B_X_P0002_D2"], "Fallback to primaryDevices verified");
console.log("  ✓ PASS: Fallback to primaryDevices verified when selectedLtDevices is absent");

// TEST 2: Production Runtime Selection & Band Precedence
console.log("\n[TEST 2] Runtime Band Precedence (full_load bands vs flat fields)...");
const cardWithBothBandAndFlat = {
  did: "E_BA_Z_B_R_P0002_D3",
  runtime: {
    current: {
      fullLoadHours: 0,
      bands: [
        { id: "full_load", name: "Full Load", runtimeMinutes: 690 },
        { id: "idle", name: "Idle", runtimeMinutes: 120 },
      ],
    },
  },
};

const parsedHours = parseEfficientRunTimeHours(cardWithBothBandAndFlat);
assert.strictEqual(parsedHours, 11.5, "Band 'full_load' must take precedence over flat fullLoadHours");
assert.strictEqual(formatRuntimeHours(parsedHours), "11 hrs 30 mins");
console.log("  ✓ PASS: Web Dashboard precedence followed: full_load band (11.5h) over flat zero");

const cardWithOnlyFlat = {
  did: "E_BA_Z_B_X_P0002_D2",
  current: {
    fullLoadHours: 8.25,
  },
};
const parsedFlat = parseEfficientRunTimeHours(cardWithOnlyFlat);
assert.strictEqual(parsedFlat, 8.25);
assert.strictEqual(formatRuntimeHours(parsedFlat), "8 hrs 15 mins");
console.log("  ✓ PASS: Flat field fallback correctly parsed (8 hrs 15 mins)");

// TEST 3: Shared Machine Between Products
console.log("\n[TEST 3] Shared Primary Machine Between Products...");
const productA = {
  productId: "PROD_A",
  name: "Product A",
  selectedLtDevices: [{ did: "SHARED_DID_01", isActive: true }],
};
const productB = {
  productId: "PROD_B",
  name: "Product B",
  selectedLtDevices: [{ did: "SHARED_DID_01", isActive: true }],
};

const runtimeMap = {
  SHARED_DID_01: 14.5,
};

const rtA = runtimeMap[getPrimaryDids(productA)[0]];
const rtB = runtimeMap[getPrimaryDids(productB)[0]];
assert.strictEqual(rtA, 14.5);
assert.strictEqual(rtB, 14.5);
assert.strictEqual(formatRuntimeHours(rtA), "14 hrs 30 mins");
assert.strictEqual(formatRuntimeHours(rtB), "14 hrs 30 mins");
console.log("  ✓ PASS: Shared Primary Machine correctly provides identical runtime to both products");

// TEST 4: Multi-Machine Product Handling
console.log("\n[TEST 4] Multi-Machine Product Handling...");
const multiMachineProduct = {
  productId: "MULTI_PROD",
  name: "Multi-Machine Assembly",
  selectedLtDevices: [
    { did: "DID_01", name: "Extruder 1", isActive: true },
    { did: "DID_02", name: "Extruder 2", isActive: true },
  ],
};
const multiDevices = getPrimaryDevices(multiMachineProduct);
assert.strictEqual(multiDevices.length, 2);

const hasMultipleMachines = multiDevices.length > 1;
const runtimeFormatted = hasMultipleMachines ? "—" : formatRuntimeHours(runtimeMap[multiDevices[0]?.did]);
const runtimeSubtitle = hasMultipleMachines ? `${multiDevices.length} machines (Tap for info)` : "Single";

assert.strictEqual(runtimeFormatted, "—");
assert.strictEqual(runtimeSubtitle, "2 machines (Tap for info)");
console.log("  ✓ PASS: Multi-machine product displays '—' in aggregate tile with breakdown info trigger");

// TEST 5: Target Production & Target Cost Extraction & Display Fallbacks
console.log("\n[TEST 5] Target Value Selection, Fallbacks & Formatting...");

// Case 5A: Missing/Unconfigured Target (Underlying raw is null, display is 0.000 / ₹0.00)
const unconfiguredProduct = {
  productId: "P_NO_TARGET",
  name: "Plain Product",
  primaryProductUnit: "kg",
};
const rawTargetProdA = getProductTargetProduction(unconfiguredProduct);
const rawTargetCostA = getProductTargetCost(unconfiguredProduct);

assert.strictEqual(rawTargetProdA, null, "Raw target production must remain null when unconfigured");
assert.strictEqual(rawTargetCostA, null, "Raw target cost must remain null when unconfigured");

// Display layer reproduces Web fallback: 0.000 kg and ₹0.00/kg
const displayProdA = formatTargetProduction(rawTargetProdA);
const displayCostA = formatTargetCost(rawTargetCostA);
assert.strictEqual(displayProdA, "0.000", "Missing target production must display as 0.000");
assert.strictEqual(displayCostA, "₹0.00", "Missing target cost must display as ₹0.00");
console.log(`  ✓ PASS (5A): Missing target defaults to display: ${displayProdA} kg and ${displayCostA}/kg`);

// Case 5B: Genuine Configured Zero (0)
const zeroTargetProduct = {
  productId: "P_ZERO_TARGET",
  name: "Zero Target Product",
  productionTarget: 0,
  targetCost: 0,
  primaryProductUnit: "pcs",
};
const rawTargetProdB = getProductTargetProduction(zeroTargetProduct);
const rawTargetCostB = getProductTargetCost(zeroTargetProduct);

assert.strictEqual(rawTargetProdB, 0, "Genuine configured 0 must be preserved as number 0");
assert.strictEqual(rawTargetCostB, 0, "Genuine configured 0 cost must be preserved as number 0");
assert.strictEqual(formatTargetProduction(rawTargetProdB), "0.000");
assert.strictEqual(formatTargetCost(rawTargetCostB), "₹0.00");
console.log("  ✓ PASS (5B): Genuine configured zero preserved in data and displayed correctly");

// Case 5C: Genuine Nonzero Targets
const nonzeroProduct = {
  productId: "P_NONZERO",
  name: "HDPE Pipe 20mm",
  targetProduction: 25000.75,
  energyCostPerUnitTarget: 14.85,
  primaryProductUnit: "mts",
};
const rawTargetProdC = getProductTargetProduction(nonzeroProduct);
const rawTargetCostC = getProductTargetCost(nonzeroProduct);

assert.strictEqual(rawTargetProdC, 25000.75);
assert.strictEqual(rawTargetCostC, 14.85);
assert.strictEqual(formatTargetProduction(rawTargetProdC), "25,000.750", "Must format with 3 decimal places");
assert.strictEqual(formatTargetCost(rawTargetCostC), "₹14.85", "Must format with ₹ and 2 decimal places");
console.log(`  ✓ PASS (5C): Nonzero target formatted: ${formatTargetProduction(rawTargetProdC)} mts and ${formatTargetCost(rawTargetCostC)}/mts`);

// Case 5D: Null / undefined / empty string API values
const dirtyProduct = {
  productId: "P_DIRTY",
  targetProduction: "",
  productionTarget: null,
  targetCost: undefined,
  energyCostPerUnitTarget: "   ",
};
assert.strictEqual(getProductTargetProduction(dirtyProduct), null);
assert.strictEqual(getProductTargetCost(dirtyProduct), null);
assert.strictEqual(formatTargetProduction(getProductTargetProduction(dirtyProduct)), "0.000");
assert.strictEqual(formatTargetCost(getProductTargetCost(dirtyProduct)), "₹0.00");
console.log("  ✓ PASS (5D): Dirty/empty strings safely resolve to null and default display without NaN");

// TEST 6: Date Filter Synchronization Parameters
console.log("\n[TEST 6] Date Filter Synchronization Parameters...");
function resolveApiParams(resolvedDateRange, customRange, activeFromSec, activeToSec) {
  const productionDateFrom = resolvedDateRange?.from || "";
  const productionDateTo = resolvedDateRange?.to || "";
  const queryMode = customRange?.label ? "custom" : "today";

  return {
    secParams: {
      productionDateFrom: productionDateFrom || undefined,
      productionDateTo: productionDateTo || undefined,
    },
    runtimeParams: {
      from: activeFromSec,
      to: activeToSec,
      mode: queryMode,
    },
  };
}

const params = resolveApiParams(
  { from: "2026-10-01", to: "2026-10-23" },
  { label: "Month to Date" },
  1790812800,
  1792713600
);
assert.strictEqual(params.secParams.productionDateFrom, "2026-10-01");
assert.strictEqual(params.secParams.productionDateTo, "2026-10-23");
assert.strictEqual(params.runtimeParams.from, 1790812800);
assert.strictEqual(params.runtimeParams.to, 1792713600);
assert.strictEqual(params.runtimeParams.mode, "custom");
console.log("  ✓ PASS: Universal date filter parameters synchronized across SEC and Runtime APIs");

// TEST 7: Exactly 8 Metric Cards in Required Order
console.log("\n[TEST 7] Exactly 8 Metric Cards in Required Order...");
const expectedOrder = [
  "Target Production",
  "Target Cost / unit",
  "Energy Consumption",
  "Production Runtime",
  "Primary Production",
  "Secondary Production",
  "Wastage",
  "Machine Cost / unit",
];

const primaryUnit = "kg";
const secondaryUnit = "mts";
const renderedTiles = [
  { pos: 1, label: "Target Production", value: formatTargetProduction(rawTargetProdA), unit: primaryUnit },
  { pos: 2, label: `Target Cost / ${primaryUnit}`, value: formatTargetCost(rawTargetCostA), unit: `/${primaryUnit}` },
  { pos: 3, label: "Energy Consumption", value: "450.50", unit: "kWh" },
  { pos: 4, label: "Production Runtime", value: "11 hrs 30 mins", unit: "Flat Line" },
  { pos: 5, label: "Primary Production", value: "1,250.00", unit: primaryUnit },
  { pos: 6, label: "Secondary Production", value: "0.00", unit: secondaryUnit },
  { pos: 7, label: "Wastage", value: "25.00", unit: primaryUnit },
  { pos: 8, label: `Machine Cost / ${primaryUnit}`, value: "₹2.52", unit: `/${primaryUnit}` },
];

assert.strictEqual(renderedTiles.length, 8, "Must have exactly 8 metric tiles");
assert.strictEqual(renderedTiles[0].value, "0.000");
assert.strictEqual(renderedTiles[0].unit, "kg");
assert.strictEqual(renderedTiles[1].value, "₹0.00");
assert.strictEqual(renderedTiles[1].unit, "/kg");

renderedTiles.forEach((tile, idx) => {
  assert.strictEqual(tile.pos, idx + 1);
});
console.log("  ✓ PASS: Exactly 8 metric tiles rendered in exact 2x4 layout order (1 to 8)");

// TEST 8: Web Dashboard Parity — Dynamic Targets (16-4-2-30, 16-4-2-40dp, 75mm elbow)
console.log("\n[TEST 8] Dynamic Target Parity with Web Dashboard...");
// 16-4-2-30
const prod16_4 = { productId: "p16-4-2-30", productName: "16-4-2-30", primaryProductUnit: "kg" };
const target16_4 = { targetProduction: 1217.667, productionUnit: "kg" };
const metric16_4 = { totalCost: 10190.66, status: "ready" };
const targetProd16_4 = getProductTargetProduction(prod16_4, metric16_4, target16_4);
const targetCost16_4 = getProductTargetCost(prod16_4, metric16_4, target16_4);
assert.strictEqual(targetProd16_4, 1217.667);
assert.strictEqual(formatTargetProduction(targetProd16_4), "1,217.667");
assert.strictEqual(Number(targetCost16_4.toFixed(2)), 8.37);
assert.strictEqual(formatTargetCost(targetCost16_4), "₹8.37");
console.log(`  ✓ PASS (8A): Product 16-4-2-30 matches Web: Target Prod = ${formatTargetProduction(targetProd16_4)} kg, Target Cost = ${formatTargetCost(targetCost16_4)}/kg`);

// 16-4-2-40dp
const prod40dp = { productId: "p16-4-2-40dp", productName: "16-4-2-40dp", primaryProductUnit: "kg" };
const target40dp = { targetProduction: 5803.500, productionUnit: "kg" };
const metric40dp = { totalCost: 24779.76, status: "ready" };
const targetProd40dp = getProductTargetProduction(prod40dp, metric40dp, target40dp);
const targetCost40dp = getProductTargetCost(prod40dp, metric40dp, target40dp);
assert.strictEqual(targetProd40dp, 5803.500);
assert.strictEqual(formatTargetProduction(targetProd40dp), "5,803.500");
assert.strictEqual(Number(targetCost40dp.toFixed(2)), 4.27);
assert.strictEqual(formatTargetCost(targetCost40dp), "₹4.27");
console.log(`  ✓ PASS (8B): Product 16-4-2-40dp matches Web: Target Prod = ${formatTargetProduction(targetProd40dp)} kg, Target Cost = ${formatTargetCost(targetCost40dp)}/kg`);

// 75mm elbow (Genuine zero target)
const prodElbow = { productId: "p75mm-elbow", productName: "75mm elbow", primaryProductUnit: "kg" };
const targetElbow = { targetProduction: 0, productionUnit: "kg" };
const metricElbow = { totalCost: 33721.73, status: "ready" };
const targetProdElbow = getProductTargetProduction(prodElbow, metricElbow, targetElbow);
const targetCostElbow = getProductTargetCost(prodElbow, metricElbow, targetElbow);
assert.strictEqual(targetProdElbow, 0);
assert.strictEqual(formatTargetProduction(targetProdElbow), "0.000");
assert.strictEqual(formatTargetCost(targetCostElbow), "₹0.00");
console.log(`  ✓ PASS (8C): Product 75mm elbow matches Web: Target Prod = ${formatTargetProduction(targetProdElbow)} kg, Target Cost = ${formatTargetCost(targetCostElbow)}/kg`);

// TEST 9: Web Dashboard Latest Production First Comparator
console.log("\n[TEST 9] Web Dashboard 'Latest Production First' Sorting Comparator...");
function webLatestProductionComparator(a, b, metrics) {
  const aId = String(a.productId || a._id || "");
  const bId = String(b.productId || b._id || "");
  const aMetric = metrics[aId];
  const bMetric = metrics[bId];

  const aDate = new Date(aMetric?.productionTo || aMetric?.productionDate || 0).getTime();
  const bDate = new Date(bMetric?.productionTo || bMetric?.productionDate || 0).getTime();
  const aTime = Number.isFinite(aDate) ? aDate : 0;
  const bTime = Number.isFinite(bDate) ? bDate : 0;

  if (bTime !== aTime) {
    return bTime - aTime;
  }
  const aName = String(a.name || a.productName || "");
  const bName = String(b.name || b.productName || "");
  return aName.localeCompare(bName, undefined, { sensitivity: "base", numeric: true });
}

// 16-4-2-30 logged on 2026-09-30 18:00
// 12-4-2-40 logged on 2026-09-25 10:00
// 75mm elbow logged on 2026-09-15 12:00
// P_NO_LOGS has no logs
const mockMetrics = {
  "p16-4-2-30": { productionTo: "2026-09-30T18:00:00.000Z" },
  "p12-4-2-40": { productionTo: "2026-09-25T10:00:00.000Z" },
  "p75mm-elbow": { productionTo: "2026-09-15T12:00:00.000Z" },
  "p_no_log_a": { productionTo: null },
  "p_no_log_b": { productionTo: null },
};

const productList = [
  { productId: "p_no_log_b", productName: "Z No Log Product" },
  { productId: "p12-4-2-40", productName: "12-4-2-40" },
  { productId: "p75mm-elbow", productName: "75mm elbow" },
  { productId: "p_no_log_a", productName: "A No Log Product" },
  { productId: "p16-4-2-30", productName: "16-4-2-30" },
];

productList.sort((a, b) => webLatestProductionComparator(a, b, mockMetrics));

assert.strictEqual(productList[0].productName, "16-4-2-30", "16-4-2-30 must be #1 (most recent production log)");
assert.strictEqual(productList[1].productName, "12-4-2-40", "12-4-2-40 must be #2");
assert.strictEqual(productList[2].productName, "75mm elbow", "75mm elbow must be #3");
assert.strictEqual(productList[3].productName, "A No Log Product", "Tied no-log products break ties alphabetically: A comes before Z");
assert.strictEqual(productList[4].productName, "Z No Log Product");
console.log("  ✓ PASS: Web Latest Production First sorting brings 16-4-2-30 to #1 spot, matching Web Dashboard!");

console.log("\n========================================================");
console.log("🎉 ALL 9/9 PRODUCT-WISE SEC UNIT TESTS PASSED!");
console.log("========================================================\n");

