import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Inline busy indicator — a small shimmering bar instead of a spinning circle (the product uses skeletons, not spinners).
 * Kept for places that need an inline "working" mark next to text.
 */
@Component({
  selector: 'sv-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'status', class: 'inline-flex items-center' },
  template: `
    <span class="sv-shimmer block rounded-full" [class]="size() === 'sm' ? 'h-2 w-6' : 'h-2.5 w-10'" aria-hidden="true"></span>
    <span class="sr-only">{{ label() }}</span>
  `,
})
export class SpinnerComponent {
  readonly size = input<'sm' | 'md'>('md');
  readonly label = input('Ładowanie…');
}

export type LoadingVariant = 'list' | 'table' | 'form' | 'cards' | 'detail' | 'page' | 'text';

/**
 * Loading state for pages and cards: shimmering skeletons shaped like the content that is coming (rows, a table, a
 * form, cards or a whole page). The label is announced to screen readers only.
 */
@Component({
  selector: 'sv-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', role: 'status', 'aria-live': 'polite', '[attr.aria-busy]': 'true' },
  template: `
    <span class="sr-only">{{ label() }}</span>
    <div aria-hidden="true">
      @switch (variant()) {
        @case ('table') {
          <div class="px-5 py-4">
            <div class="flex gap-6 border-b border-line pb-3">@for (c of cols; track $index) {<span class="sv-shimmer h-3 flex-1 rounded-[4px]" [style.max-width.px]="c"></span>}</div>
            @for (r of rowsArr(); track $index) {
              <div class="flex items-center gap-6 border-b border-line py-3.5 last:border-b-0">
                <span class="sv-shimmer size-9 shrink-0 rounded-[8px]"></span>
                @for (c of cols; track $index) {<span class="sv-shimmer h-3 flex-1 rounded-[4px]" [style.max-width.px]="c + ($index * 17) % 40"></span>}
              </div>
            }
          </div>
        }
        @case ('form') {
          <div class="grid gap-5 p-5 md:grid-cols-2">
            @for (r of rowsArr(); track $index) {
              <div [class.md:col-span-2]="$index === 0">
                <span class="sv-shimmer block h-3 w-28 rounded-[4px]"></span>
                <span class="sv-shimmer mt-2.5 block h-10 rounded-[10px]"></span>
              </div>
            }
          </div>
        }
        @case ('cards') {
          <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            @for (r of rowsArr(); track $index) {
              <div class="sv-card flex items-center gap-4 p-5">
                <span class="sv-shimmer size-12 shrink-0 rounded-full"></span>
                <span class="flex-1 space-y-2.5"><span class="sv-shimmer block h-3 w-2/3 rounded-[4px]"></span><span class="sv-shimmer block h-5 w-1/2 rounded-[4px]"></span></span>
              </div>
            }
          </div>
        }
        @case ('detail') {
          <div class="space-y-5">
            <div class="flex items-center gap-3"><span class="sv-shimmer size-9 rounded-[10px]"></span><span class="sv-shimmer h-6 w-64 rounded-[6px]"></span></div>
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div class="space-y-4">
                <div class="sv-card space-y-3 p-5">@for (r of rowsArr(); track $index) {<span class="sv-shimmer block h-3.5 rounded-[4px]" [style.width.%]="92 - ($index * 13) % 35"></span>}</div>
                <div class="sv-card space-y-3 p-5"><span class="sv-shimmer block h-4 w-40 rounded-[4px]"></span><span class="sv-shimmer block h-28 rounded-[10px]"></span></div>
              </div>
              <div class="space-y-4">
                @for (c of [0, 1]; track c) {
                  <div class="sv-card space-y-3 p-5"><span class="sv-shimmer block h-4 w-24 rounded-[4px]"></span><span class="sv-shimmer block h-10 rounded-[10px]"></span><span class="sv-shimmer block h-3 w-3/4 rounded-[4px]"></span></div>
                }
              </div>
            </div>
          </div>
        }
        @case ('page') {
          <div class="min-h-dvh bg-canvas">
            <div class="flex h-16 items-center gap-4 border-b border-line bg-card px-6"><span class="sv-shimmer h-8 w-28 rounded-[8px]"></span><span class="sv-shimmer ml-8 h-9 w-72 rounded-[10px]"></span></div>
            <div class="flex">
              <div class="hidden min-h-[calc(100dvh-4rem)] w-[264px] shrink-0 space-y-3 border-r border-line bg-card p-5 lg:block">@for (r of [0,1,2,3,4,5,6,7]; track r) {<span class="sv-shimmer block h-8 rounded-[10px]" [style.width.%]="90 - (r * 11) % 30"></span>}</div>
              <div class="flex-1 space-y-5 p-8"><span class="sv-shimmer block h-7 w-56 rounded-[6px]"></span><span class="sv-shimmer block h-24 rounded-[14px]"></span>
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">@for (c of [0,1,2,3]; track c) {<span class="sv-shimmer block h-24 rounded-[14px]"></span>}</div></div>
            </div>
          </div>
        }
        @case ('text') {
          <div class="space-y-2.5 py-2">@for (r of rowsArr(); track $index) {<span class="sv-shimmer block h-3.5 rounded-[4px]" [style.width.%]="95 - ($index * 17) % 40"></span>}</div>
        }
        @default {
          <ul class="px-5 py-2">
            @for (r of rowsArr(); track $index) {
              <li class="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                <span class="sv-shimmer size-10 shrink-0 rounded-[10px]"></span>
                <span class="flex-1 space-y-2"><span class="sv-shimmer block h-3.5 rounded-[4px]" [style.width.%]="60 - ($index * 9) % 25"></span><span class="sv-shimmer block h-3 rounded-[4px]" [style.width.%]="35 - ($index * 7) % 15"></span></span>
                <span class="sv-shimmer h-3.5 w-16 rounded-[4px]"></span>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class LoadingComponent {
  readonly label = input('Ładowanie…');
  readonly variant = input<LoadingVariant>('list');
  readonly rows = input(4);
  protected readonly cols = [140, 90, 70, 110];
  protected readonly rowsArr = computed(() => Array.from({ length: this.rows() }));
}

/** Shimmering placeholder block (skeleton). */
@Component({
  selector: 'sv-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sv-shimmer block rounded-[6px]', 'aria-hidden': 'true' },
  template: ``,
})
export class SkeletonComponent {}
