import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CarrierAccount, CarriersOverview, Shipment, ShipmentInput } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

/** Carrier accounts (secrets write-only) and shipments of orders. */
@Injectable({ providedIn: 'root' })
export class ShippingApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}`;
  }

  carriers(t: string): Observable<CarriersOverview> {
    return this.http.get<CarriersOverview>(`${this.base(t)}/carriers`);
  }

  saveCarrier(t: string, carrier: string, input: { credentials: Record<string, string>; sandbox: boolean; version: number }): Observable<CarrierAccount> {
    return this.http.put<CarrierAccount>(`${this.base(t)}/carriers/${encodeURIComponent(carrier)}`, input);
  }

  testCarrier(t: string, carrier: string): Observable<CarrierAccount> {
    return this.http.post<CarrierAccount>(`${this.base(t)}/carriers/${encodeURIComponent(carrier)}/test`, null);
  }

  enableCarrier(t: string, carrier: string, enabled: boolean): Observable<CarrierAccount> {
    return this.http.post<CarrierAccount>(`${this.base(t)}/carriers/${encodeURIComponent(carrier)}/enabled`, { enabled });
  }

  shipments(t: string, orderId: string): Observable<Shipment[]> {
    return this.http.get<Shipment[]>(`${this.base(t)}/orders/${encodeURIComponent(orderId)}/shipments`);
  }

  createShipment(t: string, orderId: string, input: ShipmentInput): Observable<Shipment> {
    return this.http.post<Shipment>(`${this.base(t)}/orders/${encodeURIComponent(orderId)}/shipments`, input);
  }

  refresh(t: string, shipmentId: string): Observable<Shipment> {
    return this.http.post<Shipment>(`${this.base(t)}/shipments/${encodeURIComponent(shipmentId)}/refresh`, null);
  }

  label(t: string, shipmentId: string): Observable<Blob> {
    return this.http.get(`${this.base(t)}/shipments/${encodeURIComponent(shipmentId)}/label`, { responseType: 'blob' });
  }
}
