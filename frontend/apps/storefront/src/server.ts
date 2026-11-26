import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import type { StorefrontRequestContext } from './app/api-origin';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiOrigin = process.env['SHOPIVO_API_URL'] ?? 'http://localhost:8080';

const app = express();
app.disable('x-powered-by');
// One instance serves every store: the visitor's host is forwarded to the backend, which resolves the store
// (unknown hosts → 404). Proxy headers are trusted only from the platform's load balancer.
app.set('trust proxy', process.env['SHOPIVO_TRUST_PROXY'] ?? 'loopback');
const angularApp = new AngularNodeAppEngine();

const FORWARDED_REQUEST_HEADERS = ['accept', 'content-type', 'x-cart-token', 'x-order-token', 'x-review-token', 'x-store-preview'];
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
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    next(error);
  }
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
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.status(405).end();
    return;
  }
  void proxy(req, res, next, req.originalUrl, Buffer.isBuffer(req.body) ? req.body : undefined);
});

// Product images (immutable, long-cached; a CDN in front caches them at the edge).
app.get('/api/v1/media/{*path}', (req, res, next) => void proxy(req, res, next, req.originalUrl));

// Per-store sitemap and robots.txt.
app.get('/sitemap.xml', (req, res, next) => void proxy(req, res, next, '/api/v1/storefront/sitemap.xml'));
app.get('/robots.txt', (req, res, next) => void proxy(req, res, next, '/api/v1/storefront/robots.txt'));

// Baseline security headers for every page.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
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
    .handle(req, { clientIp: req.ip } satisfies StorefrontRequestContext)
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
