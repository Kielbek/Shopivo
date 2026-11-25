import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');
const apiOrigin = process.env['SHOPIVO_API_URL'] ?? 'http://localhost:8080';

const app = express();
app.disable('x-powered-by');
// One instance serves every store: the visitor's host is forwarded to the backend, which resolves the store
// (unknown hosts → 404). Proxy headers are trusted only from the platform's load balancer.
app.set('trust proxy', process.env['SHOPIVO_TRUST_PROXY'] ?? 'loopback');
const angularApp = new AngularNodeAppEngine();

/** Browser-side storefront API calls (same origin) are proxied to the backend. Read-only for now. */
app.get('/api/v1/storefront/{*path}', async (req, res, next) => {
  try {
    const upstream = await fetch(apiOrigin + req.originalUrl, {
      headers: {
        accept: 'application/json',
        'x-forwarded-host': req.hostname,
        'x-forwarded-proto': req.protocol,
        'x-forwarded-for': req.ip ?? '',
      },
      signal: AbortSignal.timeout(10_000),
    });
    res.status(upstream.status);
    for (const header of ['content-type', 'cache-control']) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    next(error);
  }
});

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
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
