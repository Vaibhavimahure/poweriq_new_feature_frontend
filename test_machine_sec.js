/**
 * test_machine_sec.js
 * Verification test suite for Machine-wise SEC DID filtering, sorting, and runtime formatting.
 */

const assert = require("assert");

// 1. DID Filtering
function isSecProductionDid(rawDid) {
  if (!rawDid) return false;
  const d = String(rawDid).trim().toUpperCase();
  return d.includes("X") || d.includes("R");
}

console.log("\n========================================================");
console.log("🧪 TESTING MACHINE-WISE SEC DID FILTERING & SORTING");
console.log("========================================================\n");

// Test 1: Production DID Filtering
console.log("[TEST 1] Production DID Filtering (X and R vs Utility)...");
const testDids = [
  { did: "E_BA_Z_B_R_P0002_D3", name: "Flat line", expected: true },
  { did: "E_BA_Z_B_X_P0002_D2", name: "HDPE Kabra", expected: true },
  { did: "E_BA_Z_B_R_P0002_D4", name: "RR Round Drip", expected: true },
  { did: "E_BA_Z_B_T_P0003_D4", name: "LT Outgoing Chiller", expected: false },
  { did: "E_BA_Z_B_T_P0003_D1", name: "LT Outgoing 4 LightingDB", expected: false },
  { did: "E_BA_Z_B_T_P0005_D1", name: "Plant Utility", expected: false },
  { did: "E_BA_Z_B_T_P0005_D2", name: "Air Compressor", expected: false },
  { did: "E_BA_Z_B_M_P0002_D1", name: "Main HT Incomer", expected: false },
];

testDids.forEach(({ did, name, expected }) => {
  const result = isSecProductionDid(did);
  assert.strictEqual(
    result,
    expected,
    `DID ${did} (${name}) expected ${expected} but got ${result}`
  );
});
console.log("  ✓ PASS: Production DIDs (X and R) preserved, utility/incomer meters filtered out");

// Test 2: Deduplication by normalized DID
console.log("\n[TEST 2] Deduplication by normalized DID...");
const rawList = [
  { did: "e_ba_z_b_r_p0002_d3", name: "Flat line (lower)" },
  { did: "E_BA_Z_B_R_P0002_D3", name: "Flat line (upper)" },
  { did: "E_BA_Z_B_X_P0002_D2", name: "HDPE Kabra" },
  { did: "E_BA_Z_B_X_P0002_D2 ", name: "HDPE Kabra (trailing space)" },
];

const byDid = new Map();
rawList.forEach((m) => {
  const normDid = String(m.did).trim().toUpperCase();
  if (isSecProductionDid(normDid) && !byDid.has(normDid)) {
    byDid.set(normDid, { ...m, did: normDid });
  }
});
assert.strictEqual(byDid.size, 2, `Expected 2 unique machines after deduplication, got ${byDid.size}`);
console.log("  ✓ PASS: Deduplicated by normalized DID without duplicates");

// Test 3: SEC Data Presence Detection & Zero is Data
console.log("\n[TEST 3] SEC Data Presence (Valid 0 is data; runtime alone != data)...");
function hasActualSecData(m) {
  const isNumeric = (val) =>
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

// Flat line has energy: 227.6 and primaryProduction: 0
const machineWithZeroData = {
  did: "E_BA_Z_B_R_P0002_D3",
  primaryProductionQtyEntered: 0,
  machineEnergy: 227.6,
  productionRuntimeHours: 11.5,
};
assert.strictEqual(hasActualSecData(machineWithZeroData), true, "Numeric 0 and valid energy must count as data");

// Machine with ONLY runtime but NO SEC data
const machineWithOnlyRuntime = {
  did: "E_BA_Z_B_X_P0002_D1",
  primaryProductionQtyEntered: null,
  secondaryProductionQtyEntered: null,
  machineEnergy: null,
  productionRuntimeHours: 18.5,
  logCount: 0,
};
assert.strictEqual(hasActualSecData(machineWithOnlyRuntime), false, "Runtime alone must NEVER count as SEC data");
console.log("  ✓ PASS: Valid numeric 0 is recognized as data; runtime alone does not count as data");

// Test 4: Sorting Rule (Data-first, null-last)
console.log("\n[TEST 4] Sorting Rule (Data-first, null-last)...");
const unsorted = [
  { did: "E_BA_Z_B_X_P0002_D1", name: "Machine No Data", ...machineWithOnlyRuntime },
  { did: "E_BA_Z_B_R_P0002_D3", name: "Flat line", ...machineWithZeroData },
];

unsorted.sort((a, b) => {
  const aHas = hasActualSecData(a);
  const bHas = hasActualSecData(b);
  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;
  return String(a.name || a.did).localeCompare(String(b.name || b.did));
});

assert.strictEqual(unsorted[0].did, "E_BA_Z_B_R_P0002_D3", "Machine with SEC data must be first");
assert.strictEqual(unsorted[1].did, "E_BA_Z_B_X_P0002_D1", "Machine with missing SEC data must be last");
console.log("  ✓ PASS: Machines with SEC data sorted first; null/missing data sorted last");

// Test 5: Production Runtime Formatting
console.log("\n[TEST 5] Runtime String Formatting...");
function formatRuntimeHours(hoursVal) {
  if (hoursVal == null || !Number.isFinite(Number(hoursVal)) || Number(hoursVal) <= 0) {
    return "0 hrs 0 mins";
  }
  const h = Number(hoursVal);
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${hrs} hrs ${mins} mins`;
}

assert.strictEqual(formatRuntimeHours(11.5166667), "11 hrs 31 mins");
assert.strictEqual(formatRuntimeHours(10.0166667), "10 hrs 1 mins");
assert.strictEqual(formatRuntimeHours(0), "0 hrs 0 mins");
assert.strictEqual(formatRuntimeHours(null), "0 hrs 0 mins");
console.log("  ✓ PASS: Runtime hours formatted exactly as '${hrs} hrs ${mins} mins'");

// Test 6: Indian Number Formatting (en-IN comma grouping)
console.log("\n[TEST 6] Indian Number Formatting (en-IN grouping & decimals)...");
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

// 4-digit
assert.strictEqual(formatIndianNumber(2099.4, 3), "2,099.400");
// 5-digit
assert.strictEqual(formatIndianNumber(29567.9, 1), "29,567.9");
assert.strictEqual(formatIndianNumber(57234.07, 3), "57,234.070");
assert.strictEqual(formatIndianNumber(9804.9, 1), "9,804.9");
assert.strictEqual(formatIndianNumber(27717.2, 3), "27,717.200");
// 6-digit
assert.strictEqual(formatIndianNumber(123456, 3), "1,23,456.000");
// 7-digit
assert.strictEqual(formatIndianNumber(2306550, 3), "23,06,550.000");
// 8-digit
assert.strictEqual(formatIndianNumber(12345678, 3), "1,23,45,678.000");
// Zero, null, negative
assert.strictEqual(formatIndianNumber(0, 3), "0.000");
assert.strictEqual(formatIndianNumber(null, 3), "—");
assert.strictEqual(formatIndianNumber(undefined, 3), "—");
assert.strictEqual(formatIndianNumber(-1500.5, 2), "-1,500.50");

console.log("  ✓ PASS: 4-, 5-, 6-, 7-, and 8-digit Indian grouping formatted accurately (en-IN)");
console.log("  ✓ PASS: 2306550.000 -> 23,06,550.000 mts verified");
console.log("  ✓ PASS: 29567.9 -> 29,567.9 kWh verified");
console.log("  ✓ PASS: 57234.070 -> 57,234.070 kg verified");

console.log("\n========================================================");
console.log("🎉 ALL 6/6 MACHINE-WISE SEC UNIT TESTS PASSED!");
console.log("========================================================\n");
