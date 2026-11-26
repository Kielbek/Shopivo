import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { CardComponent, FieldComponent, InfoTipComponent, icons, slugify } from '@shopivo/shared-ui';

export const SEO_TITLE_IDEAL = [30, 60] as const;
export const SEO_DESC_IDEAL = [70, 160] as const;

/** Plain text without extra whitespace or simple markup, for meta descriptions. */
export function plain(text: string): string {
  return text.replace(/[#*_>`~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cuts at a word boundary and adds an ellipsis when needed. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

/** Suggested meta description: the item's own description, or a neutral sentence built from its name. */
export function suggestDescription(name: string, description: string, storeName: string, kind: 'product' | 'category'): string {
  const own = plain(description);
  if (own.length >= 50) return clip(own, SEO_DESC_IDEAL[1]);
  const base = kind === 'product'
    ? `${name} w sklepie ${storeName}. Sprawdź cenę, dostępne warianty i opcje dostawy.`
    : `${name} – przeglądaj produkty w sklepie ${storeName}. Sprawdź ceny i dostępność.`;
  return clip(own ? `${own} ${base}` : base, SEO_DESC_IDEAL[1]);
}

/** Suggested page title (the store adds " – {store}" itself). */
export function suggestTitle(name: string, brand: string | null): string {
  const n = name.trim();
  return brand && !n.toLowerCase().includes(brand.toLowerCase()) && n.length + brand.length + 3 <= SEO_TITLE_IDEAL[1] ? `${n} – ${brand}` : clip(n, SEO_TITLE_IDEAL[1]);
}

/**
 * Search-engine settings explained for non-experts: a live Google-style preview, automatic values used when fields are
 * left empty, one-click suggestions and length guidance.
 */
@Component({
  selector: 'sv-seo-panel',
  imports: [FormsModule, LucideDynamicIcon, CardComponent, FieldComponent, InfoTipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-card>
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 class="flex items-center gap-1 text-[15px] font-semibold text-ink">Wygląd w Google (SEO)
            <sv-info-tip label="Co to jest SEO?" title="SEO — pozycjonowanie w wyszukiwarkach"
              text="To, jak strona wygląda w wynikach Google i innych wyszukiwarek: niebieski tytuł, adres i krótki opis pod nim. Dobry tytuł i opis zachęcają do kliknięcia. Jeśli nic tu nie wpiszesz, uzupełnimy to automatycznie z nazwy i opisu." /></h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">Uzupełnia się samo — zmień tylko, jeśli chcesz.</p>
        </div>
        @if (!disabled()) {
          <button type="button" class="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink hover:bg-hover"
            (click)="fill()"><svg [lucideIcon]="icons.sparkles" [size]="14" class="text-primary" />Uzupełnij za mnie</button>
        }
      </div>

      <div class="rounded-[10px] border border-line bg-card p-4" aria-label="Podgląd wyniku wyszukiwania">
        <div class="flex items-center gap-2">
          <span class="flex size-7 items-center justify-center rounded-full bg-canvas text-[11px] font-semibold text-ink-soft">{{ initial() }}</span>
          <span class="min-w-0 leading-4">
            <span class="block truncate text-[13px] text-ink">{{ storeName() || 'Twój sklep' }}</span>
            <span class="block truncate text-[12px] text-ink-muted">{{ host() }}{{ breadcrumb() }}</span>
          </span>
        </div>
        <p class="mt-2 line-clamp-2 text-[18px] leading-6 text-[#1a0dab]">{{ previewTitle() }}</p>
        <p class="mt-1 line-clamp-2 text-[13px] leading-5 text-[#4d5156]">{{ previewDescription() }}</p>
      </div>

      <button type="button" class="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-primary-strong hover:underline"
        [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())">
        <svg [lucideIcon]="expanded() ? icons.chevronDown : icons.chevronRight" [size]="14" />Dostosuj tytuł, opis i adres
      </button>

      @if (expanded()) {
        <fieldset class="mt-3 space-y-4" [disabled]="disabled()">
          <sv-field label="Tytuł w Google" [for]="idPrefix() + '-seo-title'" [optional]="true"
            info="Niebieski, klikany tytuł w wynikach wyszukiwania. Najlepiej 30–60 znaków, z najważniejszym słowem na początku. Nazwę sklepu dodajemy na końcu sami.">
            <input [id]="idPrefix() + '-seo-title'" [name]="idPrefix() + '-seo-title'" class="sv-input" maxlength="160" [placeholder]="autoTitle()"
              [ngModel]="title()" (ngModelChange)="title.set($event)" />
            <p class="mt-1.5 flex justify-between gap-3 text-[12px]">
              <span class="text-ink-muted">{{ title() ? '' : 'Puste = nazwa produktu.' }}</span>
              <span [class]="lengthTone(effectiveTitle().length, titleIdeal)">{{ effectiveTitle().length }} / {{ titleIdeal[1] }} znaków</span>
            </p>
          </sv-field>
          <sv-field label="Opis w Google" [for]="idPrefix() + '-seo-desc'" [optional]="true"
            info="Szary tekst pod tytułem. Napisz w 1–2 zdaniach, co to jest i dlaczego warto kupić. Najlepiej 70–160 znaków — dłuższy Google utnie.">
            <textarea [id]="idPrefix() + '-seo-desc'" [name]="idPrefix() + '-seo-desc'" class="sv-input min-h-20 py-2.5" maxlength="320" [placeholder]="autoDescription()"
              [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
            <p class="mt-1.5 flex justify-between gap-3 text-[12px]">
              <span class="text-ink-muted">{{ description() ? '' : 'Puste = fragment opisu.' }}</span>
              <span [class]="lengthTone(effectiveDescription().length, descIdeal)">{{ effectiveDescription().length }} / {{ descIdeal[1] }} znaków</span>
            </p>
          </sv-field>
          <sv-field label="Adres strony" [for]="idPrefix() + '-slug'" [optional]="true"
            info="Końcówka adresu strony. Krótka, bez polskich znaków, słowa oddzielone myślnikami. Po zmianie stary adres przekieruje na nowy dopiero, gdy dodasz przekierowanie w Treściach.">
            <div class="flex">
              <span class="inline-flex h-10 items-center whitespace-nowrap rounded-l-[var(--radius-control)] border border-r-0 border-line-strong bg-canvas px-2.5 text-[12px] text-ink-muted">{{ pathPrefix() }}</span>
              <input [id]="idPrefix() + '-slug'" [name]="idPrefix() + '-slug'" class="sv-input rounded-l-none" maxlength="200" [placeholder]="autoSlug()"
                [ngModel]="slug()" (ngModelChange)="slug.set($event)" (blur)="slug.set(slugify(slug()))" />
            </div>
          </sv-field>
        </fieldset>
      }
    </sv-card>
  `,
})
export class SeoPanelComponent {
  protected readonly icons = icons;
  protected readonly slugify = slugify;
  protected readonly titleIdeal = SEO_TITLE_IDEAL;
  protected readonly descIdeal = SEO_DESC_IDEAL;

  readonly idPrefix = input('p');
  readonly name = input('');
  readonly text = input('');
  readonly brand = input<string | null>(null);
  readonly storeName = input('');
  readonly host = input('');
  readonly pathPrefix = input('/produkt/');
  readonly kind = input<'product' | 'category'>('product');
  readonly disabled = input(false);
  readonly slug = model('');
  readonly title = model('');
  readonly description = model('');
  protected readonly expanded = signal(false);

  protected readonly autoTitle = computed(() => this.name().trim() || 'Nazwa produktu');
  protected readonly autoDescription = computed(() => {
    const own = plain(this.text());
    return own ? clip(own, 300) : suggestDescription(this.name().trim() || 'Produkt', '', this.storeName(), this.kind());
  });
  protected readonly autoSlug = computed(() => slugify(this.name()) || 'adres-tworzony-z-nazwy');
  protected readonly effectiveTitle = computed(() => this.title().trim() || this.autoTitle());
  protected readonly effectiveDescription = computed(() => this.description().trim() || this.autoDescription());
  protected readonly previewTitle = computed(() => {
    const store = this.storeName();
    const t = this.effectiveTitle();
    return clip(store && t !== store ? `${t} – ${store}` : t, 70);
  });
  protected readonly previewDescription = computed(() => clip(this.effectiveDescription(), 160));
  protected readonly breadcrumb = computed(() => ' › ' + this.pathPrefix().replace(/\//g, '') + ' › ' + (this.slug().trim() || this.autoSlug()));
  protected readonly initial = computed(() => (this.storeName().trim()[0] ?? 'S').toUpperCase());

  protected lengthTone(n: number, ideal: readonly [number, number]): string {
    return n > ideal[1] ? 'text-danger-ink' : n < ideal[0] ? 'text-warning-ink' : 'text-success-ink';
  }

  /** Fills empty fields with suggestions the merchant can then edit. */
  protected fill(): void {
    const name = this.name().trim();
    if (!name) return;
    if (!this.title().trim()) this.title.set(suggestTitle(name, this.brand()));
    if (!this.description().trim()) this.description.set(suggestDescription(name, this.text(), this.storeName(), this.kind()));
    if (!this.slug().trim()) this.slug.set(slugify(name));
    this.expanded.set(true);
  }
}
