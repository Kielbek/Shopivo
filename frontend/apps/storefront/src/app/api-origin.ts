import { HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken, REQUEST, REQUEST_CONTEXT, inject } from '@angular/core';

/**
 * Backend origin used during server-side rendering (e.g. http://backend:8080). Provided only in the server config;
 * in the browser requests stay relative and go through the storefront server's /api proxy.
 */
/** Passed by server.ts to `AngularNodeAppEngine.handle()` for every request. */
export interface StorefrontRequestContext {
  clientIp?: string;
}

export const STOREFRONT_API_ORIGIN = new InjectionToken<string>('STOREFRONT_API_ORIGIN');

/**
 * On the server: calls the backend directly and forwards the visitor's host so the backend can resolve the store.
 * The backend trusts X-Forwarded-Host only from configured internal proxies.
 */
export const storefrontApiInterceptor: HttpInterceptorFn = (req, next) => {
  const origin = inject(STOREFRONT_API_ORIGIN, { optional: true });
  const request = inject(REQUEST, { optional: true });
  const context = inject(REQUEST_CONTEXT, { optional: true }) as StorefrontRequestContext | null;
  if (!origin || !req.url.startsWith('/api/')) {
    return next(req);
  }
  const headers: Record<string, string> = {};
  const host = request ? new URL(request.url).host : '';
  if (host) headers['X-Forwarded-Host'] = host;
  // Without the visitor's IP every SSR call would share the SSR server's address (and its rate limit).
  if (context?.clientIp) headers['X-Forwarded-For'] = context.clientIp;
  return next(req.clone({ url: origin + req.url, setHeaders: headers }));
};
