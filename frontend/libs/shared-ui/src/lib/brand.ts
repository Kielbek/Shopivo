import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Shopivo wordmark: just the name, set in Inter — "shopıvo" with a neon tittle over the dotless i (the only accent).
 * `mark` = compact "s." for the collapsed navigation. `tone="light"` on the night navigation, `dark` on light pages.
 */
@Component({
  selector: 'sv-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-2 select-none', '[class.text-ink]': "tone() === 'dark'", '[class.text-nav-strong]': "tone() === 'light'" },
  template: `
    <span class="sr-only">Shopivo</span>
    @if (mark()) {
      <span class="relative inline-flex items-baseline text-[26px] font-extrabold leading-none tracking-[-0.06em]" aria-hidden="true">s<span
        class="ml-[0.04em] inline-block size-[0.24em] rounded-full" [class]="dotClass()"></span></span>
    } @else {
      <span class="inline-flex items-baseline text-[22px] font-bold leading-none tracking-[-0.05em]" aria-hidden="true">shop<span
        class="relative inline-block">ı<span class="absolute left-1/2 top-[0.07em] size-[0.19em] -translate-x-1/2 rounded-full" [class]="dotClass()"></span></span>vo</span>
      @if (suffix()) {<span class="rounded-full bg-neon px-2 py-0.5 text-[11px] font-semibold text-on-neon">{{ suffix() }}</span>}
    }
  `,
})
export class LogoComponent {
  readonly suffix = input<string>();
  readonly tone = input<'dark' | 'light'>('dark');
  /** Compact "s." (collapsed navigation). */
  readonly mark = input(false);
  /** The deeper neon reads on white and on black alike. */
  protected dotClass(): string {
    return 'bg-neon-deep';
  }
}
