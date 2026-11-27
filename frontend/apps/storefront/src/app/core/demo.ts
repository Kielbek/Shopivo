import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, PLATFORM_ID, REQUEST, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { throwError } from 'rxjs';

const KEY = 'shopivo.template-demo';
const CODE = /^[A-Z]{2,20}$/;

/**
 * Template preview (`?szablon=VERA`): the storefront renders the template with its example catalogue, served by
 * `/api/v1/storefront/demo/{code}` — no store's data is read, and carts, orders and accounts are switched off.
 * Kept for the tab (sessionStorage) so navigation stays in the preview; "Zamknij podgląd" ends it.
 */
@Injectable({ providedIn: 'root' })
export class TemplateDemo {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly request = inject(REQUEST, { optional: true });
  private cached: string | null | undefined;

  code(): string | null {
    if (this.cached !== undefined) return this.cached;
    let code: string | null = null;
    if (this.browser) {
      const params = new URL(window.location.href).searchParams;
      const fromUrl = params.get('szablon');
      try {
        // A store preview link (the editor, same origin and tab) always shows the store itself, never a template demo
        if (params.has('podglad')) sessionStorage.removeItem(KEY);
        else if (fromUrl) sessionStorage.setItem(KEY, fromUrl);
        code = params.has('podglad') ? null : fromUrl ?? sessionStorage.getItem(KEY);
      } catch {
        code = fromUrl;
      }
    } else if (this.request) {
      code = new URL(this.request.url).searchParams.get('szablon');
    }
    this.cached = code && CODE.test(code) ? code : null;
    return this.cached;
  }

  /** Shown inside the panel's template page: closing would leave the store's own site in the frame. */
  framed(): boolean {
    try {
      return this.browser && window.self !== window.top;
    } catch {
      return true;
    }
  }

  close(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // storage unavailable — the reload below ends the preview anyway
    }
    window.location.href = '/';
  }
}

/** Template preview: catalogue requests go to the demo API; anything that would buy, sign in or write is refused here. */
export const templateDemoInterceptor: HttpInterceptorFn = (req, next) => {
  const code = inject(TemplateDemo).code();
  const marker = '/api/v1/storefront/';
  const at = req.url.indexOf(marker);
  if (!code || at < 0) return next(req);
  const rest = req.url.slice(at + marker.length);
  if (req.method !== 'GET' || /^(cart|checkout|account|orders|returns|newsletter|reviews\/?$|review)/.test(rest)) {
    return throwError(() => new HttpErrorResponse({ status: 409, url: req.url, error: { code: 'TEMPLATE_DEMO',
      detail: 'To podgląd szablonu z przykładowymi produktami — koszyk, zamówienia i konta działają w Twoim sklepie.' } }));
  }
  return next(req.clone({ url: req.url.slice(0, at) + marker + 'demo/' + code + '/' + rest }));
};
