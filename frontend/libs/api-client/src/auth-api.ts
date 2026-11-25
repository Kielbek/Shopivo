import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { LoginResponse, Me, MfaStatus, SessionInfo, TotpSetup, UserView } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  acceptTerms: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/auth';

  me(): Observable<Me> {
    return this.http.get<Me>(`${this.base}/me`);
  }

  providers(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/providers`);
  }

  register(request: RegisterRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/register`, request);
  }

  verifyEmail(token: string): Observable<void> {
    return this.http.post<void>(`${this.base}/verify-email`, { token });
  }

  resendVerification(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/verify-email/resend`, { email });
  }

  login(email: string, password: string, rememberMe: boolean): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, password, rememberMe });
  }

  loginMfa(code: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login/mfa`, { code });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/logout`, null);
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.base}/password/forgot`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/password/reset`, { token, newPassword });
  }
}

@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/account';

  updateProfile(firstName: string, lastName: string, locale: string): Observable<UserView> {
    return this.http.patch<UserView>(`${this.base}/profile`, { firstName, lastName, locale });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.base}/password`, { currentPassword, newPassword });
  }

  sessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>(`${this.base}/sessions`);
  }

  revokeSession(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/sessions/${encodeURIComponent(id)}`);
  }

  revokeOtherSessions(): Observable<void> {
    return this.http.delete<void>(`${this.base}/sessions`);
  }

  mfaStatus(): Observable<MfaStatus> {
    return this.http.get<MfaStatus>(`${this.base}/mfa`);
  }

  startTotpSetup(): Observable<TotpSetup> {
    return this.http.post<TotpSetup>(`${this.base}/mfa/totp/setup`, null);
  }

  confirmTotp(code: string): Observable<{ recoveryCodes: string[] }> {
    return this.http.post<{ recoveryCodes: string[] }>(`${this.base}/mfa/totp/confirm`, { code });
  }

  disableMfa(password: string, code: string): Observable<void> {
    return this.http.post<void>(`${this.base}/mfa/disable`, { password, code });
  }
}
