import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shopivo wordmark: dark rounded-square "s" monogram with a violet accent dot, lower-case wordmark. */
@Component({
  selector: 'sv-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5 text-ink' },
  template: `
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#252B3B" />
      <!-- Geometric "s" built from two arcs, with a brand-blue tail; violet dot = product/cart accent. -->
      <path d="M20.5 11.6c-.9-1.5-2.6-2.4-4.6-2.4-2.7 0-4.6 1.5-4.6 3.6 0 2.3 2 3.1 4.6 3.6 2.7.5 4.9 1.3 4.9 3.8 0 2.2-2.1 3.9-5 3.9-2.2 0-4-.9-5-2.6"
        fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
      <circle cx="23.6" cy="23.4" r="2.1" fill="#A58AF7" />
    </svg>
    <span class="text-[17px] font-semibold tracking-[-0.025em]">shopivo</span>
    @if (suffix()) {<span class="rounded-[6px] bg-violet-soft px-1.5 py-0.5 text-[11px] font-semibold text-violet-ink">{{ suffix() }}</span>}
  `,
})
export class LogoComponent {
  readonly suffix = input<string>();
}
