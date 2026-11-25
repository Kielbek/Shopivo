import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideShopivoApi } from '@shopivo/api-client';
import { routes } from './app.routes';
import { ShopivoTitleStrategy } from './shared/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideShopivoApi(),
    { provide: TitleStrategy, useClass: ShopivoTitleStrategy },
  ],
};
