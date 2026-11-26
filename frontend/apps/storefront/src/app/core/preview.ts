import { HttpInterceptorFn } from '@angular/common/http';
import { Injectable, PLATFORM_ID, REQUEST, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const KEY = 'shopivo.preview';

/**
 * Preview token from the merchant's link (`?podglad=`). On the server it is read from the request URL; in the browser it
 * is kept for the tab (sessionStorage) so client-side navigation stays in preview. The token is signed and short-lived;
 * the backend validates it for the requested store.
 */
@Injectable({ providedIn: 'root' })
export class StorePreview {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly request = inject(REQUEST, { optional: true });
  private cached: string | null | undefined;

  token(): string | null {
    if (this.cached !== undefined) return this.cached;
    let token: string | null = null;
    if (this.browser) {
      const fromUrl = new URL(window.location.href).searchParams.get('podglad');
      try {
        if (fromUrl) sessionStorage.setItem(KEY, fromUrl);
        token = fromUrl ?? sessionStorage.getItem(KEY);
      } catch {
        token = fromUrl;
      }
    } else if (this.request) {
      token = new URL(this.request.url).searchParams.get('podglad');
    }
    this.cached = token && /^[0-9a-f-]{36}\.\d+\.[A-Za-z0-9_-]+$/.test(token) ? token : null;
    return this.cached;
  }
}

export const previewInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(StorePreview).token();
  return token && req.url.includes('/api/v1/storefront/') ? next(req.clone({ setHeaders: { 'X-Store-Preview': token } })) : next(req);
};
