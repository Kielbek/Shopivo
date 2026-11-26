import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Customer, DailySales, Order, OrderAddress, OrderBilling, OrderPaymentMethod, OrderPaymentStatus, OrderRow, OrderStats, OrderStatus,
  Page, ShippingMethod, ShippingType, StorePaymentSettings,
} from '@shopivo/shared-models';
import { Observable } from 'rxjs';

export interface OrderCustomerInput {
  email: string; phone: string | null; firstName: string; lastName: string; shippingAddress: OrderAddress | null;
  billing: OrderBilling | null; shippingMethodId: string | null; paymentMethod: OrderPaymentMethod; customerNote: string | null;
  termsAccepted: boolean; marketingConsent: boolean;
}

export interface ShippingInput {
  name: string; description: string | null; type: ShippingType; priceMinor: number; freeFromMinor: number | null; active: boolean;
  position: number | null; version: number; carrier: string | null;
}

/** Orders, customers, shipping and payment settings of one store. */
@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}`;
  }

  orders(t: string, q: { q?: string; status?: OrderStatus | null; paymentStatus?: OrderPaymentStatus | null; customerId?: string | null; page: number; size?: number })
    : Observable<Page<OrderRow>> {
    let params = new HttpParams().set('page', q.page).set('size', q.size ?? 25);
    if (q.q?.trim()) params = params.set('q', q.q.trim());
    if (q.status) params = params.set('status', q.status);
    if (q.paymentStatus) params = params.set('paymentStatus', q.paymentStatus);
    if (q.customerId) params = params.set('customerId', q.customerId);
    return this.http.get<Page<OrderRow>>(`${this.base(t)}/orders`, { params });
  }

  stats(t: string): Observable<OrderStats> {
    return this.http.get<OrderStats>(`${this.base(t)}/orders/stats`);
  }

  daily(t: string, days: number): Observable<DailySales[]> {
    return this.http.get<DailySales[]>(`${this.base(t)}/orders/daily`, { params: { days } });
  }

  order(t: string, id: string): Observable<Order> {
    return this.http.get<Order>(`${this.base(t)}/orders/${encodeURIComponent(id)}`);
  }

  create(t: string, lines: { variantId: string; quantity: number }[], customer: OrderCustomerInput): Observable<Order> {
    return this.http.post<Order>(`${this.base(t)}/orders`, { lines, customer });
  }

  changeStatus(t: string, id: string, status: OrderStatus, version: number, extra: { trackingNumber?: string | null; reason?: string | null } = {})
    : Observable<Order> {
    return this.http.post<Order>(`${this.base(t)}/orders/${encodeURIComponent(id)}/status`, { status, version, ...extra });
  }

  markPaid(t: string, id: string, version: number): Observable<Order> {
    return this.http.post<Order>(`${this.base(t)}/orders/${encodeURIComponent(id)}/paid`, { version });
  }

  markRefunded(t: string, id: string, version: number): Observable<Order> {
    return this.http.post<Order>(`${this.base(t)}/orders/${encodeURIComponent(id)}/refunded`, { version });
  }

  addNote(t: string, id: string, message: string): Observable<Order> {
    return this.http.post<Order>(`${this.base(t)}/orders/${encodeURIComponent(id)}/notes`, { message });
  }

  shippingMethods(t: string): Observable<ShippingMethod[]> {
    return this.http.get<ShippingMethod[]>(`${this.base(t)}/shipping-methods`);
  }

  createShipping(t: string, input: ShippingInput): Observable<ShippingMethod> {
    return this.http.post<ShippingMethod>(`${this.base(t)}/shipping-methods`, input);
  }

  updateShipping(t: string, id: string, input: ShippingInput): Observable<ShippingMethod> {
    return this.http.put<ShippingMethod>(`${this.base(t)}/shipping-methods/${encodeURIComponent(id)}`, input);
  }

  deleteShipping(t: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/shipping-methods/${encodeURIComponent(id)}`);
  }

  paymentSettings(t: string): Observable<StorePaymentSettings> {
    return this.http.get<StorePaymentSettings>(`${this.base(t)}/payment-settings`);
  }

  updatePaymentSettings(t: string, s: StorePaymentSettings): Observable<StorePaymentSettings> {
    return this.http.put<StorePaymentSettings>(`${this.base(t)}/payment-settings`, s);
  }

  customers(t: string, q: string, marketing: boolean, sort: string, page: number): Observable<Page<Customer>> {
    let params = new HttpParams().set('page', page).set('size', 25).set('sort', sort);
    if (q.trim()) params = params.set('q', q.trim());
    if (marketing) params = params.set('marketing', true);
    return this.http.get<Page<Customer>>(`${this.base(t)}/customers`, { params });
  }

  customer(t: string, id: string): Observable<Customer> {
    return this.http.get<Customer>(`${this.base(t)}/customers/${encodeURIComponent(id)}`);
  }

  updateCustomerNote(t: string, id: string, note: string, version: number): Observable<Customer> {
    return this.http.patch<Customer>(`${this.base(t)}/customers/${encodeURIComponent(id)}/note`, { note, version });
  }

  marketingExport(t: string): Observable<Blob> {
    return this.http.get(`${this.base(t)}/customers/marketing-export.csv`, { responseType: 'blob' });
  }
}
