import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ProductCard } from '../storefront-api';
import { SpotlightCarouselComponent } from './spotlight-carousel';

const card = (n: number): ProductCard =>
  ({ id: 'p' + n, slug: 'produkt-' + n, name: 'Produkt ' + n, priceMinor: 1000, compareAtMinor: 2000, currency: 'PLN' }) as unknown as ProductCard;

function render(count: number) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
  const f = TestBed.createComponent(SpotlightCarouselComponent);
  f.componentRef.setInput('items', Array.from({ length: count }, (_, i) => card(i + 1)));
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const middle = () => el.querySelector('a.sf-spot-slide[tabindex="0"] h3')!.textContent!.trim();
  const click = (label: string) => {
    (el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click();
    f.detectChanges();
  };
  return { el, middle, click, f };
}

describe('SpotlightCarouselComponent', () => {
  it('shows one product in the middle, wraps around and announces the position', () => {
    const { el, middle, click } = render(4);
    expect(middle()).toBe('Produkt 1');
    expect(el.querySelectorAll('a.sf-spot-slide[aria-hidden="true"]').length).toBe(3);
    click('Poprzedni produkt');
    expect(middle()).toBe('Produkt 4');
    click('Następny produkt');
    click('Następny produkt');
    expect(middle()).toBe('Produkt 2');
    expect(el.querySelector('[aria-live]')!.textContent).toContain('Produkt 2 z 4');
    expect(el.textContent).toContain('−50%');
  });

  it('a dot moves its product to the middle; one product has no dots and disabled arrows', () => {
    const many = render(5);
    (many.el.querySelectorAll('.sf-spot-dot')[3] as HTMLButtonElement).click();
    many.f.detectChanges();
    expect(many.middle()).toBe('Produkt 4');
    const one = render(1);
    expect(one.el.querySelectorAll('.sf-spot-dot').length).toBe(0);
    expect((one.el.querySelector('button[aria-label="Następny produkt"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
