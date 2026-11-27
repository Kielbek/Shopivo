import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { AlertComponent, BadgeComponent, ButtonComponent, DatePipe, IconName, LoadingComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { ThemeMockComponent } from './theme-mock';

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
 * Appearance overview: the chosen template, its status and the way in — the full-screen editor (sections, header,
 * footer, colours) or the template gallery. A store without a template starts in the gallery.
 */
@Component({
  selector: 'sv-appearance-page',
  imports: [RouterLink, LucideDynamicIcon, AlertComponent, BadgeComponent, ButtonComponent, DatePipe, LoadingComponent, ThemeMockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.isLoading() && !data.hasValue()) {
      <sv-loading variant="detail" />
    } @else if (data.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać wyglądu sklepu.</sv-alert>
    } @else if (data.hasValue() && data.value().state.version >= 0) {
      @let d = data.value();
      <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-[24px] font-semibold tracking-[-0.02em] text-ink">Wygląd sklepu</h1>
          <p class="mt-1 text-[13px] text-ink-muted">Szablon, strona główna, nagłówek, stopka i kolory. Zmiany robisz w edytorze i publikujesz, gdy są gotowe.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <a sv-button variant="secondary" routerLink="szablony"><svg [lucideIcon]="icons.grid" />Zmień szablon</a>
          @if (canWrite) {<a sv-button [routerLink]="['/sklep', ctx.tenantId(), 'edytor-wygladu']"><svg [lucideIcon]="icons.pencil" />Dostosuj w edytorze</a>}
        </div>
      </div>

      <section class="sv-card mt-5 grid gap-6 p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <a [routerLink]="['/sklep', ctx.tenantId(), 'edytor-wygladu']" class="group block overflow-hidden rounded-[12px] border border-line bg-canvas p-4" aria-label="Otwórz edytor wyglądu">
          <div class="relative mx-auto max-w-[92%]">
            <div class="overflow-hidden rounded-t-[10px] shadow-[0_6px_24px_rgba(15,18,16,0.12)] transition-transform group-hover:-translate-y-1">
              <sv-theme-mock [settings]="d.state.draft.settings" [sections]="d.state.draft.sections" [storeName]="storeName()" />
            </div>
            <div class="absolute -bottom-4 -right-3 w-[24%] overflow-hidden rounded-[12px] border-[3px] border-[#0F1210] shadow-lg">
              <sv-theme-mock [settings]="d.state.draft.settings" [sections]="d.state.draft.sections" [storeName]="storeName()" [phone]="true" />
            </div>
          </div>
        </a>
        <div class="flex flex-col">
          <p class="text-[12px] font-medium uppercase tracking-wide text-ink-muted">Twój szablon</p>
          <p class="mt-0.5 flex flex-wrap items-center gap-2 text-[22px] font-semibold text-ink">{{ preset()?.name }}<span class="text-[13px] font-semibold text-success-ink">Darmowy</span></p>
          <p class="mt-1 text-[13px] text-ink-soft">{{ preset()?.description }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
            @if (d.state.unpublishedChanges) {<sv-badge tone="info">Szkic czeka na publikację</sv-badge>} @else {<sv-badge tone="success">Opublikowany</sv-badge>}
            @if (d.state.publishedAt) {<span>ostatnia publikacja {{ d.state.publishedAt | svDate }}</span>} @else {<span>jeszcze nie opublikowany</span>}
          </div>
          <ul class="mt-5 divide-y divide-line rounded-[12px] border border-line">
            @for (row of summary(); track row.label) {
              <li class="flex items-center gap-3 px-4 py-3">
                <svg [lucideIcon]="icons[row.icon]" [size]="16" class="text-ink-muted" />
                <span class="flex-1 text-[13px] text-ink">{{ row.label }}</span>
                <span class="text-[12px] text-ink-muted">{{ row.value }}</span>
              </li>
            }
          </ul>
          @if (canWrite && d.state.unpublishedChanges) {
            <div class="mt-auto flex items-center gap-3 pt-5">
              <p class="flex-1 text-[12px] text-ink-muted">Masz zapisany szkic, którego klienci jeszcze nie widzą.</p>
              <button sv-button variant="accent" [loading]="publishing()" (click)="publish()">Opublikuj</button>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class AppearancePage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('THEMES_WRITE');
  protected readonly storeName = computed(() => this.ctx.store()?.name ?? '');
  protected readonly data = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.theme(params) });
  protected readonly publishing = signal(false);

  protected readonly preset = computed(() => {
    if (!this.data.hasValue()) return null;
    const d = this.data.value();
    return d.presets.find((p) => p.code === d.state.draft.code) ?? null;
  });

  protected readonly summary = computed<{ icon: IconName; label: string; value: string }[]>(() => {
    if (!this.data.hasValue()) return [];
    const st = this.data.value().state.draft;
    const sections = st.sections ?? [];
    const s = st.settings;
    return [
      { icon: 'dashboard', label: 'Strona główna', value: `${sections.filter((x) => x.enabled).length} sekcji` },
      { icon: 'menu', label: 'Nawigacja w telefonie', value: s['mobileNav'] === 'bottom' ? 'dolny pasek' : 'menu boczne' },
      { icon: 'image', label: 'Logo', value: s['logoImage'] ? 'dodane' : 'nazwa sklepu' },
      { icon: 'mail', label: 'Newsletter w stopce', value: s['footerNewsletter'] === 'no' ? 'wyłączony' : 'włączony' },
    ];
  });

  constructor() {
    effect(() => {
      if (this.data.hasValue() && this.data.value().state.version < 0) {
        void this.router.navigate(['/sklep', this.ctx.tenantId(), 'wyglad', 'szablony'], { replaceUrl: true });
      }
    });
  }

  protected async publish(): Promise<void> {
    this.publishing.set(true);
    try {
      const state = await firstValueFrom(this.api.publishTheme(this.ctx.tenantId()));
      this.data.update((d) => (d ? { ...d, state } : d));
      this.toast.success('Opublikowano — klienci widzą nowy wygląd.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.publishing.set(false);
    }
  }
}
