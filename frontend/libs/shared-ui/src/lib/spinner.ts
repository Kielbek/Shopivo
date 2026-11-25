import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'sv-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', class: 'inline-flex' },
  template: `
    <svg [class]="size() === 'sm' ? 'size-4' : 'size-6'" class="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.18" stroke-width="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <span class="sr-only">{{ label() }}</span>
  `,
})
export class SpinnerComponent {
  readonly size = input<'sm' | 'md'>('md');
  readonly label = input('Ładowanie…');
}

/** Block loading state for pages and cards. */
@Component({
  selector: 'sv-loading',
  imports: [SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center justify-center gap-3 py-16 text-ink-muted' },
  template: `<sv-spinner class="text-primary" /><span class="text-[13px]">{{ label() }}</span>`,
})
export class LoadingComponent {
  readonly label = input('Ładowanie…');
}

/** Shimmering placeholder block (skeleton). */
@Component({
  selector: 'sv-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block animate-pulse rounded-[6px] bg-[#EEF0F4]', 'aria-hidden': 'true' },
  template: ``,
})
export class SkeletonComponent {}
