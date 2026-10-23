/**
 * role.ts — PowerIQ Canonical Role Normalization & Notification Eligibility
 * ----------------------------------------------------------------------------
 * Actual valid canonical roles in PowerIQ:
 *  - admin
 *  - super admin
 *  - production
 *  - maintenance
 *  - engineer
 *
 * Notification Eligibility Rules:
 *  - admin       -> eligible (true)
 *  - super admin -> eligible (true)
 *  - production  -> eligible (true)
 *  - maintenance -> eligible (true)
 *  - engineer    -> eligible (true)
 *  - owner (if genuinely present in auth) -> excluded (false)
 * ----------------------------------------------------------------------------
 */

export type CanonicalRole =
  | "admin"
  | "super admin"
  | "production"
  | "maintenance"
  | "engineer"
  | "owner"
  | "management"
  | string;

export const VALID_CANONICAL_ROLES: CanonicalRole[] = [
  "admin",
  "super admin",
  "production",
  "maintenance",
  "engineer",
  "owner",
  "management",
];

export const EXCLUDED_NOTIFICATION_ROLES = [] as const;

/**
 * Normalizes any auth role input (string, object, array) to its clean canonical role.
 * Only normalizes casing, spacing, and delimiter conventions:
 *  - "Admin", "ADMIN" -> "admin"
 *  - "Super Admin", "super_admin", "superadmin" -> "super admin"
 *  - "Production" -> "production"
 *  - "Maintenance" -> "maintenance"
 *  - "Engineer" -> "engineer"
 *
 * NEVER maps admin or super admin to "management".
 */
export function normalizeRole(role?: unknown): string {
  if (!role) return "";

  let extracted = "";

  if (typeof role === "string") {
    extracted = role;
  } else if (typeof role === "object" && role !== null) {
    const obj = role as Record<string, any>;
    extracted =
      obj.name ||
      obj.role ||
      obj.role_name ||
      obj.roleName ||
      obj.title ||
      obj.designation ||
      obj.displayName ||
      obj.slug ||
      obj.type ||
      "";
  } else if (Array.isArray(role)) {
    for (const item of role) {
      const n = normalizeRole(item);
      if (n) return n;
    }
    return "";
  } else {
    extracted = String(role);
  }

  const value = extracted
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (value === "superadmin") return "super admin";

  return value;
}

/**
 * Returns clean, human-readable display label for UI representation.
 * Kept strictly separate from the canonical role used for permissions/notifications.
 *  - "admin"       -> "Admin"
 *  - "super admin" -> "Super Admin"
 *  - "production"  -> "Production"
 *  - "maintenance" -> "Maintenance"
 *  - "engineer"    -> "Engineer"
 *  - "owner"       -> "Owner"
 */
export function getRoleLabel(role?: unknown): string {
  const canonical = normalizeRole(role);
  switch (canonical) {
    case "admin":
      return "Admin";
    case "super admin":
      return "Super Admin";
    case "production":
      return "Production";
    case "maintenance":
      return "Maintenance";
    case "engineer":
      return "Engineer";
    case "owner":
      return "Owner";
    case "management":
      return "Management";
    default:
      if (!canonical) return "User";
      // Title Case for any other role
      return canonical
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

/**
 * Checks if a user's role is eligible to receive audible PowerIQ siren & system notifications.
 *
 * Must be called with the CANONICAL role (or raw auth role which is normalized internally),
 * NEVER with a display label.
 *
 * Results:
 *  - admin       -> true
 *  - super admin -> true
 *  - production  -> true
 *  - maintenance -> true
 *  - engineer    -> true
 *  - owner       -> true (eligible with custom chime & mute toggle)
 *  - management  -> true (eligible with custom chime & mute toggle)
 */
const ELIGIBLE_CANONICAL_ROLES = new Set([
  "admin",
  "super admin",
  "production",
  "maintenance",
  "engineer",
  "owner",
  "management",
]);

export function isNotificationEligibleRole(role?: unknown): boolean {
  const canonical = normalizeRole(role);

  // Exclude empty role
  if (!canonical) {
    return false;
  }

  // Canonical valid notification roles: admin, super admin, production, maintenance, engineer, owner, management
  return ELIGIBLE_CANONICAL_ROLES.has(canonical);
}

export function isOwnerRole(role?: unknown): boolean {
  const canonical = normalizeRole(role);
  return canonical === "owner" || canonical === "management";
}

/**
 * Debug logging utility to verify role resolution and eligibility in real time.
 */
export function logPowerIQRoleDebug(
  userName?: string,
  rawRole?: unknown
): {
  userName: string;
  rawRole: unknown;
  canonicalRole: string;
  displayRole: string;
  notificationEligible: boolean;
} {
  const canonicalRole = normalizeRole(rawRole);
  const displayRole = getRoleLabel(canonicalRole);
  const notificationEligible = isNotificationEligibleRole(canonicalRole);

  const debugInfo = {
    userName: userName || "Unknown",
    rawRole,
    canonicalRole,
    displayRole,
    notificationEligible,
  };

  console.log("[PowerIQ Role Debug]", debugInfo);
  return debugInfo;
}
