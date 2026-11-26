import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AuditLogEntry, InvitableRole, Invitation, MembershipStatus, MyStore, Page, SlugAvailability, Store,
  StoreRole, StoreSettings, TeamMember,
} from '@shopivo/shared-models';
import { Observable } from 'rxjs';

export interface StoreUpdate {
  name: string;
  contactEmail: string | null;
  defaultLocale: string;
  defaultCurrency: string;
  timezone: string;
  version: number;
}

@Injectable({ providedIn: 'root' })
export class StoresApi {
  private readonly http = inject(HttpClient);

  config(): Observable<{ platformDomain: string; storefrontUrlTemplate: string }> {
    return this.http.get<{ platformDomain: string; storefrontUrlTemplate: string }>('/api/v1/stores/config');
  }

  myStores(): Observable<MyStore[]> {
    return this.http.get<MyStore[]>('/api/v1/stores');
  }

  create(name: string, slug: string): Observable<Store> {
    return this.http.post<Store>('/api/v1/stores', { name, slug });
  }

  slugAvailability(slug: string): Observable<SlugAvailability> {
    return this.http.get<SlugAvailability>('/api/v1/stores/slug-availability', { params: { slug } });
  }

  acceptInvitation(token: string): Observable<{ tenantId: string }> {
    return this.http.post<{ tenantId: string }>('/api/v1/invitations/accept', { token });
  }
}

/** Endpoints scoped to one store (tenant). The backend verifies membership for every call. */
@Injectable({ providedIn: 'root' })
export class TenantApi {
  private readonly http = inject(HttpClient);

  private base(tenantId: string): string {
    return `/api/v1/tenants/${encodeURIComponent(tenantId)}`;
  }

  store(tenantId: string): Observable<Store> {
    return this.http.get<Store>(`${this.base(tenantId)}/store`);
  }

  updateStore(tenantId: string, update: StoreUpdate): Observable<Store> {
    return this.http.patch<Store>(`${this.base(tenantId)}/store`, update);
  }

  settings(tenantId: string): Observable<StoreSettings> {
    return this.http.get<StoreSettings>(`${this.base(tenantId)}/store/settings`);
  }

  updateSettings(tenantId: string, settings: StoreSettings): Observable<StoreSettings> {
    return this.http.put<StoreSettings>(`${this.base(tenantId)}/store/settings`, settings);
  }

  members(tenantId: string): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${this.base(tenantId)}/members`);
  }

  updateMember(tenantId: string, membershipId: string, change: { role?: StoreRole; status?: MembershipStatus }): Observable<unknown> {
    return this.http.patch(`${this.base(tenantId)}/members/${encodeURIComponent(membershipId)}`, change);
  }

  removeMember(tenantId: string, membershipId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(tenantId)}/members/${encodeURIComponent(membershipId)}`);
  }

  invitations(tenantId: string): Observable<Invitation[]> {
    return this.http.get<Invitation[]>(`${this.base(tenantId)}/invitations`);
  }

  invite(tenantId: string, email: string, role: InvitableRole): Observable<Invitation> {
    return this.http.post<Invitation>(`${this.base(tenantId)}/invitations`, { email, role });
  }

  resendInvitation(tenantId: string, invitationId: string): Observable<void> {
    return this.http.post<void>(`${this.base(tenantId)}/invitations/${encodeURIComponent(invitationId)}/resend`, null);
  }

  revokeInvitation(tenantId: string, invitationId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(tenantId)}/invitations/${encodeURIComponent(invitationId)}`);
  }

  auditLogs(tenantId: string, page: number, size = 50): Observable<Page<AuditLogEntry>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<Page<AuditLogEntry>>(`${this.base(tenantId)}/audit-logs`, { params });
  }
}
