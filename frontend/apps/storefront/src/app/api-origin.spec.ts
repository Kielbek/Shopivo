import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { REQUEST, REQUEST_CONTEXT, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { STOREFRONT_API_ORIGIN, storefrontApiInterceptor } from './api-origin';

function setup(serverSide: boolean) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([storefrontApiInterceptor])),
      provideHttpClientTesting(),
      ...(serverSide
        ? [
            { provide: STOREFRONT_API_ORIGIN, useValue: 'http://backend:8080' },
            { provide: REQUEST, useValue: new Request('https://kawa.shopivo.pl/produkty') },
            { provide: REQUEST_CONTEXT, useValue: { clientIp: '198.51.100.7' } },
          ]
        : []),
    ],
  });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController) };
}

describe('storefrontApiInterceptor', () => {
  it('on the server calls the backend directly and forwards the visitor host', async () => {
    const { http, ctrl } = setup(true);
    const done = firstValueFrom(http.get('/api/v1/storefront/store'));
    const req = ctrl.expectOne('http://backend:8080/api/v1/storefront/store');
    expect(req.request.headers.get('X-Forwarded-Host')).toBe('kawa.shopivo.pl');
    expect(req.request.headers.get('X-Forwarded-For')).toBe('198.51.100.7');
    req.flush({});
    await done;
  });

  it('in the browser keeps relative same-origin URLs', async () => {
    const { http, ctrl } = setup(false);
    const done = firstValueFrom(http.get('/api/v1/storefront/store'));
    const req = ctrl.expectOne('/api/v1/storefront/store');
    expect(req.request.headers.has('X-Forwarded-Host')).toBe(false);
    req.flush({});
    await done;
  });
});
