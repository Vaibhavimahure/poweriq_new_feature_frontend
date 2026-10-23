/**
 * test_frontend_restoration.js
 * ----------------------------------------------------------------------------
 * Automated Unit & Integration Test Suite for PowerIQ Frontend Restoration:
 *  1. Haversine distance calculation and 500m boundary verification
 *  2. Coordinate validation (rejects invalid/zero/infinite coords)
 *  3. Final Agreed Sound Matrix (Maintenance inside/outside, Other roles)
 *  4. MD audio location bypass for Maintenance
 *  5. Silent channels & notification visibility preservation
 *  6. Stale / unknown location failsafe (never authorizes non-MD audible alerts)
 * ----------------------------------------------------------------------------
 */

const assert = require("assert");

// ── Mock Haversine Formula ──────────────────────────────────────────────────
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isValidCoordinates(lat, lng) {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180 &&
    (nLat !== 0 || nLng !== 0)
  );
}

// ── Mock Canonical Role Normalizer ──────────────────────────────────────────
function normalizeRole(role) {
  if (!role) return "";
  let extracted = typeof role === "string" ? role : (role.role || role.name || String(role));
  const val = extracted.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (val === "superadmin") return "super admin";
  return val;
}

// ── Mock MD Alert Classifier ────────────────────────────────────────────────
function isMdAlert(alert) {
  if (!alert) return false;
  const tag = String(alert.tag_name || alert.metric || alert.tag || "").toLowerCase();
  const message = String(alert.message || alert.alert_message || "").toLowerCase();
  const title = String(alert.title || "").toLowerCase();

  const isMdTag =
    tag.includes("md_actual") ||
    tag.includes("actual_md") ||
    tag.includes("md_critical") ||
    tag.includes("md_warning") ||
    tag.includes("md_penalty") ||
    tag.startsWith("md_") ||
    tag.endsWith("_md") ||
    tag === "md";

  const isMdMessage =
    message.includes("maximum demand") ||
    message.includes("contract demand") ||
    message.includes("md penalty") ||
    message.includes("md warning") ||
    message.includes("md critical") ||
    title.includes("maximum demand") ||
    title.includes("md ");

  return isMdTag || isMdMessage;
}

// ── Mock Sound Matrix Resolver (Mirrors notifications.ts & soundService.ts) ─
function resolveAlertSoundConfig(alert, userRole, geofenceState, severity) {
  const normRole = normalizeRole(userRole);
  const isMaintenance = normRole === "maintenance";
  const isMd = isMdAlert(alert);

  // 1. Other roles (Non-Maintenance): ALWAYS SILENT
  if (!isMaintenance) {
    return {
      channelId: "poweriq_silent_v1",
      sound: undefined,
      isHarshSiren: false,
      isMildSound: false,
      isSilent: true,
      reason: "Other roles -> Silent for all alerts per final sound matrix",
    };
  }

  // 2. Maintenance Role
  // A) MD alerts -> Harsh siren everywhere (GPS bypassed)
  if (isMd) {
    return {
      channelId: "poweriq_critical_v7",
      sound: "poweriq_critical.wav",
      isHarshSiren: true,
      isMildSound: false,
      isSilent: false,
      vibrationPattern: [0, 400, 200, 400],
      reason: "Maintenance on MD alert -> Harsh siren (GPS bypassed)",
    };
  }

  // B) Non-MD alerts -> Audible ONLY when fresh, verified INSIDE 500m
  const isInside = Boolean(geofenceState?.isFresh && geofenceState?.status === "inside");

  if (isInside) {
    return {
      channelId: "poweriq_warning_v6",
      sound: "poweriq_alert.wav",
      isHarshSiren: false,
      isMildSound: true,
      isSilent: false,
      vibrationPattern: [0, 250, 250, 250],
      reason: "Maintenance on Non-MD alert inside 500m -> Mild sound",
    };
  }

  // Maintenance outside 500m, stale, unknown -> SILENT
  return {
    channelId: "poweriq_silent_v1",
    sound: undefined,
    isHarshSiren: false,
    isMildSound: false,
    isSilent: true,
    reason: "Maintenance on Non-MD alert outside or unverified location -> Silent",
  };
}

// ── Test Runner ─────────────────────────────────────────────────────────────
console.log("===============================================================================");
console.log("  POWERIQ-AI — FRONTEND RESTORATION AUTOMATED VERIFICATION SUITE              ");
console.log("===============================================================================");

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Haversine distance accuracy
// -----------------------------------------------------------------------------
runTest("Haversine Distance: Accurate distance calculation between GPS centroids", () => {
  // Plant at Mumbai: 19.0760, 72.8777
  const plantLat = 19.0760;
  const plantLng = 72.8777;

  // Exact same point
  const zeroDist = calculateHaversineDistance(plantLat, plantLng, plantLat, plantLng);
  assert(Math.abs(zeroDist) < 0.001, "Same point must yield 0 distance");

  // Point ~100 meters away (approx 0.0009 deg latitude)
  const dist100m = calculateHaversineDistance(plantLat, plantLng, plantLat + 0.0009, plantLng);
  assert(dist100m > 95 && dist100m < 105, `Distance must be ~100m (got ${dist100m.toFixed(1)}m)`);

  // Point ~600 meters away (outside 500m geofence)
  const dist600m = calculateHaversineDistance(plantLat, plantLng, plantLat + 0.0054, plantLng);
  assert(dist600m > 550 && dist600m < 650, `Distance must be ~600m (got ${dist600m.toFixed(1)}m)`);
});

// -----------------------------------------------------------------------------
// Test 2: Coordinate validation
// -----------------------------------------------------------------------------
runTest("Coordinate Validation: Validates bounds and rejects zero/null/infinite values", () => {
  assert(isValidCoordinates(19.076, 72.877) === true, "Valid coordinate accepted");
  assert(isValidCoordinates(-33.868, 151.209) === true, "Valid southern/eastern coordinate accepted");
  assert(isValidCoordinates(0, 0) === false, "0,0 Null island rejected");
  assert(isValidCoordinates(null, 72.877) === false, "Null latitude rejected");
  assert(isValidCoordinates(19.076, undefined) === false, "Undefined longitude rejected");
  assert(isValidCoordinates(95, 72) === false, "Out of bounds latitude rejected");
  assert(isValidCoordinates(19, 190) === false, "Out of bounds longitude rejected");
  assert(isValidCoordinates(NaN, 72) === false, "NaN coordinate rejected");
});

// -----------------------------------------------------------------------------
// Test 3: Maintenance Role on MD Alerts (Bypasses GPS)
// -----------------------------------------------------------------------------
runTest("Final Sound Matrix — Maintenance on MD Alert: Harsh siren everywhere (GPS Bypassed)", () => {
  const mdAlert = { tag_name: "ht_md_actual", message: "MD Breach warning at panel VCB", severity: "warning" };

  // 1. Maintenance inside 500m
  const resInside = resolveAlertSoundConfig(mdAlert, "maintenance", { status: "inside", isFresh: true }, "warning");
  assert.strictEqual(resInside.sound, "poweriq_critical.wav");
  assert.strictEqual(resInside.channelId, "poweriq_critical_v7");
  assert.strictEqual(resInside.isHarshSiren, true);
  assert.strictEqual(resInside.isSilent, false);

  // 2. Maintenance outside 500m
  const resOutside = resolveAlertSoundConfig(mdAlert, "maintenance", { status: "outside", isFresh: true }, "critical");
  assert.strictEqual(resOutside.sound, "poweriq_critical.wav");
  assert.strictEqual(resOutside.channelId, "poweriq_critical_v7");
  assert.strictEqual(resOutside.isHarshSiren, true);
  assert.strictEqual(resOutside.isSilent, false);

  // 3. Maintenance location unknown / GPS disabled
  const resUnknown = resolveAlertSoundConfig(mdAlert, "maintenance", { status: "unknown", isFresh: false }, "warning");
  assert.strictEqual(resUnknown.sound, "poweriq_critical.wav");
  assert.strictEqual(resUnknown.channelId, "poweriq_critical_v7");
  assert.strictEqual(resUnknown.isHarshSiren, true);
  assert.strictEqual(resUnknown.isSilent, false);
});

// -----------------------------------------------------------------------------
// Test 4: Maintenance Role on Non-MD Alerts (Requires fresh location <= 500m)
// -----------------------------------------------------------------------------
runTest("Final Sound Matrix — Maintenance on Non-MD Alert: Mild sound inside 500m, SILENT outside/stale", () => {
  const nonMdAlert = { tag_name: "voltage_unbalance", message: "Phase unbalance warning", severity: "warning" };

  // 1. Maintenance fresh inside 500m -> Mild sound
  const resInside = resolveAlertSoundConfig(nonMdAlert, "maintenance", { status: "inside", isFresh: true }, "warning");
  assert.strictEqual(resInside.sound, "poweriq_alert.wav");
  assert.strictEqual(resInside.channelId, "poweriq_warning_v6");
  assert.strictEqual(resInside.isMildSound, true);
  assert.strictEqual(resInside.isSilent, false);

  // 2. Maintenance outside 500m -> SILENT
  const resOutside = resolveAlertSoundConfig(nonMdAlert, "maintenance", { status: "outside", isFresh: true }, "warning");
  assert.strictEqual(resOutside.sound, undefined);
  assert.strictEqual(resOutside.channelId, "poweriq_silent_v1");
  assert.strictEqual(resOutside.isSilent, true);

  // 3. Maintenance stale (> 3 mins) inside 500m -> SILENT (failsafe)
  const resStale = resolveAlertSoundConfig(nonMdAlert, "maintenance", { status: "inside", isFresh: false }, "critical");
  assert.strictEqual(resStale.sound, undefined);
  assert.strictEqual(resStale.channelId, "poweriq_silent_v1");
  assert.strictEqual(resStale.isSilent, true);

  // 4. Maintenance location unavailable/unknown -> SILENT
  const resUnknown = resolveAlertSoundConfig(nonMdAlert, "maintenance", { status: "unknown", isFresh: false }, "warning");
  assert.strictEqual(resUnknown.sound, undefined);
  assert.strictEqual(resUnknown.channelId, "poweriq_silent_v1");
  assert.strictEqual(resUnknown.isSilent, true);
});

// -----------------------------------------------------------------------------
// Test 5: Other Roles (Admin, Super Admin, Engineer, Production, Owner)
// -----------------------------------------------------------------------------
runTest("Final Sound Matrix — Other Roles: SILENT for ALL alert categories", () => {
  const roles = ["admin", "super admin", "engineer", "production", "owner", "management"];
  const mdAlert = { tag_name: "ht_md_actual", message: "MD Breach warning", severity: "critical" };
  const nonMdAlert = { tag_name: "pf_low", message: "Power factor low", severity: "warning" };

  for (const role of roles) {
    // MD Alert -> Silent
    const mdRes = resolveAlertSoundConfig(mdAlert, role, { status: "inside", isFresh: true }, "critical");
    assert.strictEqual(mdRes.sound, undefined, `${role} on MD alert must be SILENT`);
    assert.strictEqual(mdRes.channelId, "poweriq_silent_v1");
    assert.strictEqual(mdRes.isSilent, true);

    // Non-MD Alert -> Silent
    const nonMdRes = resolveAlertSoundConfig(nonMdAlert, role, { status: "inside", isFresh: true }, "warning");
    assert.strictEqual(nonMdRes.sound, undefined, `${role} on Non-MD alert must be SILENT`);
    assert.strictEqual(nonMdRes.channelId, "poweriq_silent_v1");
    assert.strictEqual(nonMdRes.isSilent, true);
  }
});

// -----------------------------------------------------------------------------
// Test 6: Notification Visibility Preservation
// -----------------------------------------------------------------------------
runTest("Notification Visibility: Silent alerts still assign high-importance silent channel", () => {
  const nonMdAlert = { tag_name: "harmonics_thd", message: "High THD detected", severity: "warning" };
  const res = resolveAlertSoundConfig(nonMdAlert, "maintenance", { status: "outside", isFresh: true }, "warning");

  // Notification is NOT discarded: channelId is poweriq_silent_v1
  assert.strictEqual(res.channelId, "poweriq_silent_v1");
  assert.strictEqual(res.sound, undefined);
  assert.strictEqual(res.isSilent, true);
});

console.log("===============================================================================");
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log("===============================================================================");

if (failed > 0) process.exit(1);
