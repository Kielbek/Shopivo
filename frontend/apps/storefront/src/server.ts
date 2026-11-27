import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StorefrontRequestContext } from './app/api-origin';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiOrigin = process.env['SHOPIVO_API_URL'] ?? 'http://localhost:8080';

/**
 * CSP hashes of the static inline scripts that the build puts into the HTML templates (Angular's event-replay contract,
 * the stylesheet loader). Computed from the built files at startup, so they always match the deployed bundle; any other
 * inline script needs this response's nonce.
 */
const STATIC_SCRIPT_HASHES = (() => {
  const hashes = new Set<string>();
  for (const file of [join(import.meta.dirname, 'index.server.html'), join(browserDistFolder, 'index.csr.html'), join(browserDistFolder, 'index.html')]) {
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1] ?? '';
      if (/\ssrc=/.test(attrs) || /type="application\/(ld\+)?json"/.test(attrs) || !m[2].trim()) continue;
      hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
    }
  }
  return [...hashes].join(' ');
})();

const app = express();
app.disable('x-powered-by');
// One instance serves every store: the visitor's host is forwarded to the backend, which resolves the store
// (unknown hosts → 404). Proxy headers are trusted only from the platform's load balancer.
app.set('trust proxy', process.env['SHOPIVO_TRUST_PROXY'] ?? 'loopback');
const angularApp = new AngularNodeAppEngine();

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'x-cart-token', 'x-order-token', 'x-review-token', 'x-store-preview', 'x-requested-with', 'x-captcha-token'];
/** The only cookie the storefront API ever sees: the customer session (HttpOnly, host-only). */
const CUSTOMER_COOKIE = 'shopivo_customer';
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'vary', 'retry-after'];

/** Proxies one request to the backend with the visitor's host and IP (the backend resolves the store from the host). */
async function proxy(req: express.Request, res: express.Response, next: express.NextFunction, path: string, body?: Buffer) {
  try {
    const headers: Record<string, string> = {
      'x-forwarded-host': req.hostname,
      'x-forwarded-proto': req.protocol,
      'x-forwarded-for': req.ip ?? '',
    };
    for (const h of FORWARDED_REQUEST_HEADERS) {
      const v = req.headers[h];
      if (typeof v === 'string') headers[h] = v;
    }
    const session = customerSession(req.headers.cookie);
    if (session && path.startsWith('/api/v1/storefront/account/')) headers['cookie'] = `${CUSTOMER_COOKIE}=${session}`;
    const upstream = await fetch(apiOrigin + path, {
      method: req.method,
      headers,
      body: body && body.length ? new Uint8Array(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    res.status(upstream.status);
    for (const header of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    if (path.startsWith('/api/v1/storefront/account/')) {
      const cookies = upstream.headers.getSetCookie().filter((c) => c.startsWith(CUSTOMER_COOKIE + '='));
      if (cookies.length) res.setHeader('set-cookie', cookies);
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    next(error);
  }
}

function customerSession(cookieHeader: string | undefined): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === CUSTOMER_COOKIE) {
      const value = rest.join('=');
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** Asks the backend for a redirect of the request path; only store-relative targets are ever followed. */
async function redirectFor(req: express.Request): Promise<string | null> {
  try {
    const upstream = await fetch(`${apiOrigin}/api/v1/storefront/redirect?path=${encodeURIComponent(req.path)}`, {
      headers: { 'x-forwarded-host': req.hostname, 'x-forwarded-proto': req.protocol, 'x-forwarded-for': req.ip ?? '' },
      signal: AbortSignal.timeout(3_000),
    });
    if (upstream.status !== 200) return null;
    const { location } = (await upstream.json()) as { location?: string };
    return typeof location === 'string' && /^\/(?!\/)/.test(location) && !location.includes('\\') ? location : null;
  } catch {
    return null;
  }
}

// Storefront API (cart and checkout included). Bodies are small JSON documents — anything larger is refused here.
app.all('/api/v1/storefront/{*path}', express.raw({ type: () => true, limit: '64kb' }), (req, res, next) => {
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    res.status(405).end();
    return;
  }
  void proxy(req, res, next, req.originalUrl, Buffer.isBuffer(req.body) ? req.body : undefined);
});

// Product images (immutable, long-cached; a CDN in front caches them at the edge).
app.get('/api/v1/media/{*path}', (req, res, next) => void proxy(req, res, next, req.originalUrl));
app.get('/api/v1/theme-assets/{*path}', (req, res, next) => void proxy(req, res, next, req.originalUrl));

// Per-store sitemap and robots.txt.
app.get('/sitemap.xml', (req, res, next) => void proxy(req, res, next, '/api/v1/storefront/sitemap.xml'));
app.get('/robots.txt', (req, res, next) => void proxy(req, res, next, '/api/v1/storefront/robots.txt'));

/**
 * Origins of the merchant panel (comma-separated, e.g. https://panel.shopivo.pl). Only preview responses (`?podglad=`,
 * draft content behind a signed token) may be framed by them — for the panel's device preview. Live pages stay unframeable.
 */
const PANEL_ORIGINS = (process.env['SHOPIVO_PANEL_ORIGIN'] ?? '')
  .split(',').map((o) => o.trim()).filter((o) => /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o));
/**
 * Local development without SHOPIVO_PANEL_ORIGIN: stores on `*.localhost` (which never resolve outside this machine)
 * may be previewed by the panel's dev server. Real hosts still need the variable.
 */
const LOCAL_PANEL_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];

function previewFramers(hostname: string): string[] {
  if (PANEL_ORIGINS.length) return PANEL_ORIGINS;
  return hostname === 'localhost' || hostname.endsWith('.localhost') ? LOCAL_PANEL_ORIGINS : [];
}

// Baseline security headers for every page.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Scripts only from this origin, Cloudflare Turnstile and inline scripts carrying this response's nonce (Angular's
  // SSR bootstrap). Merchant content is rendered without innerHTML, so this is defence in depth.
  const nonce = randomBytes(16).toString('base64');
  res.locals['cspNonce'] = nonce;
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${STATIC_SCRIPT_HASHES} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
    'frame-src https://challenges.cloudflare.com',
    ('podglad' in req.query || 'szablon' in req.query) && previewFramers(req.hostname).length ? `frame-ancestors 'self' ${previewFramers(req.hostname).join(' ')}` : "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  next();
});

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req, res, next) => {
  if ('podglad' in req.query) {
    // Draft content for one merchant: never cached by a CDN/browser, never indexed.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  angularApp
    .handle(req, { clientIp: req.ip, cspNonce: res.locals['cspNonce'] } satisfies StorefrontRequestContext)
    .then(async (response) => {
      if (!response) return next();
      // Only after a miss: a configured (or automatic, after a URL change) 301 for this path.
      if (response.status === 404 && req.method === 'GET') {
        const location = await redirectFor(req);
        if (location) return res.redirect(301, location);
      }
      return writeResponseToNodeResponse(response, res);
    })
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`Shopivo storefront listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
