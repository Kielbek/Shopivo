import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { storefrontApiInterceptor } from './api-origin';
import { previewInterceptor } from './core/preview';
import { templateDemoInterceptor } from './core/demo';
import { accountInterceptor } from './core/account';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch(), withInterceptors([templateDemoInterceptor, previewInterceptor, accountInterceptor, storefrontApiInterceptor])),
    provideClientHydration(withEventReplay()),
  ],
};
