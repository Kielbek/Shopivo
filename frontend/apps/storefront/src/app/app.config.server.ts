import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { STOREFRONT_API_ORIGIN } from './api-origin';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: STOREFRONT_API_ORIGIN, useFactory: () => process.env['SHOPIVO_API_URL'] ?? 'http://localhost:8080' },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
