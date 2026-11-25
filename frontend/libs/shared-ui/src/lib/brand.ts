import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shopivo wordmark: shopping bag mark in the brand blue with a violet accent. */
@Component({
  selector: 'sv-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2.5 text-ink' },
  template: `
    <svg viewBox="0 0 32 32" class="size-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#5B8DEF" />
      <path d="M11.5 12.5V11a4.5 4.5 0 0 1 9 0v1.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" />
      <path d="M8.75 12.5h14.5l-1.1 10.4a2 2 0 0 1-2 1.8h-8.3a2 2 0 0 1-2-1.8z" fill="#fff" />
      <circle cx="16" cy="18.2" r="2.4" fill="#A58AF7" />
    </svg>
    <span class="text-[17px] font-bold tracking-[-0.02em]">Shopivo</span>
    @if (suffix()) {<span class="rounded-[6px] bg-violet-soft px-1.5 py-0.5 text-[11px] font-semibold text-violet-ink">{{ suffix() }}</span>}
  `,
})
export class LogoComponent {
  readonly suffix = input<string>();
}
