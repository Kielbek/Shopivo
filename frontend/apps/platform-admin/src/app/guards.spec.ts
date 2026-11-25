import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { platformStaffGuard } from '@shopivo/api-client';
import { beforeEach, describe, expect, it } from 'vitest';

describe('platformStaffGuard', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  async function run(me: object | null): Promise<boolean | UrlTree> {
    const result = TestBed.runInInjectionContext(() =>
      platformStaffGuard({} as ActivatedRouteSnapshot, { url: '/sklepy' } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;
    const req = http.expectOne('/api/v1/auth/me');
    if (me) req.flush(me);
    else req.flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
    return result;
  }

  it('allows platform staff', async () => {
    expect(await run({ id: '1', platformRole: 'PLATFORM_ADMIN', mfaPending: false })).toBe(true);
  });

  it('rejects merchants and anonymous users', async () => {
    const router = TestBed.inject(Router);
    expect(router.serializeUrl((await run({ id: '1', platformRole: null, mfaPending: false })) as UrlTree)).toBe('/brak-dostepu');
  });

  it('sends anonymous users to login with return URL', async () => {
    const router = TestBed.inject(Router);
    expect(router.serializeUrl((await run(null)) as UrlTree)).toBe('/logowanie?powrot=%2Fsklepy');
  });
});
