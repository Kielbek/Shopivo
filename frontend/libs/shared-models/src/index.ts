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

/** Store industry (branża) — steers suggestions in the panel only. */
export type StoreIndustry =
  | 'FASHION' | 'FOOTWEAR' | 'ELECTRONICS' | 'COMPUTERS' | 'FURNITURE' | 'HOME' | 'GARDEN' | 'COSMETICS' | 'PERFUMES' | 'JEWELLER'
  | 'SPORTS' | 'AUTOMOTIVE' | 'PETS' | 'TOYS' | 'KIDS' | 'GROCERY' | 'HOUSEHOLD' | 'BUILDING' | 'TOOLS' | 'STATIONERY' | 'BOOKS'
  | 'MUSIC' | 'GAMES' | 'HOBBY' | 'HANDMADE' | 'GIFTS' | 'JEWELRY' | 'ACCESSORIES' | 'MEDICAL' | 'ECO' | 'DIGITAL' | 'FOOD'
  | 'OFFICE' | 'OUTDOOR' | 'GENERAL';

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
  /** Primary industry (first of `industries`). */
  industry: StoreIndustry | null;
  /** All industries the store sells in, primary first (up to 5). */
  industries: StoreIndustry[];
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
  PAYMENT_FAILED: 'Płatność nieudana', PAYMENT_AMOUNT_MISMATCH: 'Odrzucono płatność o niezgodnej kwocie', PAYMENT_ON_VOID_CHARGE: 'Wpłata za anulowaną płatność — sprawdź, czy nie zapłacono podwójnie',
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

// ---------------------------------------------------------------- catalogue (Phase 3)
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ProductType = 'PHYSICAL' | 'DIGITAL';
export type MovementReason = 'INITIAL' | 'RECEIPT' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN' | 'SALE' | 'ORDER_CANCELED' | 'CORRECTION';

export interface Category {
  id: string; parentId: string | null; name: string; slug: string; description: string | null; position: number; depth: number;
  visible: boolean; seoTitle: string | null; seoDescription: string | null; productCount: number; version: number; image: Record<string, string> | null;
}
export interface Brand { id: string; name: string; slug: string; productCount: number; }
export interface ProductOption { name: string; values: string[]; }
export interface ProductVariant {
  id: string; optionValues: Record<string, string>; title: string; sku: string | null; ean: string | null; priceMinor: number;
  compareAtMinor: number | null; costMinor: number | null; currency: string; lowestPrice30dMinor: number | null;
  weightGrams: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null;
  trackInventory: boolean; allowBackorder: boolean; onHand: number | null; reserved: number | null; available: number | null;
}
export interface Product {
  id: string; name: string; slug: string; description: string | null; status: ProductStatus; type: ProductType;
  brand: Brand | null; vatRateBps: number; categories: { id: string; name: string }[]; seoTitle: string | null;
  seoDescription: string | null; options: ProductOption[]; variants: ProductVariant[]; images: ProductImage[]; publishedAt: string | null;
  createdAt: string; updatedAt: string; version: number;
}
export interface ProductRow {
  id: string; name: string; slug: string; status: ProductStatus; type: ProductType; variantCount: number; sku: string | null;
  minPriceMinor: number; maxPriceMinor: number; currency: string; stock: number | null; lowStock: boolean; categories: string[];
  thumbnailUrl: string | null; updatedAt: string;
}
export interface InventoryRow {
  variantId: string; productId: string; productName: string; variantTitle: string; sku: string | null; productStatus: ProductStatus;
  onHand: number; reserved: number; available: number; lowStockThreshold: number; low: boolean; updatedAt: string;
}
export interface StockMovement {
  id: string; delta: number; onHandAfter: number; reason: MovementReason; note: string | null; reference: string | null;
  actorName: string | null; createdAt: string;
}
export interface CatalogStats { products: number; activeProducts: number; draftProducts: number; lowStockVariants: number; outOfStockVariants: number; }

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = { DRAFT: 'Szkic', ACTIVE: 'Aktywny', ARCHIVED: 'Zarchiwizowany' };
export const MOVEMENT_REASON_LABELS: Record<MovementReason, string> = {
  INITIAL: 'Stan początkowy', RECEIPT: 'Przyjęcie dostawy', ADJUSTMENT: 'Korekta', DAMAGE: 'Uszkodzenie / strata',
  RETURN: 'Zwrot', SALE: 'Sprzedaż', ORDER_CANCELED: 'Anulowanie zamówienia', CORRECTION: 'Inwentaryzacja',
};
export const VAT_RATES: { bps: number; label: string }[] = [
  { bps: 2300, label: '23%' }, { bps: 800, label: '8%' }, { bps: 500, label: '5%' }, { bps: 0, label: '0%' },
];

// ---------------------------------------------------------------- orders & customers (Phase 3)
export type OrderStatus = 'NEW' | 'PROCESSING' | 'SHIPPED' | 'COMPLETED' | 'CANCELED';
export type OrderPaymentStatus = 'UNPAID' | 'PAID' | 'REFUNDED';
export type OrderPaymentMethod = 'BANK_TRANSFER' | 'COD' | 'MANUAL' | 'ONLINE';
export type ShippingType = 'COURIER' | 'PARCEL_LOCKER' | 'POST' | 'PICKUP' | 'DIGITAL';

export interface OrderAddress { name: string; company: string | null; line1: string; line2: string | null; postalCode: string; city: string; countryCode: string; phone: string | null; }
export interface OrderBilling { invoice: boolean; companyName: string; taxId: string; address: OrderAddress | null; }
export interface OrderItem { id: string; productId: string | null; variantId: string | null; name: string; variantTitle: string | null; sku: string | null; quantity: number; unitPriceMinor: number; vatRateBps: number; lineTotalMinor: number; }
export interface OrderEvent { type: string; message: string; internal: boolean; actorName: string | null; createdAt: string; }
export interface Order {
  id: string; number: number; source: 'STOREFRONT' | 'PANEL'; status: OrderStatus; paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod; customerId: string | null; email: string; phone: string | null; firstName: string; lastName: string;
  shippingAddress: OrderAddress | null; billing: OrderBilling | null; shippingMethodName: string | null; shippingMinor: number;
  paymentFeeMinor: number; subtotalMinor: number; discountMinor: number; totalMinor: number; taxMinor: number; currency: string;
  customerNote: string | null; trackingNumber: string | null; items: OrderItem[]; events: OrderEvent[]; paidAt: string | null;
  shippedAt: string | null; completedAt: string | null; canceledAt: string | null; cancelReason: string | null; termsAcceptedAt: string | null; termsRevisionId: string | null; createdAt: string; version: number;
  pickupPoint: { carrier: string; code: string; name: string; address: string } | null; shippingCarrier: string | null;
}
export interface OrderRow {
  id: string; number: number; status: OrderStatus; paymentStatus: OrderPaymentStatus; paymentMethod: OrderPaymentMethod;
  customerName: string; email: string; itemCount: number; totalMinor: number; currency: string; createdAt: string;
}
export interface OrderStats { newOrders: number; processing: number; unpaid: number; ordersToday: number; revenueTodayMinor: number; revenue30dMinor: number; orders30d: number; currency: string; }
export interface DailySales { day: string; orders: number; revenueMinor: number; }
export interface ShippingMethod { id: string; name: string; description: string | null; type: ShippingType; priceMinor: number; freeFromMinor: number | null; active: boolean; position: number; version: number; carrier: string | null; requiresPickupPoint: boolean; }
export interface StorePaymentSettings { bankTransferEnabled: boolean; bankAccountHolder: string | null; bankAccountNumber: string | null; bankName: string | null; codEnabled: boolean; codFeeMinor: number; unpaidCancelDays: number; version: number; }
export interface CustomerAddress {
  company: string | null; line1: string | null; line2: string | null; postalCode: string | null; city: string | null; countryCode: string | null;
}
/** Where a marketing consent came from (RODO accountability). */
export type ConsentSource = 'CHECKOUT' | 'PANEL' | 'IMPORT';
export const CONSENT_SOURCE_LABELS: Record<ConsentSource, string> = { CHECKOUT: 'przy zamówieniu', PANEL: 'dodana w panelu', IMPORT: 'z importu' };
export interface Customer {
  id: string; email: string; firstName: string | null; lastName: string | null; phone: string | null; acceptsMarketing: boolean;
  marketingConsentAt: string | null; marketingConsentSource: ConsentSource | null; note: string | null; address: CustomerAddress; tags: string[];
  ordersCount: number; totalSpentMinor: number; lastOrderAt: string | null; createdAt: string; version: number;
  /** Set when the customer has a confirmed account in the store. */
  accountCreatedAt: string | null;
}
/** What the merchant enters when adding or editing a customer. */
export interface CustomerInput {
  email: string; firstName: string | null; lastName: string | null; phone: string | null; acceptsMarketing: boolean; note: string | null;
  address: CustomerAddress | null; tags: string[];
}
export interface CustomerImportResult { created: number; updated: number; skipped: number; errors: string[]; }

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { NEW: 'Nowe', PROCESSING: 'W realizacji', SHIPPED: 'Wysłane', COMPLETED: 'Zrealizowane', CANCELED: 'Anulowane' };
export const PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = { UNPAID: 'Nieopłacone', PAID: 'Opłacone', REFUNDED: 'Zwrócone' };
export const PAYMENT_METHOD_LABELS: Record<OrderPaymentMethod, string> = { BANK_TRANSFER: 'Przelew tradycyjny', COD: 'Za pobraniem', MANUAL: 'Inna (ręcznie)', ONLINE: 'Płatność online' };
export const SHIPPING_TYPE_LABELS: Record<ShippingType, string> = { COURIER: 'Kurier', PARCEL_LOCKER: 'Paczkomat / automat', POST: 'Poczta', PICKUP: 'Odbiór osobisty', DIGITAL: 'Dostawa elektroniczna' };

// ---------------------------------------------------------------- storefront & themes (Phase 4)
export interface ThemeField { key: string; label: string; type: 'COLOR' | 'SELECT' | 'TEXT' | 'IMAGE' | 'URL'; options: string[] | null; maxLength: number; group: string; }
export type SectionPropKind = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'LINK' | 'IMAGE' | 'CATEGORY' | 'CATEGORIES' | 'ITEMS' | 'TOGGLE';
export interface SectionProp { key: string; label: string; kind: SectionPropKind; options: string[] | null; max: number; itemProps: SectionProp[] | null; help: string | null; }
export interface SectionType { type: string; name: string; description: string; props: SectionProp[]; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ThemeSection { id: string; type: string; enabled: boolean; data: Record<string, any>; }
export interface ThemePreset { code: string; name: string; description: string; defaults: Record<string, string>; sections: ThemeSection[]; }
export interface ThemeConfig { code: string; settings: Record<string, string>; sections: ThemeSection[]; }
export interface ThemeState { draft: ThemeConfig; published: ThemeConfig | null; publishedAt: string | null; unpublishedChanges: boolean; version: number; }
export interface ThemeResponse { presets: ThemePreset[]; fields: ThemeField[]; sectionTypes: SectionType[]; state: ThemeState; }
export interface PublishReadiness { ready: boolean; missing: string[]; }
export interface ProductImage { id: string; alt: string | null; width: number; height: number; position: number; urls: Record<string, string>; }

// ------------------------------------------------------------------------------------------------ content (pages, blog, redirects)
export type ContentKind = 'PAGE' | 'POST';
export type ContentStatus = 'DRAFT' | 'PUBLISHED';
export type LegalKey = 'TERMS' | 'PRIVACY' | 'RETURNS' | 'SHIPPING';
export interface ContentSummary {
  id: string; kind: ContentKind; systemKey: LegalKey | null; slug: string; path: string; title: string; status: ContentStatus;
  showInFooter: boolean; publishedAt: string | null; updatedAt: string;
}
export interface ContentEntry extends ContentSummary {
  excerpt: string | null; body: string; seoTitle: string | null; seoDescription: string | null; publishedRevision: number; version: number;
}
export interface ContentInput {
  kind: ContentKind; title: string; slug: string | null; excerpt: string | null; body: string; status: ContentStatus; showInFooter: boolean;
  seoTitle: string | null; seoDescription: string | null; version: number;
}
export interface LegalStatus { key: LegalKey; title: string; requiredForPublish: boolean; entry: ContentSummary | null; missing: string[]; }
/** Facts used by the legal document templates besides the company data (version -1 = not saved yet). */
export interface LegalSettings {
  shippingTime: string | null; effectiveDate: string | null; returnsAddress: string | null; analyticsTools: string | null; marketingTools: string | null;
  version: number;
}
export interface LegalTemplate { key: LegalKey; body: string; missing: string[]; }
export interface Redirect { id: string; fromPath: string; toPath: string; automatic: boolean; createdAt: string; }
export interface ContentRevision { title: string; body: string; publishedAt: string; }
export * from './rich-text';

// ------------------------------------------------------------------------------------------------ reviews
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface Review {
  id: string; productId: string; productName: string | null; orderId: string; orderNumber: number; authorName: string; rating: number;
  body: string | null; status: ReviewStatus; reply: string | null; repliedAt: string | null; moderatedAt: string | null; createdAt: string;
}

// ------------------------------------------------------------------------------------------------ navigation
export interface NavigationItem { label: string; path: string; }
export interface NavigationMenu { items: NavigationItem[]; custom: boolean; version: number; }

// ------------------------------------------------------------------------------------------------ online payments (store's operator)
export interface OperatorCredentialField { key: string; label: string; secret: boolean; hint: string | null; }
export interface OperatorDescriptor { id: string; name: string; description: string; credentials: OperatorCredentialField[]; docsUrl: string | null; /** Connected through a hosted onboarding (Stripe) — no keys typed in. */ connect?: boolean; /** The platform has what the operator needs. */ available?: boolean; }
export interface OnlinePaymentsState {
  providerId: string; providerName: string; sandbox: boolean; enabled: boolean; verifiedAt: string | null; filled: Record<string, boolean>; version: number;
}
export interface OnlinePaymentsOverview { operators: OperatorDescriptor[]; current: OnlinePaymentsState | null; }

// ------------------------------------------------------------------------------------------------ carriers and shipments
export interface CarrierDescriptor {
  id: string; name: string; description: string; credentials: OperatorCredentialField[]; services: ShippingType[]; docsUrl: string | null;
  /** One account, many couriers (Furgonetka, Apaczka): the store ticks the services it uses. */
  aggregator: boolean;
  /** Connected by signing in at the carrier (OAuth). */
  oauth: boolean;
  /** The platform has what the carrier needs (e.g. Shopivo's OAuth app). */
  available: boolean;
}
/** A courier service on an aggregator account; `courier` is a carrier code (inpost, dpd, dhl, gls, ups, poczta, orlen, fedex…). */
export interface CarrierService { id: string; name: string; courier: string | null; types: ShippingType[]; }
export interface CarrierAccount {
  carrierId: string; carrierName: string; sandbox: boolean; enabled: boolean; verifiedAt: string | null; filled: Record<string, boolean>; version: number;
  services: CarrierService[];
}
export interface CarrierServiceLinkedMethod { id: string; type: ShippingType; name: string; priceMinor: number; freeFromMinor: number | null; active: boolean; }
export interface CarrierServiceView { service: CarrierService; methods: CarrierServiceLinkedMethod[]; }
export interface CarrierServiceChoice { serviceId: string; type: ShippingType; name: string | null; priceMinor: number; freeFromMinor: number | null; }
/** Stripe Connect status of the store (platform readiness + the connected account as Stripe reports it). */
export interface StripeConnectStatus {
  platformConfigured: boolean; testMode: boolean; connected: boolean; chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean;
  requirementsDue: number; disabledReason: string | null;
}
export interface CarriersOverview { carriers: CarrierDescriptor[]; accounts: CarrierAccount[]; }
export type ShipmentStatus = 'PENDING' | 'READY' | 'IN_TRANSIT' | 'READY_FOR_PICKUP' | 'DELIVERED' | 'RETURNED' | 'FAILED' | 'CANCELED';
export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'Tworzenie u przewoźnika', READY: 'Gotowa do nadania', IN_TRANSIT: 'W drodze', READY_FOR_PICKUP: 'Czeka na odbiór',
  DELIVERED: 'Doręczona', RETURNED: 'Zwrócona do nadawcy', FAILED: 'Błąd', CANCELED: 'Anulowana',
};
export interface Shipment {
  id: string; carrierId: string; service: string; trackingNumber: string | null; trackingUrl: string | null; status: ShipmentStatus;
  carrierStatus: string | null; labelAvailable: boolean; error: string | null; createdAt: string; deliveredAt: string | null; sandbox: boolean;
}
export interface ShipmentInput { template: string | null; weightGrams: number | null; lengthMm: number | null; widthMm: number | null; heightMm: number | null; sendingMethod: 'PARCEL_LOCKER' | 'COURIER_PICKUP'; }

export type NewsletterStatus = 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED';

export interface NewsletterSubscriber {
  id: string; email: string; status: NewsletterStatus; source: string | null;
  createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null;
}

export type ReturnKind = 'WITHDRAWAL' | 'COMPLAINT';
export type ReturnStatus = 'REQUESTED' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';

export interface ReturnRequest {
  id: string; number: number; orderId: string; orderNumber: number; kind: ReturnKind; status: ReturnStatus; reason: string | null;
  refundAccount: string | null; merchantNote: string | null; customerEmail: string; customerName: string; valueMinor: number; currency: string;
  items: { orderItemId: string; name: string; variantTitle: string | null; quantity: number; unitPriceMinor: number }[];
  createdAt: string; decidedAt: string | null; completedAt: string | null; version: number;
}
