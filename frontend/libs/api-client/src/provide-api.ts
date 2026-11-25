import {
  HttpClient, HttpErrorResponse, HttpInterceptorFn, HttpRequest, provideHttpClient, withFetch, withInterceptors,
  withNoXsrfProtection,
} from '@angular/common/http';
import { EnvironmentProviders, Injectable, Injector, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, from, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { ApiError } from './api-error';
import { SessionStore } from './session-store';

const CSRF_ENDPOINT = '/api/v1/auth/csrf';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Endpoints after which the server rotates the CSRF token. */
const ROTATING_ENDPOINTS = ['/api/v1/auth/login', '/api/v1/auth/login/mfa', '/api/v1/auth/logout'];

/**
 * Holds the CSRF token. The cookie is HttpOnly (and `__Host-` prefixed in production, so sibling subdomains cannot
 * overwrite it); the token value is obtained from the response body of `GET /api/v1/auth/csrf`.
 */
@Injectable({ providedIn: 'root' })
export class CsrfTokenStore {
  private token: string | null = null;
  private pending: Observable<string> | null = null;

  constructor(private readonly injector: Injector) {}

  get(): Observable<string> {
    if (this.token) return of(this.token);
    return (this.pending ??= this.injector.get(HttpClient)
      .get<{ token: string }>(CSRF_ENDPOINT)
      .pipe(
        switchMap((r) => of(r.token)),
        tap((t) => {
          this.token = t;
          this.pending = null;
        }),
        catchError((e) => {
          this.pending = null;
          return throwError(() => e);
        }),
        shareReplay(1),
      ));
  }

  invalidate(): void {
    this.token = null;
  }
}

/** Adds the CSRF header to state-changing requests; refreshes the token once if the server rejects it. */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (SAFE_METHODS.has(req.method) || !req.url.startsWith('/api/')) {
    return next(req);
  }
  const store = inject(CsrfTokenStore);
  const send = (token: string) => next(req.clone({ setHeaders: { [CSRF_HEADER]: token } }));
  return store.get().pipe(
    switchMap((token) => send(token)),
    tap(() => {
      if (ROTATING_ENDPOINTS.includes(req.url)) store.invalidate();
    }),
    catchError((error: unknown) => {
      if (isCsrfFailure(error)) {
        store.invalidate();
        return store.get().pipe(switchMap((token) => send(token)));
      }
      if (ROTATING_ENDPOINTS.includes(req.url)) store.invalidate();
      return throwError(() => error);
    }),
  );
};

function isCsrfFailure(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403 && (error.error as { code?: string })?.code === 'CSRF_INVALID';
}

/** Converts every HTTP error into an {@link ApiError}. */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(catchError((error: unknown) => throwError(() => ApiError.from(error))));

/**
 * A 401 on a regular API call means the session expired or was revoked (logout elsewhere, password change,
 * account blocked). The user is sent to the login page and returned to the same place afterwards.
 */
export const sessionExpiredInterceptor: HttpInterceptorFn = (req, next) => {
  const injector = inject(Injector);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint(req)) {
        const router = injector.get(Router);
        injector.get(SessionStore).clear();
        const returnUrl = router.url.startsWith('/logowanie') ? undefined : router.url;
        void router.navigate(['/logowanie'], { queryParams: returnUrl ? { powrot: returnUrl } : {} });
      }
      return throwError(() => error);
    }),
  );
};

function isAuthEndpoint(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith('/api/v1/auth/');
}

/**
 * Interceptor chain in order. Requests flow top → bottom, errors bubble bottom → top, so the error normaliser must
 * be first (outermost): CSRF retry and session-expiry handling need to see the raw HttpErrorResponse.
 */
export const shopivoInterceptors: HttpInterceptorFn[] = [apiErrorInterceptor, csrfInterceptor, sessionExpiredInterceptor];

/**
 * HTTP setup shared by the browser apps: same-origin `/api` (reverse proxy), cookie session, CSRF header,
 * normalised errors and session-expiry handling. Angular's cookie-reading XSRF support is disabled on purpose.
 */
export function provideShopivoApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withNoXsrfProtection(),
      withInterceptors(shopivoInterceptors),
    ),
    provideAppInitializer(() => {
      const csrf = inject(CsrfTokenStore);
      return firstValueFrom(from(firstValueFrom(csrf.get())).pipe(catchError(() => of(null))));
    }),
  ]);
}
