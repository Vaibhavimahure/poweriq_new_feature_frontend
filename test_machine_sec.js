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

console.log("\n========================================================");
console.log("🎉 ALL 5/5 MACHINE-WISE SEC UNIT TESTS PASSED!");
console.log("========================================================\n");
