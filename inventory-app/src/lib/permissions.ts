import type { Role } from "@/lib/domain";

// Per-resource permission flags. The default for each role lives in `defaults`;
// individual users can override flags via the User.permissions JSON blob.
export const RESOURCES = [
  "dashboard",
  "reports",
  "items",
  "shipments",
  "purchaseOrders",
  "suppliers",
  "sales",
  "estimates",
  "leads",
  "orders",
  "customers",
  "opex",
  "partners",
  "users",
  "settings",
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["view", "create", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

type PermissionMatrix = Record<Resource, readonly Action[]>;

const ALL: readonly Action[] = ACTIONS;
const VIEW_ONLY: readonly Action[] = ["view"];
const NONE: readonly Action[] = [];

// Default permission matrix per role (matches SPEC §2).
const defaults: Record<Role, PermissionMatrix> = {
  ADMIN: {
    dashboard: ALL,
    reports: ALL,
    items: ALL,
    shipments: ALL,
    purchaseOrders: ALL,
    suppliers: ALL,
    sales: ALL,
    estimates: ALL,
    leads: ALL,
    orders: ALL,
    customers: ALL,
    opex: ALL,
    partners: ALL,
    users: ALL,
    settings: ALL,
  },
  PARTNER: {
    dashboard: ALL,
    reports: VIEW_ONLY,
    items: ALL,
    shipments: ALL,
    purchaseOrders: ALL,
    suppliers: ALL,
    sales: ALL,
    estimates: ALL,
    leads: ALL,
    orders: ALL,
    customers: ALL,
    opex: ALL,
    partners: VIEW_ONLY,
    users: NONE,
    settings: VIEW_ONLY,
  },
  STAFF: {
    dashboard: NONE,
    reports: NONE,
    items: ALL,
    shipments: NONE,
    purchaseOrders: NONE,
    suppliers: NONE,
    sales: ALL,
    estimates: ALL,
    leads: ALL,
    orders: ALL,
    customers: ALL,
    opex: NONE,
    partners: NONE,
    users: NONE,
    settings: NONE,
  },
};

type Overrides = Partial<Record<Resource, Partial<Record<Action, boolean>>>>;

function parseOverrides(raw: string | null | undefined): Overrides {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Overrides;
  } catch {
    return {};
  }
}

export function can(
  user: { role: string; permissions?: string | null } | null | undefined,
  resource: Resource,
  action: Action,
): boolean {
  if (!user) return false;
  const role = user.role as Role;
  const base = defaults[role]?.[resource] ?? NONE;
  const overrides = parseOverrides(user.permissions);
  const override = overrides[resource]?.[action];
  if (override !== undefined) return override;
  return base.includes(action);
}
