import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';

/** Page title row: title, optional subtitle/meta, actions on the right. */
@Component({
  selector: 'sv-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between' },
  template: `
    <div class="min-w-0">
      <h1 class="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">{{ title() }}</h1>
      @if (description()) {<p class="mt-1 max-w-2xl text-[13px] text-ink-muted">{{ description() }}</p>}
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2"><ng-content /></div>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

/**
 * White card. With `heading` it renders a header row (title, optional subtitle and an `[card-actions]` slot).
 * Use `[flush]="true"` for edge-to-edge content such as tables.
 */
@Component({
  selector: 'sv-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sv-card block min-w-0' },
  template: `
    @if (heading()) {
      <div class="flex flex-wrap items-center justify-between gap-3 px-5 pt-5" [class.pb-4]="flush()">
        <div class="min-w-0">
          <h2 class="text-[15px] font-semibold text-ink">{{ heading() }}</h2>
          @if (subheading()) {<p class="mt-0.5 text-[12px] text-ink-muted">{{ subheading() }}</p>}
        </div>
        <div class="flex items-center gap-2"><ng-content select="[card-actions]" /></div>
      </div>
    }
    <div [class]="flush() ? '' : heading() ? 'px-5 pb-5 pt-4' : 'p-5'"><ng-content /></div>
  `,
})
export class CardComponent {
  readonly heading = input<string>();
  readonly subheading = input<string>();
  readonly flush = input(false);
}

/** Settings section: title and description above, the content in a card below (one reading column). */
@Component({
  selector: 'sv-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mt-7 block' },
  template: `
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-[14.5px] font-semibold text-ink">{{ title() }}</h2>
        @if (description()) {<p class="mt-0.5 max-w-2xl text-[13px] leading-[1.55] text-ink-soft">{{ description() }}</p>}
      </div>
      <ng-content select="[section-actions]" />
    </div>
    <div class="sv-card min-w-0 p-5"><ng-content /></div>
  `,
})
export class SectionComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
}

@Component({
  selector: 'sv-empty-state',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center px-6 py-9 text-center' },
  template: `
    <svg [lucideIcon]="ICONS[icon()]" [size]="22" [strokeWidth]="1.5" class="text-[#B9BDB6]" />
    <p class="mt-2.5 text-[13px] font-medium text-ink-soft">{{ title() }}</p>
    @if (description()) {<p class="mt-0.5 max-w-xs text-[12px] leading-5 text-ink-muted">{{ description() }}</p>}
    <div class="mt-4 flex gap-2 empty:mt-0"><ng-content /></div>
  `,
})
export class EmptyStateComponent {
  protected readonly ICONS = icons;
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly icon = input<IconName>('info');
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'violet';
const BADGE: Record<BadgeTone, string> = {
  neutral: 'bg-[#EEEFEB] text-ink-soft',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
  violet: 'bg-violet-soft text-violet-ink',
  brand: 'bg-neon text-night',
};

/** Light status pill. */
@Component({
  selector: 'sv-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
  template: `<ng-content />`,
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('neutral');
  protected readonly classes = computed(
    () => `inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-[12px] font-medium ${BADGE[this.tone()]}`,
  );
}

/** Initials avatar. */
@Component({
  selector: 'sv-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold',
    '[class]': 'sizeClass()',
    '[style.background]': 'palette().bg',
    '[style.color]': 'palette().fg',
    'aria-hidden': 'true',
  },
  template: `{{ initials() }}`,
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  protected readonly initials = computed(() =>
    this.name().trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?');
  protected readonly sizeClass = computed(() =>
    ({ sm: 'size-7 text-[11px]', md: 'size-9 text-[13px]', lg: 'size-12 text-[16px]' })[this.size()]);
  protected readonly palette = computed(() => {
    const options = [
      { bg: '#EFF8E2', fg: '#2E6B0F' }, { bg: '#F3EFFE', fg: '#6B4FD8' },
      { bg: '#EAF1FE', fg: '#2155C0' }, { bg: '#FFF4E5', fg: '#9A560A' }, { bg: '#FDEEEE', fg: '#BB2F35' },
    ];
    let hash = 0;
    for (const ch of this.name()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return options[hash % options.length];
  });
}
