import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shopivo wordmark: neon rounded-square monogram with a night "s", lower-case wordmark (`tone="light"` on the night frame). */
@Component({
  selector: 'sv-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5', '[class.text-ink]': "tone() === 'dark'", '[class.text-white]': "tone() === 'light'" },
  template: `
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#B5F23D" />
      <!-- Geometric "s" built from two arcs; the dot = product/cart. -->
      <path d="M20.5 11.6c-.9-1.5-2.6-2.4-4.6-2.4-2.7 0-4.6 1.5-4.6 3.6 0 2.3 2 3.1 4.6 3.6 2.7.5 4.9 1.3 4.9 3.8 0 2.2-2.1 3.9-5 3.9-2.2 0-4-.9-5-2.6"
        fill="none" stroke="#0F1210" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="23.6" cy="23.4" r="2.1" fill="#0F1210" />
    </svg>
    @if (!mark()) {<span class="text-[17px] font-semibold tracking-[-0.025em]">shopivo</span>}
    @if (suffix() && !mark()) {<span class="rounded-full bg-neon px-2 py-0.5 text-[11px] font-semibold text-night">{{ suffix() }}</span>}
  `,
})
export class LogoComponent {
  readonly suffix = input<string>();
  readonly tone = input<'dark' | 'light'>('dark');
  /** Monogram only (collapsed navigation). */
  readonly mark = input(false);
}
