import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LucideDynamicIcon } from '@lucide/angular';
import { StoreIndustry } from '@shopivo/shared-models';
import { icons } from '@shopivo/shared-ui';
import { INDUSTRIES } from '../catalog/industries';
import { ART_MOTIFS, artSquareSvg, suggestBackground } from '../catalog/category-art';

/** Graphic of each industry (motif ids from category-art). */
const INDUSTRY_ART: Record<StoreIndustry, string> = {
  FASHION: 'tshirt', FOOTWEAR: 'sneaker', ELECTRONICS: 'phone', COMPUTERS: 'laptop', FURNITURE: 'sofa', HOME: 'lamp', GARDEN: 'plant',
  COSMETICS: 'cosmetics', PERFUMES: 'perfume', JEWELLER: 'watch', SPORTS: 'sport', AUTOMOTIVE: 'auto', PETS: 'pets', TOYS: 'toys',
  KIDS: 'kids', GROCERY: 'basket', HOUSEHOLD: 'spray', BUILDING: 'paint', TOOLS: 'tools', STATIONERY: 'pencil', BOOKS: 'books',
  MUSIC: 'guitar', GAMES: 'gamepad', HOBBY: 'palette', HANDMADE: 'yarn', GIFTS: 'gift', JEWELRY: 'ring', ACCESSORIES: 'bag',
  MEDICAL: 'firstaid', ECO: 'eco', DIGITAL: 'digital', FOOD: 'food', OFFICE: 'briefcase', OUTDOOR: 'tent', GENERAL: 'shop',
};

export function industryArtId(id: StoreIndustry): string {
  return INDUSTRY_ART[id];
}

/** Grid of store industries (radio group) with a search box. Keyboard: Tab into the group, arrows move, Space selects. */
@Component({
  selector: 'sv-industry-picker',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input type="search" class="sv-input !bg-card pl-9" placeholder="Szukaj branży, np. buty, kosmetyki…" aria-label="Szukaj branży"
        [value]="query()" (input)="query.set($any($event.target).value)" />
    </div>
    <div role="radiogroup" [attr.aria-label]="label()" class="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" [class.lg:grid-cols-4]="wide()">
      @for (i of filtered(); track i.id) {
        <button type="button" role="radio" [attr.aria-checked]="value() === i.id" [tabIndex]="tabIndexOf(i.id)"
          class="group relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border text-left transition-[border-color,box-shadow]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          [class]="value() === i.id ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line bg-card hover:border-line-strong'"
          (click)="value.set(value() === i.id && clearable() ? null : i.id)" (keydown)="key($event, i.id)">
          <span class="block overflow-hidden leading-[0] transition-transform" [innerHTML]="art(i.id, i.label)"></span>
          <span class="block min-w-0 px-3 pb-3 pt-2.5">
            <span class="block truncate text-[13px] font-medium text-ink">{{ i.label }}</span>
            <span class="line-clamp-2 text-[11px] leading-4 text-ink-muted">{{ i.hint }}</span>
          </span>
          @if (value() === i.id) {
            <span class="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-ink text-white" aria-hidden="true">
              <svg [lucideIcon]="icons.check" [size]="14" [strokeWidth]="2.5" /></span>
          }
        </button>
      } @empty {
        <p class="col-span-full py-4 text-center text-[13px] text-ink-muted">Nic nie znaleziono — wybierz „Wielobranżowy”.</p>
      }
    </div>
  `,
})
export class IndustryPickerComponent {
  protected readonly icons = icons;
  readonly value = model<StoreIndustry | null>(null);
  readonly label = input('Branża sklepu');
  readonly wide = input(false);
  /** Clicking the selected industry again clears the choice. */
  readonly clearable = input(true);
  protected readonly query = signal('');
  private readonly sanitizer = inject(DomSanitizer);
  private readonly arts = new Map<StoreIndustry, SafeHtml>();

  /** Our own constant SVG (no user input) — safe to render as HTML. */
  protected art(id: StoreIndustry, label: string): SafeHtml {
    let html = this.arts.get(id);
    if (!html) {
      const motif = ART_MOTIFS.find((m) => m.id === INDUSTRY_ART[id]) ?? ART_MOTIFS.at(-1)!;
      html = this.sanitizer.bypassSecurityTrustHtml(artSquareSvg(motif, suggestBackground(label)));
      this.arts.set(id, html);
    }
    return html;
  }

  protected readonly filtered = computed(() => {
    const q = normalize(this.query());
    if (!q) return INDUSTRIES;
    return INDUSTRIES.filter((i) => normalize(i.label + ' ' + i.hint).includes(q));
  });

  /** Roving tab index: the selected item (or the first one) is the single tab stop. */
  protected tabIndexOf(id: StoreIndustry): number {
    const list = this.filtered();
    const current = list.some((i) => i.id === this.value()) ? this.value() : list[0]?.id;
    return id === current ? 0 : -1;
  }

  protected key(event: KeyboardEvent, id: StoreIndustry): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const list = this.filtered();
    const next = list[(list.findIndex((i) => i.id === id) + delta + list.length) % list.length];
    this.value.set(next.id);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => (group?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
}
