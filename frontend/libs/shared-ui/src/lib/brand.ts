import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shopivo wordmark: a simple geometric bag mark + name. */
@Component({
  selector: 'sv-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2 text-zinc-900' },
  template: `
    <svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
      <rect x="3" y="7" width="18" height="14" rx="3" fill="currentColor" />
      <path d="M8 9V7a4 4 0 0 1 8 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="12" cy="14" r="2.2" fill="#2a8a78" />
    </svg>
    <span class="text-[16px] font-semibold tracking-[-0.02em]">Shopivo</span>
    @if (suffix()) {<span class="ml-1 rounded bg-zinc-900 px-1.5 py-0.5 text-[11px] font-medium text-white">{{ suffix() }}</span>}
  `,
})
export class LogoComponent {
  readonly suffix = input<string>();
}
