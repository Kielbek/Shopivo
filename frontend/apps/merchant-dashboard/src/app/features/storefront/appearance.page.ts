import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, StorefrontAdminApi } from '@shopivo/api-client';
import { ThemeField } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, FieldComponent, InfoTipComponent, LoadingComponent, SelectComponent,
  SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { buildTree } from '../catalog/category-tree';
import { DevicePreviewComponent } from '../content/device-preview';
import { StoreContext } from '../store/store-context';
import { ThemeMockComponent } from './theme-mock';

const OPTION_LABELS: Record<string, string> = {
  sans: 'Bezszeryfowy (nowoczesny)', serif: 'Szeryfowy (elegancki)', rounded: 'Zaokrąglony (przyjazny)', mono: 'Techniczny',
  none: 'Brak (ostre rogi)', soft: 'Delikatne', round: 'Mocne',
  centered: 'Wyśrodkowany tekst', split: 'Tekst i zdjęcia obok siebie', banner: 'Kolorowy baner',
  plain: 'Bez ramki', bordered: 'Z ramką', shadow: 'Z cieniem',
};

const GROUP_HELP: Record<string, string> = {
  'Kolory': 'Kolor główny to przyciski i linki, akcent — wyróżnienia (np. pasek informacyjny). Tekst musi być dobrze widoczny na tle.',
  'Typografia i kształt': 'Krój pisma nagłówków i tekstu oraz zaokrąglenie przycisków, zdjęć i kart produktów.',
  'Strona główna': 'Pierwsze, co widzi klient. Nagłówek i podtytuł mówią, co sprzedajesz; przycisk prowadzi do produktów lub wybranej kategorii.',
  'Komunikaty': 'Pasek nad nagłówkiem (np. „Darmowa dostawa od 200 zł”) i krótki tekst w stopce sklepu.',
};

const FIELD_HELP: Record<string, string> = {
  heroCategory: 'Puste = wszystkie produkty.',
  announcement: 'Widoczny na każdej stronie sklepu. Zostaw puste, aby go ukryć.',
};

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return 1;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio of two colours. */
export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Configuration of the chosen template: colours, type, home page and messages with explanations, an instant preview
 * and the real storefront (saved draft) on desktop / tablet / phone. "Zmień szablon" opens the gallery; a store that has
 * not chosen a template yet is sent there first.
 */
@Component({
  selector: 'sv-appearance-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, CardComponent, BadgeComponent, ButtonComponent, AlertComponent, FieldComponent, InfoTipComponent,
    LoadingComponent, SelectComponent, DatePipe, ThemeMockComponent, DevicePreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.isLoading() && !data.hasValue()) {
      <sv-loading variant="detail" />
    } @else if (data.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać ustawień wyglądu.</sv-alert>
    } @else if (data.hasValue() && data.value().state.version >= 0) {
      @let d = data.value();
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-[22px] font-semibold tracking-[-0.01em] text-ink">Wygląd sklepu</h1>
          <p class="mt-1 text-[13px] text-ink-muted">Dopasuj szablon do swojej marki. Zmiany zapisujesz jako szkic — klienci zobaczą je po publikacji.</p>
        </div>
        @if (canWrite) {
          <div class="flex flex-wrap gap-2">
            <a sv-button variant="secondary" routerLink="szablony"><svg [lucideIcon]="icons.grid" />Zmień szablon</a>
            <button sv-button variant="secondary" [disabled]="!dirty()" [loading]="saving()" (click)="save()">Zapisz szkic</button>
            <button sv-button [loading]="publishing()" [disabled]="!dirty() && !d.state.unpublishedChanges" (click)="publish()">Opublikuj</button>
          </div>
        }
      </div>

      <!-- current template -->
      <section class="sv-card mt-5 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div class="w-full shrink-0 overflow-hidden rounded-[10px] border border-line sm:w-56"><sv-theme-mock [settings]="settings()" [storeName]="storeName()" /></div>
        <div class="min-w-0 flex-1">
          <p class="text-[12px] font-medium uppercase tracking-wide text-ink-muted">Twój szablon</p>
          <p class="mt-0.5 flex flex-wrap items-center gap-2 text-[20px] font-semibold text-ink">{{ preset()?.name }}
            <span class="text-[13px] font-semibold text-success-ink">Darmowy</span></p>
          <p class="mt-1 text-[13px] text-ink-soft">{{ preset()?.description }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
            @if (dirty()) {<sv-badge tone="warning">Niezapisane zmiany</sv-badge>}
            @else if (d.state.unpublishedChanges) {<sv-badge tone="info">Szkic czeka na publikację</sv-badge>}
            @else {<sv-badge tone="success">Opublikowany</sv-badge>}
            @if (d.state.publishedAt) {<span>ostatnia publikacja {{ d.state.publishedAt | svDate }}</span>} @else {<span>jeszcze nie opublikowany</span>}
          </div>
        </div>
        <ol class="grid shrink-0 gap-2 text-[13px] sm:w-56">
          @for (step of steps(); track step.label; let i = $index) {
            <li class="flex items-center gap-2.5" [class]="step.done ? 'text-ink' : 'text-ink-muted'">
              <span class="flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                [class]="step.done ? 'bg-success text-white' : 'border border-line-strong'">@if (step.done) {<svg [lucideIcon]="icons.check" [size]="12" />} @else {{{ i + 1 }}}</span>{{ step.label }}
            </li>
          }
        </ol>
      </section>

      @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e }}</sv-alert>}

      <div class="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1fr)]">
        <div class="min-w-0 space-y-5">
          @for (group of groups(); track group.name) {
            <sv-card>
              <h2 class="flex items-center gap-1 text-[15px] font-semibold text-ink">{{ group.name }}</h2>
              @if (groupHelp[group.name]) {<p class="mt-0.5 text-[12px] text-ink-muted">{{ groupHelp[group.name] }}</p>}
              @if (group.name === 'Kolory' && lowContrast()) {
                <sv-alert tone="warning" class="mt-3">Tekst może być słabo czytelny na tym tle (kontrast {{ contrastValue() }}:1, zalecane co najmniej 4,5:1). Przyciemnij tekst lub rozjaśnij tło.</sv-alert>
              }
              <fieldset class="mt-4 grid gap-4 sm:grid-cols-2" [disabled]="!canWrite">
                @for (f of group.fields; track f.key) {
                  @switch (f.type) {
                    @case ('COLOR') {
                      <sv-field [label]="f.label" [for]="'t-' + f.key">
                        <div class="flex gap-2">
                          <input type="color" class="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-line bg-card p-1"
                            [attr.aria-label]="f.label + ' – wybór koloru'" [ngModel]="settings()[f.key]" (ngModelChange)="set(f.key, $event)" />
                          <input class="sv-input uppercase" [id]="'t-' + f.key" maxlength="7" [ngModel]="settings()[f.key]" (ngModelChange)="set(f.key, $event)" />
                        </div>
                      </sv-field>
                    }
                    @case ('SELECT') {
                      <sv-field [label]="f.label" [for]="'t-' + f.key">
                        <sv-select [inputId]="'t-' + f.key" [options]="optionsFor(f)" [value]="settings()[f.key]" (valueChange)="set(f.key, $event ?? '')" [ariaLabel]="f.label" />
                      </sv-field>
                    }
                    @default {
                      @if (f.key === 'heroCategory') {
                        <sv-field label="Przycisk prowadzi do" [for]="'t-' + f.key" [hint]="fieldHelp[f.key]">
                          <sv-select [inputId]="'t-' + f.key" [options]="categoryOptions()" [value]="settings()[f.key] ?? ''" (valueChange)="set(f.key, $event ?? '')" ariaLabel="Kategoria przycisku" />
                        </sv-field>
                      } @else {
                        <sv-field [label]="f.label" [for]="'t-' + f.key" [optional]="true" [hint]="fieldHelp[f.key] ?? ((settings()[f.key] || '').length + ' / ' + f.maxLength)"
                          [class.sm:col-span-2]="f.maxLength > 80">
                          <input class="sv-input" [id]="'t-' + f.key" [attr.maxlength]="f.maxLength" [placeholder]="f.key === 'heroTitle' ? storeName() : ''"
                            [ngModel]="settings()[f.key]" (ngModelChange)="set(f.key, $event)" />
                        </sv-field>
                      }
                    }
                  }
                }
              </fieldset>
            </sv-card>
          }
          <p class="text-[12px] text-ink-muted">Kroje pisma są systemowe — sklep nie pobiera czcionek z zewnętrznych serwisów (szybkość, prywatność klientów).</p>
        </div>

        <sv-card class="xl:sticky xl:top-24">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="flex items-center gap-1 text-[15px] font-semibold text-ink">Podgląd
              <sv-info-tip label="Jak działa podgląd?" text="„Na żywo” zmienia się od razu, gdy edytujesz ustawienia (wersja uproszczona). „W sklepie” to prawdziwy sklep z zapisanym szkicem — zapisz zmiany i kliknij Odśwież." /></h2>
            <span class="flex-1"></span>
            <div class="inline-flex rounded-[10px] bg-canvas p-1" role="tablist" aria-label="Rodzaj podglądu">
              @for (m of previewModes; track m.id) {
                <button type="button" role="tab" [attr.aria-selected]="previewMode() === m.id" class="h-8 rounded-[8px] px-3 text-[13px] font-medium"
                  [class]="previewMode() === m.id ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,23,42,0.08)]' : 'text-ink-muted hover:text-ink'"
                  (click)="previewMode.set(m.id)">{{ m.label }}</button>
              }
            </div>
          </div>
          @if (previewMode() === 'live') {
            <div class="mt-4 grid grid-cols-[minmax(0,1fr)_28%] items-end gap-4 rounded-[14px] bg-[#E9ECF1] p-4">
              <div class="overflow-hidden rounded-[8px] shadow-[0_6px_24px_rgba(15,23,42,0.12)]"><sv-theme-mock [settings]="settings()" [storeName]="storeName()" /></div>
              <div class="overflow-hidden rounded-[14px] border-[4px] border-[#1f2430] shadow-lg"><sv-theme-mock [settings]="settings()" [storeName]="storeName()" [phone]="true" /></div>
            </div>
          } @else {
            @if (dirty()) {<sv-alert tone="info" class="mt-4">Masz niezapisane zmiany — <button type="button" class="sv-link" (click)="save()">zapisz szkic</button>, aby zobaczyć je w sklepie.</sv-alert>}
            <sv-device-preview class="mt-4" [url]="previewUrl()" title="Podgląd sklepu ze szkicem wyglądu" />
          }
        </sv-card>
      </div>
    }
  `,
})
export class AppearancePage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly catalog = inject(CatalogApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly groupHelp = GROUP_HELP;
  protected readonly fieldHelp = FIELD_HELP;
  protected readonly canWrite = this.ctx.can('THEMES_WRITE');
  protected readonly storeName = computed(() => this.ctx.store()?.name ?? '');
  protected readonly previewModes = [{ id: 'live' as const, label: 'Na żywo' }, { id: 'store' as const, label: 'W sklepie' }];

  protected readonly data = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.theme(params) });
  private readonly categories = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.catalog.categories(params) });
  private readonly link = rxResource({
    params: () => (this.previewMode() === 'store' ? { t: this.ctx.tenantId(), n: this.previewNonce() } : undefined),
    stream: ({ params }) => this.api.previewLink(params.t),
  });
  protected readonly previewMode = signal<'live' | 'store'>('live');
  private readonly previewNonce = signal(0);
  protected readonly code = signal('');
  protected readonly settings = signal<Record<string, string>>({});
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  private version = -1;

  protected readonly preset = computed(() => this.data.value()?.presets.find((p) => p.code === this.code()) ?? null);
  protected readonly previewUrl = computed(() => (this.link.hasValue() ? this.link.value()?.url ?? null : null));
  protected readonly contrastValue = computed(() => contrast(this.settings()['text'], this.settings()['background']).toFixed(1).replace('.', ','));
  protected readonly lowContrast = computed(() => contrast(this.settings()['text'], this.settings()['background']) < 4.5);
  protected readonly groups = computed(() => {
    const fields = this.data.value()?.fields ?? [];
    const names = [...new Set(fields.map((f) => f.group))];
    return names.map((name) => ({ name, fields: fields.filter((f) => f.group === name) }));
  });
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Wszystkie produkty' },
    ...buildTree(this.categories.hasValue() ? this.categories.value() : []).map((n) => ({ value: n.category.slug, label: n.path.join(' › ') })),
  ]);
  protected readonly steps = computed(() => {
    const st = this.data.value()?.state;
    return [
      { label: 'Wybierz szablon', done: true },
      { label: 'Dopasuj i zapisz', done: !this.dirty() && !!st && st.version > 0 },
      { label: 'Opublikuj', done: !this.dirty() && !!st && !st.unpublishedChanges },
    ];
  });

  constructor() {
    effect(() => {
      if (!this.data.hasValue()) return;
      const d = this.data.value();
      // No template chosen yet: start in the gallery.
      if (d.state.version < 0) {
        void this.router.navigate(['/sklep', this.ctx.tenantId(), 'wyglad', 'szablony'], { replaceUrl: true });
        return;
      }
      this.code.set(d.state.draft.code);
      this.settings.set({ ...d.state.draft.settings });
      this.version = d.state.version;
      this.dirty.set(false);
    });
  }

  protected optionsFor(f: ThemeField): SelectOption[] {
    return (f.options ?? []).map((o) => ({ value: o, label: OPTION_LABELS[o] ?? o }));
  }

  protected set(key: string, value: string): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
    this.dirty.set(true);
  }

  protected async save(): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const state = await firstValueFrom(this.api.saveTheme(this.ctx.tenantId(), this.code(), this.settings(), this.version));
      this.version = state.version;
      this.data.update((d) => (d ? { ...d, state } : d));
      this.previewNonce.update((n) => n + 1);
      this.toast.success('Zapisano szkic wyglądu.');
      return true;
    } catch (e) {
      this.error.set(ApiError.from(e).message);
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    if (this.dirty() && !(await this.save())) return;
    this.publishing.set(true);
    try {
      const state = await firstValueFrom(this.api.publishTheme(this.ctx.tenantId()));
      this.version = state.version;
      this.data.update((d) => (d ? { ...d, state } : d));
      this.toast.success('Opublikowano nowy wygląd sklepu.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.publishing.set(false);
    }
  }
}
