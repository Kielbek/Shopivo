import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AdminOverview, AdminTenantRow, AuditLogEntry, Page, TenantStatus, TenantView, UserView } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/admin';

  overview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>(`${this.base}/overview`);
  }

  tenants(query: string, status: TenantStatus | null, page: number, size = 25): Observable<Page<AdminTenantRow>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (query.trim()) params = params.set('q', query.trim());
    if (status) params = params.set('status', status);
    return this.http.get<Page<AdminTenantRow>>(`${this.base}/tenants`, { params });
  }

  suspendTenant(id: string, reason: string): Observable<TenantView> {
    return this.http.post<TenantView>(`${this.base}/tenants/${encodeURIComponent(id)}/suspend`, { reason });
  }

  reactivateTenant(id: string): Observable<TenantView> {
    return this.http.post<TenantView>(`${this.base}/tenants/${encodeURIComponent(id)}/reactivate`, null);
  }

  users(query: string, page: number, size = 25): Observable<Page<UserView>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (query.trim()) params = params.set('q', query.trim());
    return this.http.get<Page<UserView>>(`${this.base}/users`, { params });
  }

  suspendUser(id: string): Observable<UserView> {
    return this.http.post<UserView>(`${this.base}/users/${encodeURIComponent(id)}/suspend`, null);
  }

  reactivateUser(id: string): Observable<UserView> {
    return this.http.post<UserView>(`${this.base}/users/${encodeURIComponent(id)}/reactivate`, null);
  }

  auditLogs(page: number, tenantId?: string, size = 50): Observable<Page<AuditLogEntry>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (tenantId) params = params.set('tenantId', tenantId);
    return this.http.get<Page<AuditLogEntry>>(`${this.base}/audit-logs`, { params });
  }
}
