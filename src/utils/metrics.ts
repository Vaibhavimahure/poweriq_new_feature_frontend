/**
 * metrics.ts — Human-Readable Performance Metric Display Mapping
 * ----------------------------------------------------------------------------
 * Maps raw industrial telemetry tags/short-forms to their exact website
 * human-readable names (e.g. i_curr_imb -> Current Imbalance %, pf_avg -> Power Factor).
 * ----------------------------------------------------------------------------
 */

export const PERFORMANCE_METRIC_MAP: Record<string, string> = {
  // Electrical - Circuit Breaker & Trip Current
  cb_current_critical_amp: "Trip Current (Critical)",
  cb_current_warning_amp: "Trip Current (Warning)",
  cb_current_amp: "Trip Current",
  cb_current: "Trip Current",
  trip_current: "Trip Current",
  trip_current_critical: "Trip Current (Critical)",
  trip_current_warning: "Trip Current (Warning)",

  // Maximum Demand
  md_actual_critical: "Maximum Demand (Critical)",
  md_actual_warning: "Maximum Demand (Warning)",
  md_actual_penalty: "Maximum Demand (Penalty)",
  md_critical_kva: "Maximum Demand (Critical)",
  md_warning_kva: "Maximum Demand (Warning)",
  actual_md_kva: "Maximum Demand",
  freq_hz: "Frequency",

  // Electrical - Current & Imbalance
  i_curr_imb: "Current Imbalance %",
  current_imbalance: "Current Imbalance %",
  curr_imb: "Current Imbalance %",
  i_avg: "Average Current",
  i_r: "Current Phase R",
  i_y: "Current Phase Y",
  i_b: "Current Phase B",
  i_thd: "THD – Current %",
  thd_i: "THD – Current %",
  thd_i_avg: "THD – Current %",

  // Electrical - Voltage & Imbalance
  v_volt_imb: "Voltage Imbalance %",
  voltage_imbalance: "Voltage Imbalance %",
  volt_imb: "Voltage Imbalance %",
  ll_vol_imb: "LL Voltage Imbalance %",
  ll_volt_imb_pct: "LL Voltage Imbalance %",
  ln_vol_imb: "LN Voltage Imbalance %",
  v_ll_avg: "Line to Line Voltage",
  v_ln_avg: "Line to Neutral Voltage",
  v_r: "Voltage Phase R",
  v_y: "Voltage Phase Y",
  v_b: "Voltage Phase B",
  v_thd: "THD – Voltage %",
  thd_v: "THD – Voltage %",
  thd_v_avg: "THD – Voltage %",

  // Power & Power Factor
  pf_avg: "Power Factor",
  power_factor: "Power Factor",
  pf: "Power Factor",
  p_tot: "Active Power",
  kw_tot: "Active Power",
  kw: "Active Power",
  q_tot: "Reactive Power",
  kvar_tot: "Reactive Power",
  kvar: "Reactive Power",
  s_tot: "Apparent Power",
  kva_tot: "Apparent Power",
  kva: "Apparent Power",

  // Frequency & Energy
  freq_avg: "Frequency",
  freq: "Frequency",
  frequency: "Frequency",
  kwh: "Active Energy",
  kvah: "Apparent Energy",
  kvarh: "Reactive Energy",

  // Temperature & HVAC / Chillers
  discharge_temp: "Discharge Temperature",
  suction_temp: "Suction Temperature",
  condenser_temp: "Condenser Temperature",
  chilled_water_temp: "Chilled Water Temperature",
  cooling_water_temp: "Cooling Water Temperature",
  transformer_temp: "Transformer Temperature",
  oil_temp: "Oil Temperature",
  winding_temp: "Winding Temperature",
  bearing_temp: "Bearing Temperature",
  ambient_temp: "Ambient Temperature",
  temperature: "Temperature",
  temp: "Temperature",

  // Pressure & Flow
  discharge_press: "Discharge Pressure",
  suction_press: "Suction Pressure",
  pressure: "Pressure",
  flow_rate: "Flow Rate",
  flow: "Flow Rate",
  humidity: "Relative Humidity",
  run_hours: "Run Hours",
};

/**
 * Returns the exact website human-readable Performance Metric label for any given tag.
 * Never outputs raw tags like "i_curr_imb" or "pf_avg".
 */
export function getPerformanceMetricName(tag?: string | null): string {
  if (!tag || !tag.trim()) return "Performance Metric";

  const raw = tag.trim();
  const lower = raw.toLowerCase();

  // 1. Direct dictionary match
  if (PERFORMANCE_METRIC_MAP[lower]) {
    return PERFORMANCE_METRIC_MAP[lower];
  }

  // 2. Normalized alphanumeric key match
  const cleanKey = lower.replace(/[^a-z0-9_]/g, "");
  if (PERFORMANCE_METRIC_MAP[cleanKey]) {
    return PERFORMANCE_METRIC_MAP[cleanKey];
  }

  // 3. If tag is already title case / sentence case (e.g. contains spaces or capital letters)
  if (raw.includes(" ") || /^[A-Z][a-z]+ [A-Z]/.test(raw)) {
    return raw;
  }

  // 4. Graceful Title Case formatting for unexpected snake_case or camelCase tags
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Formats numeric Alert Value for display:
 * - At most 3 digits after the decimal point
 * - e.g. 25.9165809765 -> 25.916, 0.987341 -> 0.987
 * - Purely for presentation; does not mutate source data.
 */
export function formatAlertValue(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) return String(value);

  // Maximum 3 decimal places without unnecessary trailing zeroes if integer
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });

  return formatted;
}

/**
 * Formats unit for presentation:
 * - Removes "pf" from card/modal VALUE display for Power Factor (e.g. 0.987 instead of 0.987 pf)
 * - Retains other meaningful units such as "%", "°C", etc.
 */
export function formatAlertUnit(unit?: string | null, tagName?: string | null): string {
  if (!unit || !unit.trim()) return "";
  const trimmed = unit.trim();
  const lowerUnit = trimmed.toLowerCase();
  const lowerTag = (tagName || "").toLowerCase();

  // Strip "pf" unit for Power Factor per Requirement 7
  if (
    lowerUnit === "pf" ||
    lowerTag === "pf_avg" ||
    lowerTag === "power_factor" ||
    lowerTag === "pf"
  ) {
    return "";
  }

  return trimmed;
}

/**
 * Resolves a human-readable, non-empty, non-hyphen panel/machine name for display.
 * Strictly avoids overwriting or showing "-" when a valid panel name, location,
 * or device ID exists on the preview or alert.
 */
export function resolveDisplayPanelName(
  alert: any,
  preview?: { panel_name?: string } | null
): string {
  const isMeaningful = (val: any): boolean =>
    typeof val === "string" &&
    val.trim() !== "" &&
    val.trim() !== "-" &&
    val.trim().toLowerCase() !== "unknown" &&
    val.trim().toLowerCase() !== "null" &&
    val.trim().toLowerCase() !== "undefined";

  if (preview && isMeaningful(preview.panel_name)) {
    return preview.panel_name.trim();
  }

  if (alert) {
    if (isMeaningful(alert.panel_name)) {
      return alert.panel_name.trim();
    }
    if (isMeaningful(alert.panel_location)) {
      return alert.panel_location.trim();
    }
    if (isMeaningful(alert.device_id)) {
      return alert.device_id.trim();
    }
    const did = alert.did || alert.DID;
    if (isMeaningful(did)) {
      return String(did).trim();
    }
  }

  return "Alert";
}

