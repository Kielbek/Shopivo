import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ThemeSection } from '@shopivo/shared-models';
import { fontStack, onColor, radiusOf } from './theme-meta';

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
    <div class="relative overflow-hidden" [style.aspect-ratio]="phone() ? '9 / 17' : '16 / 10'" [style.background]="s['background']" [style.color]="s['text']"
      [style.font-family]="font()">
      @if (s['announcement']) {
        <div class="truncate px-2 py-[3px] text-center text-[7px] font-medium" [style.background]="s['accent']" [style.color]="on(s['accent'])">{{ s['announcement'] }}</div>
      }
      <!-- header -->
      <div class="flex items-center gap-2 px-[6%] py-[3%]" [style.border-bottom]="'1px solid ' + line()">
        <span class="truncate font-semibold" [style.font-size.px]="phone() ? 9 : 10">{{ storeName() || 'Twój sklep' }}</span>
        @if (!phone()) {
          <span class="ml-3 flex gap-2 text-[7px] opacity-70"><span>Nowości</span><span>Kategorie</span><span>O nas</span></span>
        }
        <span class="ml-auto flex gap-1.5">
          <span class="size-[7px] rounded-full border" [style.border-color]="s['text']"></span>
          <span class="size-[7px] rounded-[2px] border" [style.border-color]="s['text']"></span>
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
    </div>
  `,
})
export class ThemeMockComponent {
  readonly settings = input.required<Record<string, string>>();
  readonly sections = input<ThemeSection[] | null>(null);
  /** The first enabled banner section (falls back to the old flat settings). */
  protected readonly hero = computed<Record<string, string>>(() => {
    const h = (this.sections() ?? []).find((s) => s.type === 'hero' && s.enabled)?.data;
    const s = this.settings();
    return {
      layout: h?.['layout'] ?? s['heroLayout'] ?? 'centered', heading: h?.['heading'] ?? s['heroTitle'] ?? '',
      subheading: h?.['subheading'] ?? s['heroSubtitle'] ?? '', cta: h?.['cta'] ?? s['heroCta'] ?? '',
    };
  });
  readonly storeName = input('');
  readonly phone = input(false);

  protected readonly font = computed(() => fontStack(this.settings()['font']));
  protected readonly radius = computed(() => radiusOf(this.settings()['radius'], 0.45));
  protected readonly title = computed(() => this.hero()['heading'] || this.storeName() || 'Witaj w sklepie');
  protected readonly cards = computed(() => (this.phone() ? [1, 2, 3, 4] : [1, 2, 3, 4]));
  protected readonly line = computed(() => (onColor(this.settings()['background']) === '#fff' ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.10)'));

  protected on(hex: string): string {
    return onColor(hex);
  }
}
