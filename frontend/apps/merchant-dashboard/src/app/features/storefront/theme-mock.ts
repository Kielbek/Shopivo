import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { ThemeSection } from '@shopivo/shared-models';
import { displayStack, fontStack, onColor, radiusOf } from './theme-meta';

/**
 * A miniature storefront drawn from a template's settings (colours, font, corners, home layout, product cards) —
 * shown in the template gallery and as an instant preview while editing. Purely decorative for screen readers.
 */
@Component({
  selector: 'sv-theme-mock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
  template: `
    @let s = settings();
    <!-- Drawn at a fixed design width and scaled to the available space, so text keeps the proportions of a real page -->
    <div #box class="relative overflow-hidden" [style.aspect-ratio]="phone() ? '9 / 17' : '16 / 10'" [style.background]="s['background']">
    <div class="absolute left-0 top-0 origin-top-left overflow-hidden" [style.width.px]="designWidth()" [style.height.px]="designHeight()"
      [style.transform]="'scale(' + scale() + ')'" [style.color]="s['text']" [style.font-family]="font()">
      @if (s['announcement']) {
        @if (editorial()) {
          <div class="truncate px-2 py-[3px] text-center text-[6px] font-medium uppercase tracking-[0.12em]" [style.background]="s['text']" [style.color]="s['background']">{{ s['announcement'] }}</div>
        } @else {
          <div class="truncate px-2 py-[3px] text-center text-[7px] font-medium" [style.background]="s['accent']" [style.color]="on(s['accent'])">{{ s['announcement'] }}</div>
        }
      }
      <!-- header -->
      <div class="flex items-center gap-2 px-[6%] py-[3%]" [style.border-bottom]="playful() ? 'none' : '1px solid ' + line()"
        [style.background]="playful() ? gradient() : null" [style.color]="playful() ? '#fff' : null" [style.margin-bottom.px]="playful() ? -1 : null"
        [style.position]="playful() ? 'relative' : null" [style.z-index]="playful() ? 1 : null">
        @if (playful()) {
          <span class="truncate py-[1px] font-semibold leading-[1.35]" [style.font-family]="display()" [style.font-size.px]="phone() ? 12 : 13">{{ storeName() || 'Twój sklep' }}</span>
        } @else if (editorial()) {
          <span class="truncate font-bold uppercase tracking-[0.16em]" [style.font-family]="display()" [style.font-size.px]="phone() ? 9 : 11">{{ storeName() || 'Twój sklep' }}<span [style.color]="s['accent']">.</span></span>
        } @else {
          <span class="truncate font-semibold" [style.font-size.px]="phone() ? 9 : 10">{{ storeName() || 'Twój sklep' }}</span>
        }
        @if (!phone()) {
          <span class="ml-3 flex gap-2 text-[7px] opacity-70"><span>Nowości</span><span>Kategorie</span><span>O nas</span></span>
        }
        <!-- wishlist, account, cart -->
        <span class="ml-auto flex shrink-0 items-center gap-[5px]">
          <svg viewBox="0 0 24 24" class="size-[9px]" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 20s-7-4.4-9.2-8.6C1.3 8.5 3 5 6.4 5c2 0 3.3 1.1 4.1 2.3h3C14.3 6.1 15.6 5 17.6 5 21 5 22.7 8.5 21.2 11.4 19 15.6 12 20 12 20Z" stroke-linejoin="round"/></svg>
          <svg viewBox="0 0 24 24" class="size-[9px]" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>
          <svg viewBox="0 0 24 24" class="size-[9px]" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
        </span>
      </div>
      <!-- hero -->
      @switch (hero()['layout'] === 'image' ? 'banner' : hero()['layout']) {
        @case ('banner') {
          <div class="mx-[6%] mt-[4%] flex flex-col justify-center px-[6%] py-[7%]" [style.background]="s['primary']" [style.color]="on(s['primary'])" [style.border-radius]="radius()">
            <span class="font-semibold leading-tight" [style.font-size.px]="phone() ? 11 : 13">{{ title() }}</span>
            <span class="mt-1 text-[7px] opacity-80">{{ hero()['subheading'] }}</span>
            <span class="mt-2 w-fit px-2 py-1 text-[7px] font-semibold" [style.background]="s['background']" [style.color]="s['text']" [style.border-radius]="radius()">{{ hero()['cta'] || 'Zobacz' }}</span>
          </div>
        }
        @case ('playful') {
          <div class="relative pb-[2%] text-center text-white" [style.background]="gradient()">
            <span class="block px-[4%] pt-[3%] font-semibold uppercase leading-[1]" [style.font-family]="display()" [style.font-size.px]="phone() ? 14 : 19">{{ title() }}</span>
            <span class="mx-auto mt-1.5 inline-block rounded-full px-2 py-[2px] text-[5px] font-extrabold uppercase" [style.background]="s['background']" [style.color]="s['text']">{{ hero()['cta'] || 'Zobacz' }}</span>
            @if (heroImage(); as img) {<img [src]="img" alt="" class="mx-auto mt-1 block w-[92%] object-contain" [style.max-height.px]="phone() ? 58 : 62" />}
          </div>
          <!-- scalloped bottom edge, as on the real page -->
          <svg viewBox="0 0 1200 50" preserveAspectRatio="none" class="-mt-px block h-[9px] w-full" aria-hidden="true">
            <path [attr.fill]="s['accent']" d="M0 0H1200V1A50 49 0 0 1 1100 1A50 49 0 0 1 1000 1A50 49 0 0 1 900 1A50 49 0 0 1 800 1A50 49 0 0 1 700 1A50 49 0 0 1 600 1A50 49 0 0 1 500 1A50 49 0 0 1 400 1A50 49 0 0 1 300 1A50 49 0 0 1 200 1A50 49 0 0 1 100 1A50 49 0 0 1 0 1Z" />
          </svg>
        }
        @case ('editorial') {
          <div class="grid items-center gap-[5%] px-[6%] py-[3%]" [class]="phone() ? 'grid-cols-1' : 'grid-cols-2'" [style.background]="s['surface']">
            <div class="min-w-0">
              @if (hero()['eyebrow']) {<span class="block truncate text-[5px] font-semibold uppercase tracking-[0.2em]" [style.color]="s['accent']">{{ hero()['eyebrow'] }}</span>}
              <span class="mt-1 block font-semibold leading-[1.05]" [style.font-family]="display()" [style.font-size.px]="phone() ? 15 : 13">{{ title() }}</span>
              <span class="mt-2 flex flex-wrap gap-1">
                <span class="px-1.5 py-[3px] text-[5px] font-medium uppercase tracking-wider" [style.background]="s['primary']" [style.color]="on(s['primary'])">{{ hero()['cta'] || 'Zobacz' }}</span>
                @if (hero()['cta2']) {<span class="border px-1.5 py-[2px] text-[5px] font-medium uppercase tracking-wider" [style.border-color]="s['text']">{{ hero()['cta2'] }}</span>}
              </span>
            </div>
            <span class="relative block overflow-hidden rounded-[5px] shadow" [class]="phone() ? 'aspect-[4/3]' : 'aspect-[4/3] max-h-[78px]'" [style.background]="s['accent']">
              @if (heroImage(); as img) {<img [src]="img" alt="" class="size-full object-cover" loading="lazy" />}
            </span>
          </div>
        }
        @case ('split') {
          <div class="mx-[6%] mt-[4%] grid items-center gap-[4%]" [class]="phone() ? 'grid-cols-1' : 'grid-cols-2'">
            <div>
              <span class="block font-semibold leading-tight" [style.font-size.px]="phone() ? 11 : 13">{{ title() }}</span>
              <span class="mt-1 block text-[7px] opacity-70">{{ hero()['subheading'] }}</span>
              <span class="mt-2 inline-block px-2 py-1 text-[7px] font-semibold" [style.background]="s['primary']" [style.color]="on(s['primary'])" [style.border-radius]="radius()">{{ hero()['cta'] || 'Zobacz' }}</span>
            </div>
            <div class="grid grid-cols-2 gap-1">
              <span class="aspect-[3/4]" [style.background]="s['accent']" [style.border-radius]="radius()" style="opacity:.55"></span>
              <span class="aspect-[3/4]" [style.background]="s['surface']" [style.border-radius]="radius()" [style.border]="'1px solid ' + line()"></span>
            </div>
          </div>
        }
        @default {
          <div class="mx-[6%] mt-[4%] flex flex-col items-center px-[6%] py-[6%] text-center" [style.background]="s['surface']" [style.border-radius]="radius()">
            <span class="font-semibold leading-tight" [style.font-size.px]="phone() ? 11 : 13">{{ title() }}</span>
            <span class="mt-1 text-[7px] opacity-70">{{ hero()['subheading'] }}</span>
            <span class="mt-2 px-2 py-1 text-[7px] font-semibold" [style.background]="s['primary']" [style.color]="on(s['primary'])" [style.border-radius]="radius()">{{ hero()['cta'] || 'Zobacz' }}</span>
          </div>
        }
      }
      <!-- products -->
      @if (playful() && productImages().length) {
        <div class="mx-[6%] mt-[3%] grid gap-[3%]" [class]="phone() ? 'grid-cols-2' : 'grid-cols-4'">
          @for (img of productImages().slice(0, 4); track img) {
            <div class="rounded-[5px] border p-[3%] text-center" [style.border-color]="line()">
              <img [src]="img" alt="" class="block aspect-square w-full rounded-[4px] object-cover" loading="lazy" />
              <span class="mx-auto mt-[6%] block h-[3px] w-3/5 rounded-full opacity-70" [style.background]="s['text']"></span>
              <span class="mx-auto mt-[5%] block h-[5px] w-2/5 rounded-full" [style.background]="s['primary']"></span>
            </div>
          }
        </div>
      } @else if (editorial() && productImages().length) {
        <div class="mx-[6%] mt-[3%] grid gap-[3%]" [class]="phone() ? 'grid-cols-2' : 'grid-cols-4'">
          @for (img of productImages().slice(0, 4); track img) {
            <div>
              <img [src]="img" alt="" class="block aspect-[3/4] w-full rounded-[4px] object-cover" loading="lazy" />
              <span class="mt-[6%] flex items-center justify-between gap-1">
                <span class="block h-[3px] w-3/5 rounded-full opacity-60" [style.background]="s['text']"></span>
                <span class="block h-[3px] w-1/5 rounded-full" [style.background]="s['text']"></span>
              </span>
            </div>
          }
        </div>
      } @else {
      <div class="mx-[6%] mt-[5%] grid gap-[3%]" [class]="phone() ? 'grid-cols-2' : 'grid-cols-4'">
        @for (i of cards(); track i) {
          <div class="p-[6%]" [style.border-radius]="radius()" [style.background]="s['productCard'] === 'plain' ? 'transparent' : s['surface']"
            [style.border]="s['productCard'] === 'bordered' ? '1px solid ' + line() : 'none'"
            [style.box-shadow]="s['productCard'] === 'shadow' ? '0 3px 10px rgba(0,0,0,.10)' : 'none'">
            <span class="block aspect-square" [style.border-radius]="radius()" [style.background]="i % 2 ? s['accent'] : s['primary']" [style.opacity]="i % 2 ? 0.45 : 0.18"></span>
            <span class="mt-[6%] block h-[4px] w-4/5 rounded-full opacity-60" [style.background]="s['text']"></span>
            <span class="mt-[4%] block h-[4px] w-2/5 rounded-full" [style.background]="s['primary']"></span>
          </div>
        }
      </div>
      }
    </div>
    </div>
  `,
})
export class ThemeMockComponent {
  /** Design size the miniature is drawn at (a phone ~ 180 px wide, a desktop ~ 400 px), then scaled to fit. */
  protected readonly designWidth = computed(() => (this.phone() ? 180 : 400));
  protected readonly designHeight = computed(() => (this.phone() ? (180 * 17) / 9 : (400 * 10) / 16));
  private readonly width = signal(0);
  protected readonly scale = computed(() => (this.width() ? this.width() / this.designWidth() : 0));
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.box()?.nativeElement;
      if (!el) return;
      const ro = new ResizeObserver(() => this.width.set(el.clientWidth));
      ro.observe(el);
      this.width.set(el.clientWidth);
      destroy.onDestroy(() => ro.disconnect());
    });
  }

  readonly settings = input.required<Record<string, string>>();
  readonly sections = input<ThemeSection[] | null>(null);
  /** The first enabled banner section (falls back to the old flat settings). */
  protected readonly hero = computed<Record<string, string>>(() => {
    const h = (this.sections() ?? []).find((s) => s.type === 'hero' && s.enabled)?.data;
    const s = this.settings();
    return {
      layout: h?.['layout'] ?? s['heroLayout'] ?? 'centered', heading: h?.['heading'] ?? s['heroTitle'] ?? '',
      subheading: h?.['subheading'] ?? s['heroSubtitle'] ?? '', cta: h?.['cta'] ?? s['heroCta'] ?? '',
      eyebrow: h?.['eyebrow'] ?? '', cta2: h?.['cta2'] ?? '', image: h?.['image'] ?? '',
    };
  });
  readonly storeName = input('');
  /** Photos of the template's example products (drawn as product cards in magazine-style templates). */
  readonly productImages = input<string[]>([]);
  /** Template image reference → small URL (from the theme API; the store's own photos are not drawn here). */
  readonly templateImages = input<Record<string, string>>({});
  protected readonly editorial = computed(() => this.settings()['font'] === 'editorial');
  protected readonly playful = computed(() => this.settings()['font'] === 'playful');
  protected readonly gradient = computed(() => `linear-gradient(to right, ${this.settings()['accent']}, color-mix(in srgb, ${this.settings()['accent']} 55%, #ffd36b))`);
  readonly phone = input(false);

  protected readonly font = computed(() => fontStack(this.settings()['font']));
  protected readonly display = computed(() => displayStack(this.settings()['font']));
  /** Only the template's own photos can be drawn here (the store's library needs a request per store). */
  protected readonly heroImage = computed(() => this.templateImages()[this.hero()['image']] ?? null);
  protected readonly radius = computed(() => radiusOf(this.settings()['radius'], 0.45));
  protected readonly title = computed(() => this.hero()['heading'] || this.storeName() || 'Witaj w sklepie');
  protected readonly cards = computed(() => (this.phone() ? [1, 2, 3, 4] : [1, 2, 3, 4]));
  protected readonly line = computed(() => (onColor(this.settings()['background']) === '#fff' ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.10)'));

  protected on(hex: string): string {
    return onColor(hex);
  }
}
