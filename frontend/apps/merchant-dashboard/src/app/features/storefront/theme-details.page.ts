import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ThemePreset } from '@shopivo/shared-models';
import { AlertComponent, BackIconComponent, BadgeComponent, ButtonComponent, LoadingComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { industryOf, storeIndustries } from '../catalog/industries';
import { StoreContext } from '../store/store-context';
import { storesLabel, themeChoice } from './theme-choice';
import { STYLE_LABELS, isPreview, metaOf } from './theme-meta';

type Device = 'desktop' | 'phone';

/**
 * One template: a live demo with the template's example products (rendered by the real storefront in template-preview
 * mode — no store's data, buying switched off), how many stores use it, what it suits and what it contains, and
 * "Use this template". The merchant's own editor never shows example products — only theirs.
 */
@Component({
  selector: 'sv-theme-details-page',
  imports: [RouterLink, LucideDynamicIcon, AlertComponent, BackIconComponent, BadgeComponent, ButtonComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink=".." class="group inline-flex items-center text-[13px] text-ink-muted hover:text-ink"><sv-back-icon icon="appearance" [size]="14" label="Szablony" /></a>
    @if (data.isLoading() && !data.hasValue()) {
      <sv-loading class="mt-6" variant="cards" [rows]="2" />
    } @else if (!preset()) {
      <sv-alert tone="error" class="mt-6">Nie znaleziono szablonu.</sv-alert>
    } @else {
      @let p = preset()!;
      @let meta = metaFor(p.code);
      <div class="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-[28px] font-semibold tracking-[-0.02em] text-ink">{{ p.name }}</h1>
            <sv-badge tone="success">Darmowy</sv-badge>
            @if (isCurrent()) {<sv-badge tone="info">Twój szablon</sv-badge>}
            @else if (recommended()) {<sv-badge tone="success">Polecany dla Twojej branży</sv-badge>}
          </div>
          <p class="mt-1 max-w-2xl text-[14px] text-ink-soft">{{ p.description }}</p>
          <p class="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
            <svg [lucideIcon]="icons.store" [size]="15" class="text-ink-soft" />
            {{ usage() ? 'Korzysta z niego ' + stores(usage()) : 'Nikt jeszcze nie korzysta z tego szablonu — możesz być pierwszy' }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (demoHref(); as href) {<a sv-button variant="secondary" [href]="href" target="_blank" rel="noopener"><svg [lucideIcon]="icons.eye" />Otwórz podgląd w nowej karcie</a>}
          @if (canWrite && !isCurrent()) {
            <button sv-button [loading]="choosing()" (click)="choose(p)">Wybierz szablon „{{ p.name }}”</button>
          } @else if (isCurrent()) {
            <a sv-button [routerLink]="['/sklep', ctx.tenantId(), 'edytor-wygladu']">Dostosuj w edytorze</a>
          }
        </div>
      </div>

      <!-- live demo -->
      <section class="mt-6 overflow-hidden rounded-[16px] border border-line bg-canvas" aria-label="Podgląd szablonu">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-2.5">
          <p class="text-[13px] text-ink-soft">Podgląd z przykładowymi produktami — klikaj, przeglądaj kategorie i produkty.</p>
          <div class="flex rounded-[10px] bg-canvas p-1" role="group" aria-label="Urządzenie">
            <button type="button" class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px]" [class]="device() === 'desktop' ? 'bg-card font-medium text-ink shadow-sm' : 'text-ink-soft'"
              [attr.aria-pressed]="device() === 'desktop'" (click)="device.set('desktop')"><svg [lucideIcon]="icons.monitor" [size]="15" />Komputer</button>
            <button type="button" class="flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[13px]" [class]="device() === 'phone' ? 'bg-card font-medium text-ink shadow-sm' : 'text-ink-soft'"
              [attr.aria-pressed]="device() === 'phone'" (click)="device.set('phone')"><svg [lucideIcon]="icons.smartphone" [size]="15" />Telefon</button>
          </div>
        </div>
        <div #stage class="flex justify-center overflow-hidden p-4" [style.height.px]="stageHeight()">
          @if (demoUrl(); as src) {
            <div class="origin-top overflow-hidden bg-white shadow-[0_10px_40px_rgba(15,18,16,0.16)]"
              [class]="device() === 'phone' ? 'rounded-[28px] ring-[10px] ring-night' : 'rounded-[10px]'"
              [style.width.px]="frameWidth()" [style.height.px]="frameHeight()" [style.transform]="'scale(' + scale() + ')'">
              <iframe [src]="src" [title]="'Podgląd szablonu ' + p.name" class="block size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
            </div>
          } @else {
            <span class="sv-shimmer block size-full rounded-[10px]"></span>
          }
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-3">
        <section class="sv-card p-5" aria-labelledby="t-fit">
          <h2 id="t-fit" class="text-[15px] font-semibold text-ink">Dla kogo</h2>
          <dl class="mt-3 space-y-3 text-[13px]">
            <div><dt class="text-ink-muted">Najlepiej sprawdzi się w</dt><dd class="mt-0.5 text-ink">{{ industryNames(meta.industries) || 'Każdej branży' }}</dd></div>
            <div><dt class="text-ink-muted">Styl</dt><dd class="mt-0.5 text-ink">{{ styleLabels[meta.style] }}</dd></div>
            <div><dt class="text-ink-muted">Kolory</dt>
              <dd class="mt-1 flex gap-1.5">@for (c of swatches(p); track $index) {<span class="size-6 rounded-full border border-black/10" [style.background]="c" [title]="c"></span>}</dd></div>
          </dl>
        </section>
        <section class="sv-card p-5" aria-labelledby="t-has">
          <h2 id="t-has" class="text-[15px] font-semibold text-ink">Co zawiera</h2>
          <ul class="mt-3 space-y-1.5 text-[13px] text-ink">
            @for (f of meta.features; track f) {<li class="flex gap-2"><svg [lucideIcon]="icons.check" [size]="15" class="mt-0.5 shrink-0 text-success-ink" />{{ f }}</li>}
          </ul>
          <p class="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Strona główna</p>
          <ol class="mt-1.5 list-inside list-decimal space-y-0.5 text-[13px] text-ink-soft">
            @for (s of p.sections; track s.id) {<li>{{ sectionName(s.type) }}</li>}
          </ol>
        </section>
        <section class="sv-card p-5" aria-labelledby="t-imgs">
          <h2 id="t-imgs" class="text-[15px] font-semibold text-ink">Zdjęcia szablonu</h2>
          <p class="mt-1 text-[13px] text-ink-soft">Gotowe od razu w edytorze — każde możesz podmienić na swoje.</p>
          <ul class="mt-3 grid grid-cols-4 gap-1.5">
            @for (img of images(); track img.ref) {<li><img [src]="img.urls['w400']" [alt]="img.label" [title]="img.label" class="aspect-square w-full rounded-[6px] object-cover" loading="lazy" /></li>}
          </ul>
        </section>
      </div>
      <p class="mt-4 rounded-[10px] bg-canvas px-4 py-3 text-[13px] text-ink-soft">
        Przykładowe produkty są tylko w tym podglądzie. W edytorze i w Twoim sklepie zobaczysz wyłącznie swoje produkty
        (przykładowe możesz dodać do sklepu jednym przyciskiem w edytorze, jeśli chcesz od nich zacząć).
      </p>
    }
  `,
})
export class ThemeDetailsPage {
  protected readonly ctx = inject(StoreContext);
  readonly code = input<string>();
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly icons = icons;
  protected readonly styleLabels = STYLE_LABELS;
  protected readonly canWrite = this.ctx.can('THEMES_WRITE');

  protected readonly data = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.theme(params) });
  /** The store's own storefront address (from a preview link) — the demo runs there in template-preview mode. */
  private readonly link = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.api.previewLink(params) });
  protected readonly preset = computed<ThemePreset | null>(() => (this.data.hasValue() ? this.data.value().presets.find((p) => p.code === this.code()) ?? null : null));
  protected readonly usage = computed(() => (this.data.hasValue() ? this.data.value().usage?.[this.code() ?? ''] ?? 0 : 0));
  protected readonly images = computed(() => (this.data.hasValue() ? this.data.value().templateImages.filter((i) => i.template === (this.code() ?? '').toLowerCase() && !isPreview(i.ref)) : []));
  protected readonly isCurrent = computed(() => this.data.hasValue() && this.data.value().state.version >= 0 && this.data.value().state.draft.code === this.code());
  protected readonly recommended = computed(() => storeIndustries(this.ctx.store()).some((i) => metaOf(this.code() ?? '').industries.includes(i)));
  protected readonly choosing = signal(false);
  protected readonly device = signal<Device>('desktop');

  protected readonly demoHref = computed(() => {
    const u = this.link.hasValue() ? this.link.value()?.url : null;
    try {
      return u && this.code() ? `${new URL(u).origin}/?szablon=${encodeURIComponent(this.code()!)}` : null;
    } catch {
      return null;
    }
  });
  protected readonly demoUrl = computed(() => {
    const h = this.demoHref();
    return h && /^https?:\/\//.test(h) ? this.sanitizer.bypassSecurityTrustResourceUrl(h) : null;
  });

  // Device frame, scaled to the available width like the theme editor
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly stageWidth = signal(1000);
  protected readonly frameWidth = computed(() => (this.device() === 'phone' ? 390 : 1280));
  protected readonly frameHeight = computed(() => (this.device() === 'phone' ? 780 : 800));
  protected readonly scale = computed(() => Math.min(1, (this.stageWidth() - 32) / this.frameWidth()));
  protected readonly stageHeight = computed(() => Math.round(this.frameHeight() * this.scale()) + 32);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(() => {
        const el = this.stage()?.nativeElement;
        if (el) this.stageWidth.set(el.clientWidth);
      });
      const watch = () => {
        const el = this.stage()?.nativeElement;
        if (el) ro.observe(el); else setTimeout(watch, 200);
      };
      watch();
      destroy.onDestroy(() => ro.disconnect());
    });
  }

  protected metaFor(code: string) {
    return metaOf(code);
  }

  protected stores(n: number): string {
    return storesLabel(n);
  }

  protected swatches(p: ThemePreset): string[] {
    return [p.defaults['primary'], p.defaults['accent'], p.defaults['background'], p.defaults['surface'], p.defaults['text']];
  }

  protected industryNames(ids: string[]): string {
    return ids.map((i) => industryOf(i as never)?.label).filter(Boolean).join(', ');
  }

  protected sectionName(type: string): string {
    return (this.data.hasValue() ? this.data.value().sectionTypes.find((t) => t.type === type)?.name : null) ?? type;
  }

  protected async choose(p: ThemePreset): Promise<void> {
    const d = this.data.value();
    if (!d) return;
    this.choosing.set(true);
    try {
      const { settings, sections } = themeChoice(d, p);
      await firstValueFrom(this.api.saveTheme(this.ctx.tenantId(), p.code, settings, d.state.version, sections));
      this.toast.success(`Wybrano szablon „${p.name}”. Dopasuj go w edytorze i opublikuj, gdy będzie gotowy.`);
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'edytor-wygladu']);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.choosing.set(false);
    }
  }
}
