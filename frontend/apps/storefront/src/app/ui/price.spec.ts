import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PriceComponent } from './price';

function render(inputs: Record<string, unknown>): string {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const f = TestBed.createComponent(PriceComponent);
  for (const [k, v] of Object.entries(inputs)) f.componentRef.setInput(k, v);
  f.detectChanges();
  return (f.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
}

describe('PriceComponent', () => {
  it('shows the Omnibus reference price only for reduced prices', () => {
    const reduced = render({ price: 4900, compareAt: 5900, lowest30: 5900 });
    expect(reduced).toContain('49,00');
    expect(reduced).toContain('Najniższa cena z 30 dni przed obniżką: 59,00');
    const regular = render({ price: 4900, compareAt: null, lowest30: 5900 });
    expect(regular).not.toContain('Najniższa');
  });
});
