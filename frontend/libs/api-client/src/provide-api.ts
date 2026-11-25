import { HttpClient, HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { EnvironmentProviders, inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import { catchError, firstValueFrom, of, throwError } from 'rxjs';
import { ApiError } from './api-error';

/** Converts every HTTP error into an {@link ApiError}. */
export const apiErrorInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(catchError((error: unknown) => throwError(() => ApiError.from(error))));

/**
 * HTTP setup shared by the browser apps: same-origin `/api` (reverse proxy), cookie session,
 * double-submit CSRF (XSRF-TOKEN cookie → X-XSRF-TOKEN header, handled by Angular).
 */
export function provideShopivoApi(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(
      withFetch(),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([apiErrorInterceptor]),
    ),
    provideAppInitializer(() => {
      const http = inject(HttpClient);
      // Ensures the CSRF cookie exists before the first state-changing request.
      return firstValueFrom(http.get('/api/v1/auth/csrf').pipe(catchError(() => of(null))));
    }),
  ]);
}
