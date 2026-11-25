import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AdminSubscriptionDetail, AdminSubscriptionRow, BillingInterval, BillingStats, ChangeResult, Charge, Coupon,
  PaymentProvider, PaymentStart, Plan, PlansResponse, Subscription, SubscriptionHistoryEntry, SubscriptionStatus, UsageReport,
} from '@shopivo/shared-models';
import { Observable } from 'rxjs';

/** Public plan list and the subscription of one store (tenant). */
@Injectable({ providedIn: 'root' })
export class BillingApi {
  private readonly http = inject(HttpClient);

  private base(tenantId: string): string {
    return `/api/v1/tenants/${encodeURIComponent(tenantId)}/subscription`;
  }

  plans(): Observable<PlansResponse> {
    return this.http.get<PlansResponse>('/api/v1/plans');
  }

  subscription(tenantId: string): Observable<Subscription> {
    return this.http.get<Subscription>(this.base(tenantId));
  }

  checkout(tenantId: string, planCode: string, interval: BillingInterval, couponCode: string | null): Observable<PaymentStart> {
    return this.http.post<PaymentStart>(`${this.base(tenantId)}/checkout`, { planCode, interval, couponCode: couponCode || null });
  }

  change(tenantId: string, planCode: string, interval: BillingInterval): Observable<ChangeResult> {
    return this.http.post<ChangeResult>(`${this.base(tenantId)}/change`, { planCode, interval });
  }

  cancel(tenantId: string): Observable<void> {
    return this.http.post<void>(`${this.base(tenantId)}/cancel`, null);
  }

  resume(tenantId: string): Observable<void> {
    return this.http.post<void>(`${this.base(tenantId)}/resume`, null);
  }

  charges(tenantId: string): Observable<Charge[]> {
    return this.http.get<Charge[]>(`${this.base(tenantId)}/charges`);
  }

  pay(tenantId: string, chargeId: string): Observable<PaymentStart> {
    return this.http.post<PaymentStart>(`${this.base(tenantId)}/charges/${encodeURIComponent(chargeId)}/pay`, null);
  }

  history(tenantId: string): Observable<SubscriptionHistoryEntry[]> {
    return this.http.get<SubscriptionHistoryEntry[]>(`${this.base(tenantId)}/history`);
  }
}

export interface PlanInput {
  code?: string; name: string; description: string | null; sortOrder: number; active: boolean; publicPlan: boolean;
  trialDays: number; entitlements: Record<string, string>; prices: Partial<Record<BillingInterval, number | null>>; version: number;
}

export interface CouponInput {
  code: string; description: string | null; percentOff: number | null; amountOffMinor: number | null;
  duration: 'ONCE' | 'REPEATING' | 'FOREVER'; durationMonths: number | null; maxRedemptions: number | null; validUntil: string | null;
}

/** Platform administration of billing. Mutations require PLATFORM_ADMIN (enforced by the backend). */
@Injectable({ providedIn: 'root' })
export class AdminBillingApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin';

  providers(): Observable<PaymentProvider[]> {
    return this.http.get<PaymentProvider[]>(`${this.base}/payment-providers`);
  }

  saveProvider(id: string, enabled: boolean, sandbox: boolean, credentials: Record<string, string>): Observable<PaymentProvider> {
    return this.http.put<PaymentProvider>(`${this.base}/payment-providers/${encodeURIComponent(id)}`, { enabled, sandbox, credentials });
  }

  activateProvider(id: string): Observable<PaymentProvider> {
    return this.http.post<PaymentProvider>(`${this.base}/payment-providers/${encodeURIComponent(id)}/activate`, null);
  }

  testProvider(id: string): Observable<PaymentProvider> {
    return this.http.post<PaymentProvider>(`${this.base}/payment-providers/${encodeURIComponent(id)}/test`, null);
  }

  plans(): Observable<{ plans: Plan[]; entitlements: PlansResponse['entitlements'] }> {
    return this.http.get<{ plans: Plan[]; entitlements: PlansResponse['entitlements'] }>(`${this.base}/plans`);
  }

  createPlan(input: PlanInput): Observable<Plan> {
    return this.http.post<Plan>(`${this.base}/plans`, input);
  }

  updatePlan(id: string, input: PlanInput): Observable<Plan> {
    return this.http.put<Plan>(`${this.base}/plans/${encodeURIComponent(id)}`, input);
  }

  coupons(): Observable<Coupon[]> {
    return this.http.get<Coupon[]>(`${this.base}/coupons`);
  }

  createCoupon(input: CouponInput): Observable<Coupon> {
    return this.http.post<Coupon>(`${this.base}/coupons`, input);
  }

  setCouponActive(id: string, active: boolean): Observable<Coupon> {
    return this.http.post<Coupon>(`${this.base}/coupons/${encodeURIComponent(id)}/active`, { active });
  }

  stats(): Observable<BillingStats> {
    return this.http.get<BillingStats>(`${this.base}/billing/stats`);
  }

  subscriptions(status: SubscriptionStatus | null, q: string): Observable<AdminSubscriptionRow[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    if (q.trim()) params = params.set('q', q.trim());
    return this.http.get<AdminSubscriptionRow[]>(`${this.base}/subscriptions`, { params });
  }

  subscription(tenantId: string): Observable<AdminSubscriptionDetail> {
    return this.http.get<AdminSubscriptionDetail>(`${this.base}/subscriptions/${encodeURIComponent(tenantId)}`);
  }

  extendTrial(tenantId: string, days: number, reason: string): Observable<void> {
    return this.http.post<void>(`${this.base}/subscriptions/${encodeURIComponent(tenantId)}/extend-trial`, { days, reason });
  }

  setOverride(tenantId: string, key: string, value: string, reason: string, expiresAt: string | null): Observable<void> {
    return this.http.put<void>(`${this.base}/subscriptions/${encodeURIComponent(tenantId)}/overrides/${encodeURIComponent(key)}`,
      { value, reason, expiresAt });
  }

  removeOverride(tenantId: string, key: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/subscriptions/${encodeURIComponent(tenantId)}/overrides/${encodeURIComponent(key)}`);
  }

  usage(month: string | null): Observable<UsageReport> {
    return this.http.get<UsageReport>(`${this.base}/billing/usage`, { params: month ? { month } : {} });
  }
}
