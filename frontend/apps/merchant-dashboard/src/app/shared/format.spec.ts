import { moneyInput, parseMoney, plural } from '@shopivo/shared-ui';
import { describe, expect, it } from 'vitest';

describe('money input', () => {
  it('parses Polish amounts into grosze', () => {
    expect(parseMoney('79,90')).toBe(7990);
    expect(parseMoney('1 299')).toBe(129900);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('13,99 zł')).toBe(1399);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeUndefined();
    expect(parseMoney('1,999')).toBeUndefined();
  });

  it('formats grosze for editing', () => {
    expect(moneyInput(7990)).toBe('79,90');
    expect(moneyInput(null)).toBe('');
  });
});

describe('plural', () => {
  it('uses Polish plural forms', () => {
    expect(plural(1, 'zamówienie', 'zamówienia', 'zamówień')).toBe('1 zamówienie');
    expect(plural(3, 'zamówienie', 'zamówienia', 'zamówień')).toBe('3 zamówienia');
    expect(plural(5, 'zamówienie', 'zamówienia', 'zamówień')).toBe('5 zamówień');
    expect(plural(12, 'zamówienie', 'zamówienia', 'zamówień')).toBe('12 zamówień');
    expect(plural(22, 'zamówienie', 'zamówienia', 'zamówień')).toBe('22 zamówienia');
  });
});

import { isSafeRedirectUrl } from '@shopivo/shared-ui';

describe('payment redirect validation', () => {
  it('allows https and same-origin http only', () => {
    expect(isSafeRedirectUrl('https://secure.przelewy24.pl/trnRequest/X', 'https://app.shopivo.pl')).toBe(true);
    expect(isSafeRedirectUrl('http://localhost:4200/sklep/x/subskrypcja', 'http://localhost:4200')).toBe(true);
    expect(isSafeRedirectUrl('http://evil.example/pay', 'https://app.shopivo.pl')).toBe(false);
    expect(isSafeRedirectUrl('javascript:alert(1)', 'https://app.shopivo.pl')).toBe(false);
    expect(isSafeRedirectUrl('data:text/html,x', 'https://app.shopivo.pl')).toBe(false);
    expect(isSafeRedirectUrl(null)).toBe(false);
  });
});
