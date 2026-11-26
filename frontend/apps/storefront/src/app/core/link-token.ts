/**
 * One-time secret from an e-mail link. New links carry it in the fragment (`#t=…`), which browsers never send to servers,
 * so it cannot end up in proxy/CDN/access logs; `?t=` is still accepted for links sent before that change. Either way it
 * is removed from the address bar immediately.
 */
export function takeLinkToken(): string | null {
  const url = new URL(window.location.href);
  const fromHash = new URLSearchParams(url.hash.replace(/^#/, '')).get('t');
  const token = fromHash ?? url.searchParams.get('t');
  if (token) {
    url.searchParams.delete('t');
    history.replaceState(history.state, '', url.pathname + url.search);
  }
  return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
}

/** Router link + query parameters for a store-relative path such as `/szukaj?q=prezent`. */
export function routeOf(path: string): { path: string; query: Record<string, string> | null } {
  const i = path.indexOf('?');
  if (i < 0) return { path, query: null };
  const query: Record<string, string> = {};
  new URLSearchParams(path.slice(i + 1)).forEach((v, k) => (query[k] = v));
  return { path: path.slice(0, i), query };
}
