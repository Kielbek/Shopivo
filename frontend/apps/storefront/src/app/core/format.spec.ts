import { describe, expect, it } from 'vitest';
import { contrast, money, readableOn, readableTint } from './format';

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

describe('contrast and readableTint', () => {
  it('measures WCAG contrast and darkens a light accent until it is readable on the background', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#F8BF73', '#FFF8EE')).toBeLessThan(4.5);
    const ink = readableTint('#F8BF73', '#FFF8EE');
    expect(contrast(ink, '#FFF8EE')).toBeGreaterThanOrEqual(4.5);
    expect(readableTint('#1d4ed8', '#ffffff')).toBe('#1d4ed8');
  });
});
