import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { apiErrorInterceptor } from '@shopivo/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(LoginPage);
    http.expectOne('/api/v1/auth/providers').flush([]);
    await fixture.whenStable();
    return fixture;
  }

  it('validates required fields without calling the API', async () => {
    const fixture = await render();
    (fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('To pole jest wymagane.');
    http.expectNone('/api/v1/auth/login');
  });

  it('logs in and navigates to the return URL', async () => {
    const fixture = await render();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.componentRef.setInput('powrot', '/sklep/123');
    const el = fixture.nativeElement as HTMLElement;
    const email = el.querySelector<HTMLInputElement>('#email')!;
    const password = el.querySelector<HTMLInputElement>('#password')!;
    email.value = 'jan@example.com';
    email.dispatchEvent(new Event('input'));
    password.value = 'Bezpieczne-Haslo-2026';
    password.dispatchEvent(new Event('input'));

    const submit = fixture.componentInstance.submit();
    const req = http.expectOne('/api/v1/auth/login');
    expect(req.request.body).toEqual({ email: 'jan@example.com', password: 'Bezpieczne-Haslo-2026', rememberMe: false });
    req.flush({ mfaRequired: false });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/me').flush({ id: '1', email: 'jan@example.com', mfaPending: false });
    await submit;
    expect(navigate).toHaveBeenCalledWith('/sklep/123');
  });

  it('shows the server error and clears the password', async () => {
    const fixture = await render();
    fixture.componentInstance['form'].setValue({ email: 'jan@example.com', password: 'zle-haslo-123', rememberMe: false });
    const submit = fixture.componentInstance.submit();
    http.expectOne('/api/v1/auth/login').flush(
      { status: 401, code: 'INVALID_CREDENTIALS', detail: 'Nieprawidłowy e-mail lub hasło.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await submit;
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Nieprawidłowy e-mail lub hasło.');
    expect(fixture.componentInstance['form'].controls.password.value).toBe('');
  });
});
