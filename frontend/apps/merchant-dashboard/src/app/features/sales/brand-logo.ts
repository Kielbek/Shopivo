import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Official logos of payment operators and carriers (files in /brands, sources and licences in docs/BRAND_ASSETS.md).
 * Brands without a logo file show their name on a neutral tile — we never draw look-alike logos.
 */
const LOGOS: Record<string, string> = {
  stripe: 'stripe.svg', przelewy24: 'przelewy24.png', blik: 'blik.jpg', inpost: 'inpost.svg', dpd: 'dpd.svg', dhl: 'dhl.svg', gls: 'gls.svg',
  ups: 'ups.svg', poczta: 'poczta.svg', orlen: 'orlen.svg', furgonetka: 'furgonetka.svg', apaczka: 'apaczka.png',
};

const NAMES: Record<string, string> = {
  payu: 'PayU', tpay: 'Tpay', fedex: 'FedEx', fake: 'Symulator', meest: 'Meest', ruch: 'Ruch', inpost: 'InPost',
};

@Component({
  selector: 'sv-brand-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-white' },
  template: `
    @if (file(); as f) {
      <img [src]="'/brands/' + f" [alt]="label()" class="max-h-[60%] max-w-[78%] object-contain" loading="lazy" />
    } @else {
      <span class="px-1.5 text-center text-[11px] font-semibold leading-tight tracking-tight text-ink-soft">{{ label() }}</span>
    }
  `,
})
export class BrandLogoComponent {
  /** Operator/carrier id or courier code (stripe, przelewy24, furgonetka, dpd…). */
  readonly brand = input.required<string | null>();
  /** Name shown when there is no logo file (defaults to a known name or the id). */
  readonly name = input<string | null>(null);

  protected readonly file = computed(() => LOGOS[(this.brand() ?? '').toLowerCase()] ?? null);
  protected readonly label = computed(() => this.name() ?? NAMES[(this.brand() ?? '').toLowerCase()] ?? (this.brand() ?? ''));
}

/** Has an official logo file (for choosing between logo and text in compact places). */
export function hasBrandLogo(brand: string | null | undefined): boolean {
  return !!brand && !!LOGOS[brand.toLowerCase()];
}
