import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Page, ReturnRequest, ReturnStatus } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReturnsApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}/returns`;
  }

  list(t: string, status: ReturnStatus | null, page: number): Observable<Page<ReturnRequest>> {
    let params = new HttpParams().set('page', page).set('size', 25);
    if (status) params = params.set('status', status);
    return this.http.get<Page<ReturnRequest>>(this.base(t), { params });
  }

  openCount(t: string): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base(t)}/open-count`);
  }

  decide(t: string, id: string, accept: boolean, note: string | null, version: number): Observable<ReturnRequest> {
    return this.http.post<ReturnRequest>(`${this.base(t)}/${encodeURIComponent(id)}/decision`, { accept, note, version });
  }

  complete(t: string, id: string, note: string | null, version: number): Observable<ReturnRequest> {
    return this.http.post<ReturnRequest>(`${this.base(t)}/${encodeURIComponent(id)}/complete`, { note, version });
  }
}
