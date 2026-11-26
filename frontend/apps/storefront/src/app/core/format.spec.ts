import { describe, expect, it } from 'vitest';
import { money, readableOn } from './format';

describe('money', () => {
  it('formats minor units in Polish locale', () => {
    expect(money(17800).replace(/\s/g, ' ')).toBe('178,00 zł');
    expect(money(null)).toBe('');
  });
});

describe('readableOn', () => {
  it('picks the text colour with better contrast', () => {
    expect(readableOn('#2563EB')).toBe('#ffffff');
    expect(readableOn('#FACC15')).toBe('#111111');
    expect(readableOn('nie-kolor')).toBe('#ffffff');
  });
});
