import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, Validators } from '@angular/forms';
import { ApiError, safeReturnUrl } from '@shopivo/api-client';
import { controlError, describeUserAgent, slugify } from '@shopivo/shared-ui';
import { describe, expect, it } from 'vitest';

describe('ApiError.from', () => {
  it('maps RFC 9457 problem details with field errors', () => {
    const error = ApiError.from(new HttpErrorResponse({
      status: 400,
      error: { status: 400, code: 'VALIDATION_FAILED', detail: 'Formularz zawiera błędy.',
        errors: [{ field: 'email', code: 'Email', message: 'Nieprawidłowy adres e-mail' }] },
    }));
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Formularz zawiera błędy.');
    expect(error.fieldErrors).toEqual({ email: 'Nieprawidłowy adres e-mail' });
  });

  it('produces a Polish message for network failures and non-problem bodies', () => {
    expect(ApiError.from(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK_ERROR');
    expect(ApiError.from(new HttpErrorResponse({ status: 502, error: '<html>' })).message).toContain('błąd serwera');
    expect(ApiError.from(new Error('x')).code).toBe('UNKNOWN');
  });
});

describe('safeReturnUrl', () => {
  it('accepts only same-app relative paths', () => {
    expect(safeReturnUrl('/sklep/abc')).toBe('/sklep/abc');
    expect(safeReturnUrl('//evil.com')).toBe('/');
    expect(safeReturnUrl('/\\evil.com')).toBe('/');
    expect(safeReturnUrl('https://evil.com')).toBe('/');
    expect(safeReturnUrl(undefined, '/start')).toBe('/start');
  });
});

describe('slugify', () => {
  it('mirrors backend slug rules for Polish names', () => {
    expect(slugify('Łódzka Kawiarnia & Ciasta!')).toBe('lodzka-kawiarnia-ciasta');
    expect(slugify('  Zażółć gęślą jaźń ')).toBe('zazolc-gesla-jazn');
    expect(slugify('a'.repeat(50)).length).toBe(40);
  });
});

describe('controlError', () => {
  it('shows messages only after interaction and prefers server errors', () => {
    const control = new FormControl('', [Validators.required, Validators.email]);
    expect(controlError(control)).toBeNull();
    control.markAsTouched();
    expect(controlError(control)).toBe('To pole jest wymagane.');
    control.setValue('zly');
    expect(controlError(control)).toBe('Podaj prawidłowy adres e-mail.');
    expect(controlError(control, 'Błąd z serwera')).toBe('Błąd z serwera');
  });
});

describe('describeUserAgent', () => {
  it('summarises common browsers', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'))
      .toBe('Chrome, Windows');
    expect(describeUserAgent(null)).toBe('Nieznane urządzenie');
  });
});
