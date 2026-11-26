import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ThemeField, ThemePreset } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, FieldComponent, LoadingComponent, PageHeaderComponent,
  SelectComponent, SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const OPTION_LABELS: Record<string, string> = {
  sans: 'Bezszeryfowy', serif: 'Szeryfowy', rounded: 'Zaokrąglony', mono: 'Techniczny',
  none: 'Brak (ostre rogi)', soft: 'Delikatne', round: 'Mocne',
  centered: 'Wyśrodkowany', split: 'Dwie kolumny ze zdjęciami', banner: 'Kolorowy baner',
  plain: 'Bez ramki', bordered: 'Z ramką', shadow: 'Z cieniem',
};
const FONT_STACKS: Record<string, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif', serif: 'ui-serif, Georgia, serif',
  rounded: 'ui-rounded, "Segoe UI", system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace',
};

@Component({
  selector: 'sv-appearance-page',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    FieldComponent, LoadingComponent, SelectComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Wygląd sklepu" description="Wybierz motyw i dopasuj kolory oraz treści. Zmiany zapisujesz jako szkic — klienci zobaczą je po publikacji.">
      @if (canWrite) {
        <button sv-button variant="secondary" [loading]="previewing()" (click)="preview()"><svg [lucideIcon]="icons.appearance" />Podgląd</button>
        <button sv-button variant="secondary" [loading]="saving()" (click)="save()">Zapisz szkic</button>
        <button sv-button [loading]="publishing()" (click)="publish()">Opublikuj wygląd</button>
      }
    </sv-page-header>

    @if (data.isLoading() && !data.value()) {
      <sv-loading variant="form" />
    } @else if (data.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać ustawień wyglądu.</sv-alert>
    } @else if (data.value(); as d) {
      <div class="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
        @if (d.state.publishedAt) {
          <sv-badge tone="success">Opublikowany</sv-badge> {{ d.state.publishedAt | svDate }}
        } @else {
          <sv-badge>Domyślny wygląd</sv-badge>
        }
        @if (dirty()) {<sv-badge tone="warning">Niezapisane zmiany</sv-badge>}
        @else if (d.state.unpublishedChanges) {<sv-badge tone="info">Szkic różni się od opublikowanego</sv-badge>}
      </div>
      @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e }}</sv-alert>}

      <sv-card class="mt-4" heading="Motyw" subheading="Każdy motyw to zestaw kolorów, typografii i układu — możesz go dalej dostosować.">
        <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Motyw">
          @for (p of d.presets; track p.code) {
            <li>
              <button type="button" role="radio" [attr.aria-checked]="code() === p.code" [disabled]="!canWrite"
                class="flex h-full w-full flex-col overflow-hidden rounded-[12px] border text-left transition hover:border-ink-muted"
                [class]="code() === p.code ? 'border-primary ring-2 ring-primary/30' : 'border-line'" (click)="choose(p)">
                <span class="flex h-20 items-end gap-1.5 p-3" [style.background]="p.defaults['background']">
                  <span class="h-9 w-14 rounded-[6px]" [style.background]="p.defaults['primary']"></span>
                  <span class="h-6 w-6 rounded-full" [style.background]="p.defaults['accent']"></span>
                  <span class="ml-auto text-[22px] font-semibold" [style.color]="p.defaults['text']" [style.font-family]="font(p.defaults['font'])">Aa</span>
                </span>
                <span class="block border-t border-line p-3">
                  <span class="block text-[14px] font-semibold text-ink">{{ p.name }}</span>
                  <span class="mt-0.5 block text-[12px] leading-4 text-ink-muted">{{ p.description }}</span>
                </span>
              </button>
            </li>
          }
        </ul>
      </sv-card>

      <div class="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div class="min-w-0 space-y-4">
          @for (group of groups(); track group.name) {
            <sv-card [heading]="group.name">
              <fieldset class="grid gap-4 sm:grid-cols-2" [disabled]="!canWrite">
                @for (f of group.fields; track f.key) {
                  @switch (f.type) {
                    @case ('COLOR') {
                      <sv-field [label]="f.label" [for]="'t-' + f.key">
                        <div class="flex gap-2">
                          <input type="color" class="h-11 w-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-line bg-card p-1"
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
                      <sv-field [label]="f.label" [for]="'t-' + f.key" [optional]="true" [hint]="(settings()[f.key] || '').length + ' / ' + f.maxLength" [class.sm:col-span-2]="f.maxLength > 80">
                        <input class="sv-input" [id]="'t-' + f.key" [attr.maxlength]="f.maxLength" [ngModel]="settings()[f.key]" (ngModelChange)="set(f.key, $event)" />
                      </sv-field>
                    }
                  }
                }
              </fieldset>
            </sv-card>
          }
        </div>

        <sv-card heading="Podgląd kolorów" subheading="Przybliżony wygląd przycisków i kart." class="xl:sticky xl:top-24">
          @let s = settings();
          <div class="overflow-hidden rounded-[12px] border border-line" [style.background]="s['background']" [style.color]="s['text']" [style.font-family]="font(s['font'])">
            @if (s['announcement']) {<div class="px-3 py-1.5 text-center text-[11px] font-medium" [style.background]="s['accent']">{{ s['announcement'] }}</div>}
            <div class="p-4" [style.background]="s['heroLayout'] === 'banner' ? s['primary'] : s['surface']" [style.color]="s['heroLayout'] === 'banner' ? onColor(s['primary']) : s['text']">
              <p class="text-[20px] font-semibold leading-tight">{{ s['heroTitle'] || storeName() }}</p>
              @if (s['heroSubtitle']) {<p class="mt-1 text-[12px] opacity-80">{{ s['heroSubtitle'] }}</p>}
              <span class="mt-3 inline-block px-3 py-2 text-[12px] font-semibold" [style.background]="s['heroLayout'] === 'banner' ? s['background'] : s['primary']"
                [style.color]="s['heroLayout'] === 'banner' ? s['text'] : onColor(s['primary'])" [style.border-radius]="radius(s['radius'])">{{ s['heroCta'] || 'Zobacz produkty' }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 p-4">
              @for (i of [1, 2]; track i) {
                <div class="p-2" [style.border-radius]="radius(s['radius'])" [style.background]="s['productCard'] === 'plain' ? 'transparent' : s['surface']"
                  [style.border]="s['productCard'] === 'bordered' ? '1px solid rgba(0,0,0,.1)' : 'none'"
                  [style.box-shadow]="s['productCard'] === 'shadow' ? '0 4px 14px rgba(0,0,0,.08)' : 'none'">
                  <div class="aspect-square" [style.border-radius]="radius(s['radius'])" [style.background]="s['accent']" style="opacity:.35"></div>
                  <p class="mt-1.5 text-[11px]">Produkt {{ i }}</p><p class="text-[12px] font-semibold">129,00 zł</p>
                </div>
              }
            </div>
          </div>
          <p class="mt-3 text-[12px] text-ink-muted">Kroje pisma są systemowe — sklep nie pobiera czcionek z zewnętrznych serwisów (szybkość, prywatność klientów).</p>
        </sv-card>
      </div>
    }
  `,
})
export class AppearancePage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('THEMES_WRITE');
  protected readonly storeName = computed(() => this.ctx.store()?.name ?? '');

  protected readonly data = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.theme(params) });
  protected readonly code = signal('');
  protected readonly settings = signal<Record<string, string>>({});
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly previewing = signal(false);
  protected readonly error = signal<string | null>(null);
  private version = -1;

  protected readonly groups = computed(() => {
    const fields = this.data.value()?.fields ?? [];
    const names = [...new Set(fields.map((f) => f.group))];
    return names.map((name) => ({ name, fields: fields.filter((f) => f.group === name) }));
  });

  constructor() {
    effect(() => {
      const d = this.data.value();
      if (!d) return;
      this.code.set(d.state.draft.code);
      this.settings.set({ ...d.state.draft.settings });
      this.version = d.state.version;
      this.dirty.set(false);
    });
  }

  protected optionsFor(f: ThemeField): SelectOption[] {
    return (f.options ?? []).map((o) => ({ value: o, label: OPTION_LABELS[o] ?? o }));
  }

  protected font(key: string): string {
    return FONT_STACKS[key] ?? FONT_STACKS['sans'];
  }

  protected radius(key: string): string {
    return key === 'none' ? '0' : key === 'round' ? '16px' : '8px';
  }

  /** Text colour with better contrast on the given background (mirrors the storefront). */
  protected onColor(hex: string): string {
    const m = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
    if (!m) return '#fff';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#fff' : '#111';
  }

  protected choose(p: ThemePreset): void {
    // Content texts are kept; colours and style come from the new preset.
    const keep = ['heroTitle', 'heroSubtitle', 'heroCta', 'heroCategory', 'announcement', 'footerNote'];
    const current = this.settings();
    const next = { ...p.defaults };
    for (const k of keep) if (current[k] && current[k] !== this.presetDefault(k)) next[k] = current[k];
    this.code.set(p.code);
    this.settings.set(next);
    this.dirty.set(true);
  }

  private presetDefault(key: string): string | undefined {
    return this.data.value()?.presets.find((p) => p.code === this.code())?.defaults[key];
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
      this.dirty.set(false);
      this.data.update((d) => (d ? { ...d, state } : d));
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

  /** Saves the draft and opens the storefront with a signed preview link. */
  protected async preview(): Promise<void> {
    const tab = window.open('', '_blank');
    if (this.dirty() && !(await this.save())) {
      tab?.close();
      return;
    }
    this.previewing.set(true);
    try {
      const link = await firstValueFrom(this.api.previewLink(this.ctx.tenantId()));
      if (tab) {
        tab.opener = null;
        tab.location.href = link.url;
      } else {
        window.location.assign(link.url);
      }
    } catch (e) {
      tab?.close();
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.previewing.set(false);
    }
  }
}
