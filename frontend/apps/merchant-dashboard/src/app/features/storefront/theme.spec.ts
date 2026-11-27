import { describe, expect, it } from 'vitest';
import { INDUSTRIES } from '../catalog/industries';
import { contrast } from './appearance.page';
import { THEME_META, onColor, radiusOf } from './theme-meta';

describe('theme helpers', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
    expect(contrast('#1A1A1A', '#FFFFFF')).toBeGreaterThan(4.5);
  });

  it('picks readable text on a colour', () => {
    expect(onColor('#111111')).toBe('#fff');
    expect(onColor('#FACC15')).toBe('#111');
  });

  it('maps corner styles', () => {
    expect(radiusOf('none')).toBe('0');
    expect(radiusOf('round')).toBe('14px');
  });

  it('templates recommend only existing store industries', () => {
    const known = new Set(INDUSTRIES.map((i) => i.id));
    const used = Object.values(THEME_META).flatMap((m) => m.industries);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((i) => !known.has(i))).toEqual([]);
  });
});
