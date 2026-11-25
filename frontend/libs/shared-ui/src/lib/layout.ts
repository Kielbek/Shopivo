import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'sv-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between' },
  template: `
    <div class="min-w-0">
      <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-zinc-900">{{ title() }}</h1>
      @if (description()) {<p class="mt-1 max-w-2xl text-[13px] text-zinc-600">{{ description() }}</p>}
    </div>
    <div class="flex shrink-0 items-center gap-2"><ng-content /></div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

@Component({
  selector: 'sv-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grid gap-6 py-8 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] border-b border-zinc-200 last:border-b-0' },
  template: `
    <div>
      <h2 class="text-[15px] font-semibold text-zinc-900">{{ title() }}</h2>
      @if (description()) {<p class="mt-1 text-[13px] leading-5 text-zinc-600">{{ description() }}</p>}
    </div>
    <div class="min-w-0"><ng-content /></div>
  `,
})
export class SectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

@Component({
  selector: 'sv-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center px-6 py-14 text-center' },
  template: `
    <p class="text-[15px] font-medium text-zinc-900">{{ title() }}</p>
    @if (description()) {<p class="mt-1 max-w-md text-[13px] text-zinc-600">{{ description() }}</p>}
    <div class="mt-5 flex gap-2"><ng-content /></div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  success: 'bg-brand-50 text-brand-800 ring-brand-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  brand: 'bg-zinc-900 text-white ring-zinc-900',
};

@Component({
  selector: 'sv-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  protected readonly classes = computed(
    () => `inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-medium ring-1 ring-inset ${BADGE[this.tone()]}`,
  );
}
