import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LucideDynamicIcon } from '@lucide/angular';
import { StoreIndustry } from '@shopivo/shared-models';
import { icons } from '@shopivo/shared-ui';
import { INDUSTRIES, MAX_INDUSTRIES, industryOf } from '../catalog/industries';
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

/**
 * Grid of store industries with a search box — several can be chosen (up to 5), the first is the primary one.
 * Keyboard: Tab into the group, arrows move, Space/Enter toggles.
 */
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
    <div class="mt-3 flex min-h-8 flex-wrap items-center gap-1.5 text-[12.5px]" aria-live="polite">
      @if (value().length) {
        <span class="text-ink-muted">Wybrane:</span>
        @for (id of value(); track id; let first = $first) {
          <span class="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1" [class]="first ? 'bg-ink text-white' : 'bg-canvas text-ink'">
            {{ name(id) }}@if (first) {<span class="text-white/60">· główna</span>}
            @if (!first) {
              <button type="button" class="rounded-full px-1.5 text-[11.5px] text-ink-muted hover:bg-black/5 hover:text-ink" (click)="makePrimary(id)"
                [attr.aria-label]="'Ustaw ' + name(id) + ' jako główną'">ustaw główną</button>
            }
            <button type="button" class="flex size-5 items-center justify-center rounded-full hover:bg-black/10" [attr.aria-label]="'Usuń ' + name(id)" (click)="toggle(id)">
              <svg [lucideIcon]="icons.close" [size]="12" /></button>
          </span>
        }
        @if (limitHit()) {<span class="text-warning-ink">Najwyżej {{ max }} branż.</span>}
      } @else {
        <span class="text-ink-muted">Możesz wybrać kilka branż (do {{ max }}), np. odzież, obuwie i perfumy. Pierwsza będzie główną.</span>
      }
    </div>
    <div role="group" [attr.aria-label]="label()" class="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-3" [class.lg:grid-cols-4]="wide()">
      @for (i of filtered(); track i.id) {
        <button type="button" role="checkbox" [attr.aria-checked]="isOn(i.id)" [tabIndex]="tabIndexOf(i.id)"
          class="group relative flex min-w-0 flex-col overflow-hidden rounded-[14px] border text-left transition-[border-color,box-shadow]
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          [class]="isOn(i.id) ? 'border-ink shadow-[0_0_0_1px_var(--color-ink)]' : 'border-line bg-card hover:border-line-strong'"
          (click)="toggle(i.id)" (keydown)="key($event, i.id)">
          <span class="block overflow-hidden leading-[0] transition-transform" [innerHTML]="art(i.id, i.label)"></span>
          <span class="block min-w-0 px-3 pb-3 pt-2.5">
            <span class="block truncate text-[13px] font-medium text-ink">{{ i.label }}</span>
            <span class="line-clamp-2 text-[11px] leading-4 text-ink-muted">{{ i.hint }}</span>
          </span>
          @if (isOn(i.id)) {
            <span class="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center gap-1 rounded-full bg-ink px-1.5 text-[11px] font-medium text-white" aria-hidden="true">
              <svg [lucideIcon]="icons.check" [size]="13" [strokeWidth]="2.5" />@if (value()[0] === i.id) {Główna}</span>
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
  /** Chosen industries, primary first. */
  readonly value = model<StoreIndustry[]>([]);
  readonly label = input('Branże sklepu');
  readonly wide = input(false);
  protected readonly max = MAX_INDUSTRIES;
  protected readonly limitHit = signal(false);
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

  protected readonly focused = signal<StoreIndustry | null>(null);

  protected isOn(id: StoreIndustry): boolean {
    return this.value().includes(id);
  }

  protected name(id: StoreIndustry): string {
    return industryOf(id)?.label ?? id;
  }

  /** "Wielobranżowy" is exclusive: choosing it clears the others, choosing another removes it. */
  protected toggle(id: StoreIndustry): void {
    const cur = this.value();
    this.limitHit.set(false);
    if (cur.includes(id)) {
      this.value.set(cur.filter((x) => x !== id));
    } else if (id === 'GENERAL') {
      this.value.set(['GENERAL']);
    } else {
      const next = cur.filter((x) => x !== 'GENERAL');
      if (next.length >= MAX_INDUSTRIES) {
        this.limitHit.set(true);
        return;
      }
      this.value.set([...next, id]);
    }
  }

  protected makePrimary(id: StoreIndustry): void {
    this.value.set([id, ...this.value().filter((x) => x !== id)]);
  }

  /** Roving tab index: the focused (or first chosen, or first) item is the single tab stop. */
  protected tabIndexOf(id: StoreIndustry): number {
    const list = this.filtered();
    const pref = this.focused() ?? this.value()[0];
    const current = list.some((i) => i.id === pref) ? pref : list[0]?.id;
    return id === current ? 0 : -1;
  }

  protected key(event: KeyboardEvent, id: StoreIndustry): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const list = this.filtered();
    const index = (list.findIndex((i) => i.id === id) + delta + list.length) % list.length;
    this.focused.set(list[index]!.id);
    const group = (event.currentTarget as HTMLElement).parentElement;
    queueMicrotask(() => (group?.querySelectorAll('[role="checkbox"]')[index] as HTMLElement | undefined)?.focus());
  }
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').trim();
}
