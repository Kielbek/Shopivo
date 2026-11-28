import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** The store's Google sign-in keys. The client secret is write-only: responses only say whether it is set. */
export interface GoogleSignInSettings { clientId: string; secretSet: boolean; enabled: boolean; redirectUris: string[]; version: number; }

@Injectable({ providedIn: 'root' })
export class GoogleSignInApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}/google-sign-in`;
  }

  get(t: string): Observable<GoogleSignInSettings> {
    return this.http.get<GoogleSignInSettings>(this.base(t));
  }

  /** An empty secret keeps the stored one. */
  save(t: string, input: { clientId: string; clientSecret: string; enabled: boolean; version: number }): Observable<GoogleSignInSettings> {
    return this.http.put<GoogleSignInSettings>(this.base(t), input);
  }

  remove(t: string): Observable<void> {
    return this.http.delete<void>(this.base(t));
  }
}
