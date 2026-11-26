import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Catalogue pages depend on the requesting host (store) and are rendered on the server (SEO). Cart, checkout and
 * confirmation hold private, browser-only state (cart token) and are rendered in the browser.
 */
export const serverRoutes: ServerRoute[] = [
  { path: 'koszyk', renderMode: RenderMode.Client },
  { path: 'zamowienie', renderMode: RenderMode.Client },
  { path: 'zamowienie/potwierdzenie', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
