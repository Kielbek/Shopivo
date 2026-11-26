import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { OnlinePaymentsOverview, OnlinePaymentsState } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

/** The store's own payment operator account (Przelewy24 / PayU / Tpay). Secrets are write-only. */
@Injectable({ providedIn: 'root' })
export class OnlinePaymentsApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}/online-payments`;
  }

  overview(t: string): Observable<OnlinePaymentsOverview> {
    return this.http.get<OnlinePaymentsOverview>(this.base(t));
  }

  save(t: string, input: { providerId: string; credentials: Record<string, string>; sandbox: boolean; version: number }): Observable<OnlinePaymentsState> {
    return this.http.put<OnlinePaymentsState>(this.base(t), input);
  }

  test(t: string): Observable<OnlinePaymentsState> {
    return this.http.post<OnlinePaymentsState>(`${this.base(t)}/test`, null);
  }

  setEnabled(t: string, enabled: boolean): Observable<OnlinePaymentsState> {
    return this.http.post<OnlinePaymentsState>(`${this.base(t)}/enabled`, { enabled });
  }
}
