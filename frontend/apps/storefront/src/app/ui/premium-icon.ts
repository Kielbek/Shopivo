import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let seq = 0;

/**
 * Illustrated golden benefit icons of the playful layout (payment, returns, delivery, help) — artwork supplied with the
 * Bawiloo template. Other icon keys get a golden star. Purely decorative.
 */
@Component({
  selector: 'svg[sfPremiumIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { viewBox: '0 0 104 104', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
  template: `
    <svg:defs>
      <svg:linearGradient [attr.id]="gid" x1="18" y1="10" x2="65" y2="70" gradientUnits="userSpaceOnUse">
        <svg:stop stop-color="#ffe9ad" /><svg:stop offset=".48" stop-color="#ffc568" /><svg:stop offset="1" stop-color="#f3a043" />
      </svg:linearGradient>
    </svg:defs>
    <svg:path d="M52 5C65 2 72 12 84 20S101 39 97 53 98 77 82 88 60 102 47 97 20 97 11 83 3 61 8 47 6 25 21 16 39 8 52 5Z" fill="#f8bf73" fill-opacity=".075" />
    <svg:path d="M88 8v12m-6-6h12M9 76v8m-4-4h8" stroke="#f8bf73" stroke-width="2" />
    <svg:circle cx="92" cy="74" r="2" fill="#f8bf73" />
    @switch (sfPremiumIcon()) {
      @case ('shield') {<svg:g transform="translate(12 12)"><svg:path d="M40 11c-8 5-15 7-24 9v18c0 15 10 25 24 31 14-6 24-16 24-31V20c-9-2-16-4-24-9Z" [attr.fill]="gradient" stroke="#d88b30" stroke-width="2.5"/><svg:path d="M40 17c-7 4-13 6-18 7v14c0 12 7 20 18 26" stroke="#fff0c8" stroke-width="2.6" opacity=".8"/><svg:rect x="28" y="34" width="24" height="18" rx="6" fill="#fff1ce" stroke="#70421d" stroke-width="2.5"/><svg:path d="M33 34v-5a7 7 0 0 1 14 0v5" stroke="#70421d" stroke-width="2.7"/><svg:path d="m35 43 4 4 7-8" stroke="#70421d" stroke-width="2.8"/></svg:g>}
      @case ('return') {<svg:g transform="translate(12 12)"><svg:path d="M19 30 39 20l22 10v27L40 68 19 57Z" [attr.fill]="gradient" stroke="#d88b30" stroke-width="2.5"/><svg:path d="m19 30 21 11 21-11M40 41v27" stroke="#70421d" stroke-width="2.4"/><svg:path d="m29 25 21 11v8l-8 4v-8L21 29" fill="#fff0c8" stroke="#c88735" stroke-width="1.6"/><svg:path d="M63 18a25 25 0 0 0-42-5" stroke="#ffd58b" stroke-width="3.5"/><svg:path d="m21 5-1 10 11-2" stroke="#ffd58b" stroke-width="3.5"/><svg:path d="M67 37a12 12 0 1 1-12 12 12 12 0 0 1 12-12Z" fill="#fff1ce" stroke="#d88b30" stroke-width="2"/><svg:path d="M72 46h-9l3-3m-3 3 3 3m-3-3v4a4 4 0 0 0 4 4h3" stroke="#70421d" stroke-width="2.3"/></svg:g>}
      @case ('truck') {<svg:g transform="translate(12 12)"><svg:path d="M14 24h35a5 5 0 0 1 5 5v27H14a5 5 0 0 1-5-5V29a5 5 0 0 1 5-5Z" [attr.fill]="gradient" stroke="#d88b30" stroke-width="2.5"/><svg:path d="M54 33h11l10 12v11H54Z" fill="#f7b14f" stroke="#d88b30" stroke-width="2.5"/><svg:path d="M58 37h6l6 8H58Z" fill="#fff1ce" stroke="#70421d" stroke-width="1.9"/><svg:path d="M9 49h66" stroke="#70421d" stroke-width="2"/><svg:circle cx="23" cy="57" r="8" fill="#332821" stroke="#d88b30" stroke-width="2.5"/><svg:circle cx="62" cy="57" r="8" fill="#332821" stroke="#d88b30" stroke-width="2.5"/><svg:circle cx="23" cy="57" r="3" fill="#ffe0a2"/><svg:circle cx="62" cy="57" r="3" fill="#ffe0a2"/><svg:path d="M32 43c-2-2-9-6-9-11 0-6 7-7 9-2 2-5 9-4 9 2 0 5-7 9-9 11Z" fill="#fff1ce" stroke="#70421d" stroke-width="1.8"/><svg:path d="M4 35h8M2 42h6" stroke="#ffd58b" stroke-width="2.5"/></svg:g>}
      @case ('chat') {<svg:g transform="translate(12 12)"><svg:path d="M17 40v-7a23 23 0 0 1 46 0v7" stroke="#ffd58b" stroke-width="6"/><svg:path d="M22 30a18 18 0 0 1 36 0v14a18 18 0 0 1-36 0Z" [attr.fill]="gradient" stroke="#d88b30" stroke-width="2.5"/><svg:rect x="11" y="35" width="13" height="20" rx="6.5" fill="#fff1ce" stroke="#d88b30" stroke-width="2.2"/><svg:rect x="56" y="35" width="13" height="20" rx="6.5" fill="#fff1ce" stroke="#d88b30" stroke-width="2.2"/><svg:circle cx="33" cy="40" r="2" fill="#70421d"/><svg:circle cx="47" cy="40" r="2" fill="#70421d"/><svg:path d="M35 46q5 6 10 0" stroke="#70421d" stroke-width="2.2"/><svg:path d="M63 55v4q0 7-10 7h-7" stroke="#ffd58b" stroke-width="3"/><svg:rect x="37" y="63" width="12" height="6" rx="3" fill="#fff1ce" stroke="#d88b30" stroke-width="1.5"/></svg:g>}
      @default {<svg:g transform="translate(12 12)"><svg:path d="m40 10 8.5 17.5 19 2.7-13.8 13.4 3.3 19L40 53.6 23 62.6l3.3-19L12.5 30.2l19-2.7L40 10Z" [attr.fill]="gradient" stroke="#d88b30" stroke-width="2.5" /></svg:g>}
    }
  `,
})
export class PremiumIconComponent {
  readonly sfPremiumIcon = input<string>('star');
  protected readonly gid = `sf-gold-${++seq}`;
  protected readonly gradient = `url(#${this.gid})`;
}
