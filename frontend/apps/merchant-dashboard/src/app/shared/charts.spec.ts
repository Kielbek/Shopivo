import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DonutChartComponent, StatCardComponent, niceMax, smoothPath } from '@shopivo/shared-ui';
import { beforeEach, describe, expect, it } from 'vitest';

describe('chart helpers', () => {
  it('rounds axis maxima to readable numbers', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(610)).toBe(1000);
  });

  it('builds a smooth path through every point without overshooting flat segments', () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
    expect(d.startsWith('M0,10')).toBe(true);
    expect(d).toContain(' 10,10');
    expect(d.endsWith(' 20,0')).toBe(true);
    // Flat first segment: control points stay on y=10 (monotone interpolation).
    expect(d.split(' C')[1].startsWith('3.3333333333333335,10')).toBe(true);
    expect(smoothPath([])).toBe('');
  });
});

describe('StatCardComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('shows an explicit no-data state instead of a number', async () => {
    const f = TestBed.createComponent(StatCardComponent);
    f.componentRef.setInput('label', 'Zamówienia');
    f.componentRef.setInput('icon', 'orders');
    f.componentRef.setInput('value', null);
    f.componentRef.setInput('caption', 'Brak danych');
    await f.whenStable();
    expect(f.nativeElement.querySelector('[aria-label="Brak danych"]')).not.toBeNull();
  });

  it('formats positive and negative changes in Polish locale', async () => {
    const f = TestBed.createComponent(StatCardComponent);
    f.componentRef.setInput('label', 'Przychód');
    f.componentRef.setInput('icon', 'dollar');
    f.componentRef.setInput('value', '12 400 zł');
    f.componentRef.setInput('change', -3.25);
    await f.whenStable();
    expect(f.nativeElement.textContent).toContain('-3,3%');
  });
});

describe('DonutChartComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('renders one arc per non-empty segment and percentages that sum to 100', async () => {
    const f = TestBed.createComponent(DonutChartComponent);
    f.componentRef.setInput('segments', [
      { label: 'Aktywne', value: 3, color: '#5B8DEF' },
      { label: 'Zawieszone', value: 1, color: '#A58AF7' },
      { label: 'Zamknięte', value: 0, color: '#ccc' },
    ]);
    await f.whenStable();
    expect(f.nativeElement.querySelectorAll('circle').length).toBe(3); // track + 2 arcs
    expect(f.nativeElement.textContent).toContain('75%');
    expect(f.nativeElement.textContent).toContain('25%');
  });
});
