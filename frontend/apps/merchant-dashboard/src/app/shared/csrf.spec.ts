import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ApiError, SessionStore, shopivoInterceptors } from '@shopivo/api-client';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('CSRF and session interceptors', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors(shopivoInterceptors)),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  const flushTick = () => new Promise((r) => setTimeout(r));

  it('fetches the token once and sends it only on state-changing requests', async () => {
    const get = firstValueFrom(http.get('/api/v1/stores'));
    expect(ctrl.expectOne('/api/v1/stores').request.headers.has('X-XSRF-TOKEN')).toBe(false);
    ctrl.expectNone('/api/v1/auth/csrf');

    const post = firstValueFrom(http.post('/api/v1/stores', {}));
    ctrl.expectOne('/api/v1/auth/csrf').flush({ token: 't1' });
    await flushTick();
    expect(ctrl.expectOne((r) => r.method === 'POST').request.headers.get('X-XSRF-TOKEN')).toBe('t1');

    const second = firstValueFrom(http.patch('/api/v1/x', {}));
    await flushTick();
    ctrl.expectNone('/api/v1/auth/csrf');
    expect(ctrl.expectOne('/api/v1/x').request.headers.get('X-XSRF-TOKEN')).toBe('t1');
    void get; void post; void second;
  });

  it('refreshes the token and retries once after CSRF_INVALID', async () => {
    const done = firstValueFrom(http.post('/api/v1/stores', {}));
    ctrl.expectOne('/api/v1/auth/csrf').flush({ token: 'old' });
    await flushTick();
    ctrl.expectOne((r) => r.method === 'POST').flush({ status: 403, code: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' });
    ctrl.expectOne('/api/v1/auth/csrf').flush({ token: 'new' });
    await flushTick();
    const retry = ctrl.expectOne((r) => r.method === 'POST');
    expect(retry.request.headers.get('X-XSRF-TOKEN')).toBe('new');
    retry.flush({ ok: true });
    expect(await done).toEqual({ ok: true });
  });

  it('gives up after one retry and surfaces a normalised ApiError', async () => {
    const done = firstValueFrom(http.post('/api/v1/stores', {})).catch((e) => e);
    ctrl.expectOne('/api/v1/auth/csrf').flush({ token: 'a' });
    await flushTick();
    ctrl.expectOne((r) => r.method === 'POST').flush({ status: 403, code: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' });
    ctrl.expectOne('/api/v1/auth/csrf').flush({ token: 'b' });
    await flushTick();
    ctrl.expectOne((r) => r.method === 'POST').flush({ status: 403, code: 'CSRF_INVALID', detail: 'Sesja formularza wygasła.' },
      { status: 403, statusText: 'Forbidden' });
    const error = await done;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('CSRF_INVALID');
  });

  it('redirects to login when the session expires mid-work', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const clear = vi.spyOn(TestBed.inject(SessionStore), 'clear');
    const req = firstValueFrom(http.get('/api/v1/stores')).catch(() => null);
    ctrl.expectOne('/api/v1/stores').flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
    await req;
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/logowanie'], expect.anything());
  });

  it('does not redirect for 401 from auth endpoints (e.g. wrong password)', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
    const req = firstValueFrom(http.get('/api/v1/auth/me')).catch(() => null);
    ctrl.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    await req;
    expect(navigate).not.toHaveBeenCalled();
  });
});
