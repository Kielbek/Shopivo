import { ApplicationConfig, CSP_NONCE, REQUEST_CONTEXT, inject, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { STOREFRONT_API_ORIGIN, StorefrontRequestContext } from './api-origin';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: STOREFRONT_API_ORIGIN, useFactory: () => process.env['SHOPIVO_API_URL'] ?? 'http://localhost:8080' },
    { provide: CSP_NONCE, useFactory: () => (inject(REQUEST_CONTEXT, { optional: true }) as StorefrontRequestContext | null)?.cspNonce ?? null },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
