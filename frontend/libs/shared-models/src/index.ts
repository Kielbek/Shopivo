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
