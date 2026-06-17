// Domain constants — single source of truth for string-typed fields.
// SQLite doesn't support native enums; we validate via Zod at boundaries.

export const ROLES = ["PARTNER", "ADMIN", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const SHIPPING_ALLOCATION_METHODS = [
  "EQUAL_PER_UNIT",
  "WEIGHTED_BY_VALUE",
  "MANUAL",
] as const;
export type ShippingAllocationMethod = (typeof SHIPPING_ALLOCATION_METHODS)[number];

export const STOCK_MOVEMENT_TYPES = ["SHIPMENT_IN", "SALE_OUT", "ADJUSTMENT"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const OPEX_CATEGORIES = [
  "RENT",
  "SALARY",
  "UTILITY",
  "TRANSPORT",
  "MARKETING",
  "OTHER",
] as const;
export type OpexCategory = (typeof OPEX_CATEGORIES)[number];

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ORDER_STATUSES = ["IN_PROGRESS", "DISPATCHED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SETTING_KEYS = {
  companyInfo: "company_info", // { name, address, logoUrl, trn }
  defaultFxRate: "default_fx_rate", // string of Decimal
  vat: "vat", // { enabled: boolean, defaultRatePct: string, label: string, registrationNumber?: string }
} as const;
