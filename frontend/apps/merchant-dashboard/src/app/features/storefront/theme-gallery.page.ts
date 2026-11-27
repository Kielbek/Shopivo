import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { StoreIndustry, ThemePreset } from '@shopivo/shared-models';
import { AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, LoadingComponent, ToastService, icons } from '@shopivo/shared-ui';
import { BackIconComponent } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { INDUSTRIES, industryLabels, industryOf, storeIndustries } from '../catalog/industries';
import { StoreContext } from '../store/store-context';
import { STYLE_LABELS, ThemeStyle, metaOf, templateImageMap } from './theme-meta';
import { ThemeMockComponent } from './theme-mock';

/** Texts the merchant may have written; kept when switching templates (colours and layout come from the new one). */
const CONTENT_KEYS = ['announcement', 'footerNote', 'logoImage', 'instagram', 'facebook', 'tiktok', 'youtube'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(data: Record<string, any>, keys: string[], keep: (key: string, value: unknown) => boolean = () => true): Record<string, any> {
  return Object.fromEntries(keys.filter((k) => data[k] && keep(k, data[k])).map((k) => [k, data[k]]));
}

/**
 * Template gallery: every template is free. Filters by industry and style, the store's own industry first, a details
 * dialog and "Use this template" — which only changes the draft; nothing reaches customers before publishing.
 */
@Component({
  selector: 'sv-theme-gallery-page',
  imports: [BackIconComponent, RouterLink, LucideDynamicIcon, AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, LoadingComponent, ThemeMockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chosen()) {
      <a routerLink="../" class="group inline-flex items-center text-[13px] text-ink-muted hover:text-ink"><sv-back-icon icon="appearance" [size]="14" label="Wygląd sklepu" /></a>
    }
    <div class="mt-2 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-[26px] font-semibold tracking-[-0.02em] text-ink">{{ chosen() ? 'Zmień szablon' : 'Wybierz szablon sklepu' }}</h1>
        <p class="mt-1 max-w-2xl text-[14px] text-ink-soft">Szablon to gotowy wygląd sklepu: kolory, kroje pisma i układ strony. Po wyborze dopasujesz go do siebie,
          a klienci zobaczą zmiany dopiero po opublikowaniu.</p>
      </div>
      <span class="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-[13px] font-medium text-success-ink"><svg [lucideIcon]="icons.check" [size]="14" />Wszystkie szablony są darmowe</span>
    </div>

    @if (data.isLoading() && !data.hasValue()) {
      <sv-loading class="mt-6" variant="cards" [rows]="6" />
    } @else if (data.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać szablonów.</sv-alert>
    } @else {
      <div class="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <!-- filters -->
        <aside class="space-y-5 lg:sticky lg:top-24 lg:self-start" aria-label="Filtry szablonów">
          <div>
            <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Styl</p>
            <div class="flex flex-wrap gap-1.5 lg:flex-col lg:items-stretch lg:gap-0.5">
              @for (st of styles; track st) {
                <button type="button" class="rounded-[8px] px-3 py-1.5 text-left text-[13px] transition-colors" [attr.aria-pressed]="style() === st"
                  [class]="style() === st ? 'bg-primary-soft font-medium text-primary-strong' : 'text-ink-soft hover:bg-hover hover:text-ink'"
                  (click)="style.set(style() === st ? null : st)">{{ styleLabels[st] }}</button>
              }
            </div>
          </div>
          <div>
            <p class="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Branża</p>
            <label class="sr-only" for="ind">Branża</label>
            <select id="ind" class="sv-input" [value]="industry() ?? ''" (change)="industry.set($any($event.target).value || null)">
              <option value="">Wszystkie branże</option>
              @for (i of industries; track i.id) {<option [value]="i.id">{{ i.label }}</option>}
            </select>
            @if (storeIndustry(); as own) {
              <p class="mt-2 text-[12px] text-ink-muted">Szablony dla: {{ own }} pokazujemy najpierw.</p>
            }
          </div>
          @if (style() || industry()) {
            <button type="button" class="text-[13px] text-primary-strong hover:underline" (click)="style.set(null); industry.set(null)">Wyczyść filtry</button>
          }
        </aside>

        <!-- grid -->
        <div>
          <p class="mb-3 text-[13px] text-ink-muted">{{ list().length }} {{ list().length === 1 ? 'szablon' : list().length < 5 ? 'szablony' : 'szablonów' }}</p>
          @if (!list().length) {
            <div class="rounded-[14px] border border-dashed border-line-strong p-10 text-center text-[14px] text-ink-muted">Brak szablonów dla tych filtrów.
              <button type="button" class="text-primary-strong hover:underline" (click)="style.set(null); industry.set(null)">Pokaż wszystkie</button></div>
          }
          <ul class="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
            @for (p of list(); track p.code) {
              @let meta = metaFor(p.code);
              <li>
                <article class="group flex h-full flex-col overflow-hidden rounded-[16px] border border-line bg-card transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-[0_10px_30px_rgba(15,18,16,0.08)]">
                  <button type="button" class="relative block bg-canvas px-5 pb-0 pt-11 text-left" [attr.aria-label]="'Szczegóły szablonu ' + p.name" (click)="details.set(p)">
                    <div class="relative mx-auto max-w-[92%]">
                      <div class="overflow-hidden rounded-t-[10px] shadow-[0_6px_24px_rgba(15,18,16,0.12)] transition-transform group-hover:-translate-y-1">
                        <sv-theme-mock [settings]="p.defaults" [sections]="p.sections" [storeName]="storeName()" [templateImages]="tplImages()" [productImages]="samplesOf(p.code)" />
                      </div>
                      <div class="absolute -bottom-0 -right-3 w-[24%] overflow-hidden rounded-t-[12px] border-[3px] border-b-0 border-[#0F1210] shadow-lg transition-transform group-hover:-translate-y-2">
                        <sv-theme-mock [settings]="p.defaults" [sections]="p.sections" [storeName]="storeName()" [templateImages]="tplImages()" [phone]="true" [productImages]="samplesOf(p.code)" />
                      </div>
                    </div>
                    @if (isCurrent(p)) {<span class="absolute left-3 top-3"><sv-badge tone="info">Twój szablon</sv-badge></span>}
                    @else if (recommended(p)) {<span class="absolute left-3 top-3"><sv-badge tone="success">Polecany dla Twojej branży</sv-badge></span>}
                  </button>
                  <div class="flex flex-1 flex-col p-4">
                    <div class="flex items-center gap-2">
                      <h2 class="text-[16px] font-semibold text-ink">{{ p.name }}</h2>
                      <span class="ml-auto text-[13px] font-semibold text-success-ink">Darmowy</span>
                    </div>
                    <div class="mt-2 flex items-center gap-1.5" aria-hidden="true">
                      @for (c of swatches(p); track c) {<span class="size-4 rounded-full border border-black/10" [style.background]="c"></span>}
                      <span class="ml-1 text-[12px] text-ink-muted">{{ styleLabels[meta.style] }}</span>
                    </div>
                    <p class="mt-2 text-[13px] leading-5 text-ink-soft">{{ p.description }}</p>
                    <div class="mt-3 flex flex-wrap gap-1.5">
                      @for (f of meta.features; track f) {<span class="rounded-[6px] bg-canvas px-2 py-0.5 text-[12px] text-ink-soft">{{ f }}</span>}
                    </div>
                    <div class="mt-auto flex gap-2 pt-4">
                      <button sv-button variant="secondary" size="sm" (click)="details.set(p)">Szczegóły</button>
                      @if (canWrite && !isCurrent(p)) {
                        <button sv-button size="sm" class="flex-1" [loading]="choosing() === p.code" (click)="choose(p)">Wybierz szablon</button>
                      } @else if (isCurrent(p)) {
                        <a sv-button size="sm" class="flex-1" [routerLink]="['/sklep', ctx.tenantId(), 'edytor-wygladu']">Dostosuj</a>
                      }
                    </div>
                  </div>
                </article>
              </li>
            }
          </ul>
        </div>
      </div>
    }

    <sv-dialog [heading]="details()?.name ?? ''" [open]="!!details()" (closed)="details.set(null)">
      @if (details(); as p) {
        @let meta = metaFor(p.code);
        <div class="overflow-hidden rounded-[12px] border border-line"><sv-theme-mock [settings]="p.defaults" [sections]="p.sections" [storeName]="storeName()" [templateImages]="tplImages()" [productImages]="samplesOf(p.code)" /></div>
        <p class="mt-4 text-[14px] text-ink-soft">{{ p.description }}</p>
        <dl class="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
          <div><dt class="font-medium text-ink">Najlepiej sprawdzi się w</dt><dd class="mt-1 text-ink-soft">{{ industryNames(meta.industries) }}</dd></div>
          <div><dt class="font-medium text-ink">Styl</dt><dd class="mt-1 text-ink-soft">{{ styleLabels[meta.style] }}</dd></div>
          <div class="sm:col-span-2"><dt class="font-medium text-ink">Cechy</dt>
            <dd class="mt-1 flex flex-wrap gap-1.5">@for (f of meta.features; track f) {<span class="rounded-[6px] bg-canvas px-2 py-0.5 text-[12px] text-ink-soft">{{ f }}</span>}</dd></div>
        </dl>
        <p class="mt-4 rounded-[10px] bg-canvas px-4 py-3 text-[13px] text-ink-soft">Po wyborze zmienimy tylko <strong class="font-medium text-ink">szkic</strong> wyglądu.
          Twoje teksty (nagłówek, pasek informacyjny, stopka) zostaną, a klienci zobaczą nowy szablon dopiero po kliknięciu „Opublikuj”.</p>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="details.set(null)">Zamknij</button>
        @if (details(); as p) {
          @if (canWrite && !isCurrent(p)) {
            <button sv-button type="button" [loading]="choosing() === p.code" (click)="choose(p)">Wybierz szablon „{{ p.name }}”</button>
          }
        }
      </ng-container>
    </sv-dialog>
  `,
})
export class ThemeGalleryPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('THEMES_WRITE');
  protected readonly styleLabels = STYLE_LABELS;
  protected readonly styles = Object.keys(STYLE_LABELS) as ThemeStyle[];
  protected readonly industries = INDUSTRIES;

  protected readonly data = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.theme(params) });
  protected readonly tplImages = computed(() => templateImageMap(this.data.hasValue() ? this.data.value().templateImages : []));
  protected readonly style = signal<ThemeStyle | null>(null);
  protected readonly industry = signal<StoreIndustry | null>(null);
  protected readonly details = signal<ThemePreset | null>(null);
  protected readonly choosing = signal<string | null>(null);

  protected readonly storeName = computed(() => this.ctx.store()?.name ?? '');
  protected readonly storeIndustry = computed(() => industryLabels(storeIndustries(this.ctx.store())) || null);
  private readonly own = computed(() => storeIndustries(this.ctx.store()));
  /** A template counts as chosen once the store saved one (version ≥ 0). */
  protected samplesOf(code: string): string[] {
    const list = this.data.hasValue() ? this.data.value().sampleProducts?.[code] ?? [] : [];
    return list.map((p) => p.imageUrl).filter((u): u is string => !!u);
  }

  protected readonly chosen = computed(() => (this.data.hasValue() ? this.data.value().state.version >= 0 : false));

  protected readonly list = computed(() => {
    if (!this.data.hasValue()) return [];
    return this.data.value().presets
      .filter((p) => !this.style() || this.metaFor(p.code).style === this.style())
      .filter((p) => !this.industry() || this.metaFor(p.code).industries.includes(this.industry()!))
      .sort((a, b) => Number(this.isCurrent(b)) - Number(this.isCurrent(a))
        || Number(this.recommended(b)) - Number(this.recommended(a)));
  });

  protected metaFor(code: string) {
    return metaOf(code);
  }

  protected isCurrent(p: ThemePreset): boolean {
    return this.chosen() && this.data.value()?.state.draft.code === p.code;
  }

  protected recommended(p: ThemePreset): boolean {
    return this.own().some((i) => this.metaFor(p.code).industries.includes(i));
  }

  protected swatches(p: ThemePreset): string[] {
    return [p.defaults['primary'], p.defaults['accent'], p.defaults['background'], p.defaults['text']];
  }

  protected industryNames(ids: StoreIndustry[]): string {
    return ids.map((i) => industryOf(i)?.label).filter(Boolean).join(', ');
  }

  protected async choose(p: ThemePreset): Promise<void> {
    const d = this.data.value();
    if (!d) return;
    this.choosing.set(p.code);
    try {
      const next = { ...p.defaults };
      let sections = p.sections;
      if (d.state.version >= 0) {
        // Only what the merchant wrote themselves moves to the new template: values still equal to the previous
        // template's defaults (its sample texts, its own photos) are replaced by the new template's content.
        const old = d.presets.find((x) => x.code === d.state.draft.code);
        const oldHeroDefaults = old?.sections.find((s) => s.type === 'hero')?.data ?? {};
        for (const k of CONTENT_KEYS) {
          const v = d.state.draft.settings[k];
          if (v && v !== old?.defaults[k]) next[k] = v;
        }
        const oldHero = d.state.draft.sections?.find((s) => s.type === 'hero');
        if (oldHero && old) {
          const own = pick(oldHero.data, ['heading', 'subheading', 'cta', 'link', 'image'],
            (k, v) => v !== oldHeroDefaults[k] && !(k === 'image' && String(v).startsWith('tpl:')));
          sections = p.sections.map((s) => (s.type === 'hero' ? { ...s, data: { ...s.data, ...own } } : s));
        }
      }
      await firstValueFrom(this.api.saveTheme(this.ctx.tenantId(), p.code, next, d.state.version, sections));
      this.toast.success(`Wybrano szablon „${p.name}”. Dopasuj go w edytorze i opublikuj, gdy będzie gotowy.`);
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'edytor-wygladu']);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.choosing.set(null);
    }
  }
}
