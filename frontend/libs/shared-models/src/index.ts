/**
 * DTOs exchanged with the Shopivo API (`/api/v1`). Kept in sync with the backend records;
 * planned: generation from the OpenAPI document in CI.
 */

export type PlatformRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT';
export type UserStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type StoreRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'PRODUCT_MANAGER' | 'ORDER_MANAGER' | 'CUSTOMER_SUPPORT';
export type InvitableRole = Exclude<StoreRole, 'OWNER'>;
export type StorePermission =
  | 'STORE_READ' | 'STORE_SETTINGS_WRITE' | 'STORE_DELETE' | 'TEAM_READ' | 'TEAM_MANAGE' | 'BILLING_MANAGE'
  | 'PRODUCTS_READ' | 'PRODUCTS_WRITE' | 'ORDERS_READ' | 'ORDERS_WRITE' | 'CUSTOMERS_READ' | 'CUSTOMERS_WRITE'
  | 'THEMES_WRITE' | 'CONTENT_WRITE' | 'SEO_WRITE' | 'MARKETING_WRITE' | 'INTEGRATIONS_MANAGE' | 'DOMAINS_MANAGE'
  | 'ANALYTICS_READ' | 'AUDIT_READ';
export type TenantStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type StoreStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';
export type MembershipStatus = 'ACTIVE' | 'DISABLED';

export interface Me {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  platformRole: PlatformRole | null;
  mfaEnabled: boolean;
  mfaPending: boolean;
}

export interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  platformRole: PlatformRole | null;
  emailVerified: boolean;
  locale: string;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface LoginResponse {
  mfaRequired: boolean;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  current: boolean;
}

export interface TotpSetup {
  secret: string;
  otpauthUri: string;
}

export interface MfaStatus {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export interface MyStore {
  tenantId: string;
  name: string;
  slug: string;
  status: StoreStatus;
  tenantStatus: TenantStatus;
  primaryHostname: string | null;
  role: StoreRole;
  permissions: StorePermission[];
}

export interface Store {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  status: StoreStatus;
  defaultLocale: string;
  defaultCurrency: string;
  timezone: string;
  contactEmail: string | null;
  primaryHostname: string | null;
  createdAt: string;
  version: number;
}

export interface StoreSettings {
  legalCompanyName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string;
  phone: string | null;
  orderEmail: string | null;
  pricesIncludeTax: boolean;
  version: number;
}

export interface SlugAvailability {
  slug: string;
  available: boolean;
  reason: 'INVALID' | 'RESERVED' | 'TAKEN' | null;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: StoreRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: StoreRole;
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorType: 'USER' | 'SYSTEM' | 'PLATFORM_ADMIN' | 'ANONYMOUS';
  action: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}

export interface TenantView {
  id: string;
  name: string;
  status: TenantStatus;
  suspendedReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface AdminTenantRow {
  tenant: TenantView;
  store: Store | null;
  owner: UserView | null;
}

export interface AdminGrowth {
  days: string[];
  users: number[];
  stores: number[];
}

export interface AdminOverview {
  users: number;
  usersInPeriod: number;
  stores: number;
  activeStores: number;
  suspendedStores: number;
  storesInPeriod: number;
}

/** RFC 9457 problem details returned by the API. */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  code?: string;
  errors?: { field: string; code: string; message: string }[];
  retryAfterSeconds?: number;
  [key: string]: unknown;
}

export const STORE_ROLE_LABELS: Record<StoreRole, string> = {
  OWNER: 'Właściciel',
  ADMIN: 'Administrator',
  MANAGER: 'Menedżer',
  PRODUCT_MANAGER: 'Menedżer produktów',
  ORDER_MANAGER: 'Obsługa zamówień',
  CUSTOMER_SUPPORT: 'Obsługa klienta',
};

export const STORE_ROLE_DESCRIPTIONS: Record<StoreRole, string> = {
  OWNER: 'Pełny dostęp, w tym subskrypcja i usunięcie sklepu.',
  ADMIN: 'Pełny dostęp do sklepu i zespołu, bez płatności za subskrypcję.',
  MANAGER: 'Produkty, zamówienia, klienci, wygląd i treści sklepu.',
  PRODUCT_MANAGER: 'Katalog produktów, treści i SEO.',
  ORDER_MANAGER: 'Realizacja zamówień i podgląd klientów.',
  CUSTOMER_SUPPORT: 'Podgląd zamówień i obsługa danych klientów.',
};

// ---------------------------------------------------------------- billing / subscriptions (Phase 2)
// Amounts are minor units (grosze). Plan prices are NET; charges carry VAT and the gross total.

export type BillingInterval = 'MONTH' | 'YEAR';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED';
export type EntitlementKind = 'LIMIT' | 'FAIR_USE' | 'FEATURE' | 'NUMBER';
export type ChargeStatus = 'OPEN' | 'PAID' | 'FAILED' | 'VOID';
export type ChargeKind = 'INITIAL' | 'RENEWAL' | 'UPGRADE';

export interface PlanPrice { id: string; interval: BillingInterval; currency: string; amountMinor: number; monthlyAmountMinor: number; }
export interface Plan {
  id: string; code: string; name: string; description: string | null; sortOrder: number; active: boolean;
  publicPlan: boolean; trialDays: number; prices: PlanPrice[]; entitlements: Record<string, string>; version: number;
}
export interface EntitlementDefinition { key: string; label: string; kind: EntitlementKind; }
export interface PlansResponse { plans: Plan[]; entitlements: EntitlementDefinition[]; vatRateBps: number; currency: string; }
export interface PlanSummary { id: string; code: string; name: string; }
export interface EntitlementValue { key: string; label: string; kind: EntitlementKind; value: string; overridden: boolean; }
export interface UsageValue { metric: string; label: string; value: number; limit: number; fairUse: boolean; }
export interface CouponSummary { code: string; description: string | null; percentOff: number | null; amountOffMinor: number | null; duration: string; durationMonths: number | null; }
export interface Charge {
  id: string; number: string; kind: ChargeKind; status: ChargeStatus; plan: PlanSummary | null; interval: BillingInterval;
  periodStart: string; periodEnd: string; listAmountMinor: number; discountMinor: number; amountMinor: number;
  taxRateBps: number; taxMinor: number; totalMinor: number; currency: string; description: string | null;
  provider: string | null; dueAt: string; issuedAt: string; paidAt: string | null;
}
export interface Subscription {
  id: string; status: SubscriptionStatus; access: 'FULL' | 'READ_ONLY'; plan: PlanSummary | null; price: PlanPrice | null;
  interval: BillingInterval | null; trialEndsAt: string | null; currentPeriodStart: string | null; currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean; graceUntil: string | null; pendingPlan: PlanSummary | null; pendingInterval: BillingInterval | null;
  coupon: CouponSummary | null; unpaidCharges: Charge[]; entitlements: EntitlementValue[]; usage: UsageValue[];
  paymentsAvailable: boolean; vatRateBps: number;
}
export interface SubscriptionHistoryEntry { type: string; fromStatus: string | null; toStatus: string | null; planCode: string | null; detail: string | null; createdAt: string; }
export interface PaymentStart { charge: Charge; paymentUrl: string | null; }
export interface ChangeResult { scheduled: boolean; payment: PaymentStart | null; }

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIALING: 'Okres próbny', ACTIVE: 'Aktywna', PAST_DUE: 'Zaległa płatność', CANCELED: 'Zakończona', EXPIRED: 'Wygasła',
};
export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = { OPEN: 'Do zapłaty', PAID: 'Opłacona', FAILED: 'Nieudana', VOID: 'Anulowana' };
export const CHARGE_KIND_LABELS: Record<ChargeKind, string> = { INITIAL: 'Zakup planu', RENEWAL: 'Odnowienie', UPGRADE: 'Zmiana planu' };

// admin
export interface PaymentProviderField { key: string; label: string; secret: boolean; hint: string | null; configured: boolean; value: string | null; }
export interface PaymentProvider {
  id: string; name: string; description: string; docsUrl: string | null; enabled: boolean; sandbox: boolean; active: boolean;
  lastTestAt: string | null; lastTestOk: boolean | null; fields: PaymentProviderField[];
}
export interface AdminSubscriptionRow {
  tenantId: string; storeName: string; tenantStatus: string; status: SubscriptionStatus; planCode: string; planName: string;
  interval: BillingInterval | null; monthlyNetMinor: number; trialEndsAt: string | null; currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean; graceUntil: string | null; unpaidTotalMinor: number;
}
export interface EntitlementOverride { key: string; label: string; value: string; reason: string; expiresAt: string | null; createdAt: string; }
export interface AdminSubscriptionDetail {
  summary: AdminSubscriptionRow; subscription: Subscription; charges: Charge[]; history: SubscriptionHistoryEntry[]; overrides: EntitlementOverride[];
}
export interface BillingStats {
  mrrMinor: number; arrMinor: number; byStatus: Record<string, number>; activeByPlan: Record<string, number>;
  trialsEndingIn7Days: number; collectedLast30DaysNetMinor: number; unpaidTotalMinor: number; currency: string;
}
export interface Coupon {
  id: string; code: string; description: string | null; percentOff: number | null; amountOffMinor: number | null; currency: string | null;
  duration: 'ONCE' | 'REPEATING' | 'FOREVER'; durationMonths: number | null; maxRedemptions: number | null; redeemedCount: number;
  validUntil: string | null; active: boolean;
}
export interface UsageRow {
  tenantId: string; storeName: string; planCode: string; status: SubscriptionStatus; revenueMonthlyNetMinor: number;
  usage: Record<string, number>; limits: Record<string, number>; estimatedCostMinor: number; marginMinor: number; fairUseExceeded: string[];
}
export interface CostModel { baseMonthlyMinor: number; perMillionStorefrontRequestsMinor: number; perOrderMinor: number; perGbStorageMinor: number; }
export interface UsageReport { period: string; rows: UsageRow[]; costModel: CostModel; currency: string; }

export const SUBSCRIPTION_EVENT_LABELS: Record<string, string> = {
  TRIAL_STARTED: 'Rozpoczęto okres próbny', CHECKOUT_STARTED: 'Rozpoczęto zakup planu', PAYMENT_RECEIVED: 'Płatność zaksięgowana',
  PAYMENT_FAILED: 'Płatność nieudana', PAYMENT_AMOUNT_MISMATCH: 'Odrzucono płatność o niezgodnej kwocie',
  UPGRADE_STARTED: 'Rozpoczęto zmianę planu', DOWNGRADE_SCHEDULED: 'Zaplanowano zmianę planu', CHANGE_CANCELED: 'Anulowano zaplanowaną zmianę',
  CANCEL_SCHEDULED: 'Zaplanowano zakończenie subskrypcji', CANCEL_REVOKED: 'Wznowiono subskrypcję', CANCELED: 'Subskrypcja zakończona',
  TRIAL_EXPIRED: 'Okres próbny zakończony', RENEWAL_ISSUED: 'Wystawiono płatność za odnowienie', RENEWED: 'Subskrypcja odnowiona',
  PAST_DUE: 'Brak płatności — okres karencji', EXPIRED: 'Subskrypcja wygasła', TRIAL_EXTENDED: 'Przedłużono okres próbny',
  NOTICE_SENT: 'Wysłano przypomnienie', FAIR_USE_EXCEEDED: 'Przekroczono limit uczciwego użytkowania',
};

/** Human value of a plan entitlement ("-1" = unlimited). */
export function formatEntitlement(kind: EntitlementKind, value: string | undefined | null, key?: string): string {
  if (value === undefined || value === null) return '—';
  if (kind === 'FEATURE') return value === 'true' ? 'Tak' : 'Nie';
  const n = Number(value);
  if (n === -1) return 'Bez limitu';
  if (key === 'storage.max_mb' && n >= 1024) return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(n / 1024)} GB`;
  if (key === 'fees.transaction_bps') return n === 0 ? 'Brak' : `${new Intl.NumberFormat('pl-PL').format(n / 100)}%`;
  return new Intl.NumberFormat('pl-PL').format(n);
}
