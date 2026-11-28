import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, ContentApi, StorefrontAdminApi } from '@shopivo/api-client';
import { ProductImage, TemplatePageDoc, TemplateResponse, TemplateSectionSchema } from '@shopivo/shared-models';
import {
  AlertComponent, BackIconComponent, BadgeComponent, ButtonComponent, DialogComponent, IconName, ToastOutletComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { buildTree } from '../catalog/category-tree';
import { StoreContext } from '../store/store-context';
import { ImagePickerComponent } from '../theme-editor/image-picker';
import { CategoryOption, LinkOption, SettingFieldsComponent } from './setting-fields';
import {
  Docs, History, Target, add, addBlock, canAddBlock, duplicate, duplicateBlock, fullDocs, isFixed, move, moveBlock, newSection,
  ownKeys, remove, removeBlock, setSetting, step, stepBlock, storeDoc, toggleBlockHidden, toggleHidden,
} from './template-doc';

type Device = 'desktop' | 'tablet' | 'phone';
const DEVICES: { id: Device; label: string; width: number; icon: IconName }[] = [
  { id: 'desktop', label: 'Komputer', width: 1280, icon: 'monitor' },
  { id: 'tablet', label: 'Tablet', width: 820, icon: 'tablet' },
  { id: 'phone', label: 'Telefon', width: 390, icon: 'smartphone' },
];

/** Pages of a template, in the order a merchant thinks of them, with the address shown in the preview. */
const PAGES: { id: string; label: string; path: string }[] = [
  { id: 'index', label: 'Strona główna', path: '/' },
  { id: 'catalog', label: 'Lista produktów', path: '/produkty' },
  { id: 'product', label: 'Produkt', path: '/produkty' },
  { id: 'cart', label: 'Koszyk', path: '/koszyk' },
  { id: 'checkout', label: 'Zamówienie', path: '/zamowienie' },
  { id: 'order', label: 'Potwierdzenie zamówienia', path: '/zamowienie/potwierdzenie' },
  { id: 'favorites', label: 'Ulubione', path: '/ulubione' },
  { id: 'page', label: 'Strona z treścią (regulamin…)', path: '/strona/regulamin' },
  { id: 'blog', label: 'Blog', path: '/blog' },
  { id: 'auth', label: 'Logowanie i rejestracja', path: '/konto/logowanie' },
  { id: 'account', label: 'Konto klienta', path: '/konto' },
  { id: 'account_order', label: 'Zamówienie w koncie', path: '/konto' },
  { id: 'newsletter', label: 'Potwierdzenie newslettera', path: '/newsletter' },
  { id: 'review', label: 'Opinia z zaproszenia', path: '/opinia' },
  { id: 'not_found', label: 'Nie znaleziono (404)', path: '/nie-znaleziono' },
];

type Selection = (Target & { group: string }) | null;
type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Editor of a template package (engine v2): the real storefront in the middle, edited in place (click to select, type
 * to change texts, toolbar to move/duplicate/hide/remove), a list of the page's sections and their elements on the left
 * (drag to reorder), the selected item's settings on the right. Every change is kept as a draft automatically; undo,
 * redo, earlier publications and "Opublikuj" in the top bar.
 */
@Component({
  selector: 'sv-template-editor-page',
  imports: [LucideDynamicIcon, AlertComponent, BackIconComponent, BadgeComponent, ButtonComponent, DialogComponent, ToastOutletComponent,
    ImagePickerComponent, SettingFieldsComponent],
  providers: [StoreContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-dvh flex-col bg-canvas', '(window:keydown)': 'keys($event)', '(window:message)': 'message($event)', '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <sv-toast-outlet />
    <header class="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-3">
      <button type="button" class="group inline-flex h-9 items-center rounded-[8px] px-2 text-[13px] font-medium text-ink-soft hover:bg-hover hover:text-ink" (click)="exit()">
        <sv-back-icon icon="appearance" label="Wyjdź" hoverLabel="Wróć" /></button>
      <span class="hidden h-6 w-px bg-line md:block"></span>
      <span class="hidden truncate text-[14px] font-semibold text-ink md:block">{{ tpl()?.name }}</span>
      <span class="text-[12px] text-ink-muted" role="status" aria-live="polite">
        @switch (status()) {
          @case ('saving') {Zapisywanie…}
          @case ('pending') {Zmiany…}
          @case ('error') {<span class="text-danger-ink">Nie zapisano</span>}
          @default {@if (unpublished()) {<sv-badge tone="info">Szkic — niewidoczny dla klientów</sv-badge>} @else {<sv-badge tone="success">Opublikowany</sv-badge>}}
        }
      </span>
      <label class="ml-2 hidden items-center gap-2 text-[13px] text-ink-soft lg:flex">Strona
        <select class="sv-input !h-9 !w-60" [value]="page()" (change)="openPage($any($event.target).value)" aria-label="Edytowana strona">
          @for (p of pages; track p.id) {<option [value]="p.id">{{ p.label }}</option>}
        </select></label>
      <span class="flex-1"></span>
      <div class="hidden items-center gap-1 sm:flex">
        <button type="button" class="grid size-9 place-items-center rounded-[8px] text-ink-soft hover:bg-hover disabled:opacity-40" title="Cofnij (Ctrl+Z)" aria-label="Cofnij" [disabled]="!canUndo()" (click)="undo()"><svg [lucideIcon]="icons.undo" [size]="16" /></button>
        <button type="button" class="grid size-9 place-items-center rounded-[8px] text-ink-soft hover:bg-hover disabled:opacity-40" title="Ponów (Ctrl+Shift+Z)" aria-label="Ponów" [disabled]="!canRedo()" (click)="redo()"><svg [lucideIcon]="icons.redo" [size]="16" /></button>
      </div>
      <div class="hidden rounded-[10px] bg-canvas p-1 md:inline-flex" role="radiogroup" aria-label="Widok urządzenia">
        @for (d of devices; track d.id) {
          <button type="button" role="radio" [attr.aria-checked]="device() === d.id" [attr.aria-label]="d.label" [title]="d.label"
            class="flex h-8 w-10 items-center justify-center rounded-[8px]" [class]="device() === d.id ? 'bg-card text-ink shadow-sm' : 'text-ink-muted hover:text-ink'"
            (click)="device.set(d.id)"><svg [lucideIcon]="icons[d.icon]" [size]="16" /></button>
        }
      </div>
      <button sv-button variant="ghost" size="sm" (click)="historyOpen.set(true)" [disabled]="!tpl()?.versions?.length">Historia</button>
      @if (canWrite) {
        <button sv-button variant="accent" size="sm" [loading]="publishing()" [disabled]="status() === 'saving' || (!unpublished() && status() === 'saved')" (click)="publish()">Opublikuj</button>
      }
    </header>

    @if (res.error(); as e) {
      <div class="p-6"><sv-alert tone="error">{{ errorText(e) }}</sv-alert></div>
    } @else if (!tpl()) {
      <div class="flex flex-1 gap-3 p-3"><span class="sv-shimmer w-72 rounded-[12px]"></span><span class="sv-shimmer flex-1 rounded-[12px]"></span></div>
    } @else {
      @if (conflict()) {<div class="border-b border-line bg-card px-4 py-2"><sv-alert tone="warning">Wygląd sklepu zmieniono w innym oknie. <button type="button" class="font-semibold underline" (click)="reload()">Wczytaj najnowszą wersję</button> (zmiany z tego okna od ostatniego zapisu zostaną utracone).</sv-alert></div>}
      <div class="flex min-h-0 flex-1">
        <!-- Left: sections of the page -->
        <aside class="flex w-[290px] shrink-0 flex-col border-r border-line bg-card" aria-label="Sekcje strony">
          <div class="border-b border-line p-3 lg:hidden">
            <select class="sv-input" [value]="page()" (change)="openPage($any($event.target).value)" aria-label="Edytowana strona">
              @for (p of pages; track p.id) {<option [value]="p.id">{{ p.label }}</option>}
            </select>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto p-2">
            @for (g of groupsInOrder; track g) {
              @let doc = docs()[g === 'page' ? page() : g];
              @if (g === 'page') {<p class="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{{ pageLabel() }}</p>}
              <ul [attr.aria-label]="g === 'header' ? 'Nagłówek' : g === 'footer' ? 'Stopka' : 'Sekcje strony'" class="space-y-0.5">
                @for (id of doc.order; track id; let i = $index) {
                  @let s = doc.sections[id];
                  @let schema = schemas()[s.type];
                  @let isSel = sel()?.group === g && sel()?.section === id && !sel()?.block;
                  <li [class.opacity-50]="s.disabled">
                    <div class="group flex items-center gap-1 rounded-[8px] pr-1 text-[13px]" [class]="isSel ? 'bg-primary-soft text-ink' : 'hover:bg-hover'"
                      [class.ring-2]="dropAt() === g + ':' + i" [attr.draggable]="!isFixed(s.type) && canWrite"
                      (dragstart)="drag = { group: g, id }" (dragover)="dragOver($event, g, i)" (drop)="dropSection($event, g, i)" (dragend)="drag = null; dropAt.set(null)">
                      <span class="cursor-grab px-1 text-ink-muted" [class.invisible]="isFixed(s.type)" aria-hidden="true">⋮⋮</span>
                      <button type="button" class="min-w-0 flex-1 truncate py-2 text-left font-medium" (click)="select({ group: g, section: id })">{{ schema?.name ?? s.type }}</button>
                      @if (!isFixed(s.type) && canWrite) {
                        <button type="button" class="hidden size-7 place-items-center rounded text-ink-muted hover:text-ink group-hover:grid" [attr.aria-label]="(s.disabled ? 'Pokaż: ' : 'Ukryj: ') + schema?.name" (click)="act('hide', { group: g, section: id })">
                          <svg [lucideIcon]="s.disabled ? icons.eyeOff : icons.eye" [size]="14" /></button>
                      }
                    </div>
                    @if (schema?.blocks?.length && (isSel || sel()?.section === id)) {
                      <ul class="ml-6 space-y-0.5 border-l border-line pl-2">
                        @for (bid of s.block_order ?? []; track bid; let j = $index) {
                          @let b = s.blocks![bid];
                          @let bSel = sel()?.section === id && sel()?.block === bid;
                          <li class="flex items-center gap-1 rounded-[6px] text-[12px]" [class]="bSel ? 'bg-primary-soft' : 'hover:bg-hover'" [class.opacity-50]="b.disabled"
                            [attr.draggable]="canWrite" (dragstart)="drag = { group: g, id, block: bid }" (dragover)="dragOver($event, g, j, id)" (drop)="dropBlock($event, g, id, j)" (dragend)="drag = null; dropAt.set(null)">
                            <span class="cursor-grab px-1 text-ink-muted" aria-hidden="true">⋮</span>
                            <button type="button" class="min-w-0 flex-1 truncate py-1.5 text-left" (click)="select({ group: g, section: id, block: bid })">{{ blockLabel(schema, b) }}</button>
                          </li>
                        }
                        @if (canWrite && canAddBlock(schema, s)) {
                          @for (bt of schema!.blocks; track bt.type) {<li><button type="button" class="px-2 py-1.5 text-[12px] font-semibold text-primary-strong hover:underline" (click)="addBlockTo(g, id, bt.type)">+ {{ bt.name }}</button></li>}
                        }
                      </ul>
                    }
                  </li>
                }
              </ul>
              @if (g === 'page' && canWrite) {
                <button type="button" class="mt-2 w-full rounded-[8px] border border-dashed border-line px-3 py-2 text-[13px] font-semibold text-primary-strong hover:bg-hover" (click)="adding.set(true)">+ Dodaj sekcję</button>
              }
              @if (g !== 'footer') {<hr class="my-2 border-line" />}
            }
          </div>
        </aside>

        <!-- Middle: the storefront -->
        <main class="relative flex min-w-0 flex-1 items-start justify-center overflow-hidden bg-canvas p-3" #stage>
          @if (frameUrl(); as url) {
            <div class="shrink-0 origin-top overflow-hidden rounded-[10px] border border-line bg-white shadow-sm" [style.width.px]="deviceWidth()" [style.height.px]="frameHeight()" [style.transform]="'scale(' + scale() + ')'">
              <iframe #frame [src]="url" title="Podgląd sklepu — kliknij element, aby go edytować" class="size-full" (load)="frameLoaded()"></iframe>
            </div>
          } @else {
            <span class="sv-shimmer size-full rounded-[10px]"></span>
          }
          @if (!frameReady() && frameUrl()) {<p class="absolute bottom-4 rounded-[8px] bg-card px-3 py-2 text-[12px] text-ink-muted shadow">Wczytywanie podglądu…</p>}
        </main>

        <!-- Right: settings of the selection -->
        <aside class="w-[320px] shrink-0 overflow-y-auto border-l border-line bg-card p-4" aria-label="Ustawienia">
          @if (selected(); as x) {
            <div class="mb-4 flex items-start justify-between gap-2">
              <div><p class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{{ x.block ? x.sectionName : 'Sekcja' }}</p>
                <h2 class="text-[16px] font-semibold text-ink">{{ x.title }}</h2></div>
              <button type="button" class="rounded-[8px] p-1 text-ink-muted hover:bg-hover" aria-label="Zamknij ustawienia" (click)="select(null)">✕</button>
            </div>
            @if (canWrite && !x.fixed) {
              <div class="mb-4 flex flex-wrap gap-1.5">
                <button sv-button variant="secondary" size="sm" (click)="act('up')" aria-label="Przesuń wyżej">↑</button>
                <button sv-button variant="secondary" size="sm" (click)="act('down')" aria-label="Przesuń niżej">↓</button>
                <button sv-button variant="secondary" size="sm" (click)="act('duplicate')">Powiel</button>
                <button sv-button variant="secondary" size="sm" (click)="act('hide')">{{ x.hidden ? 'Pokaż' : 'Ukryj' }}</button>
                <button sv-button variant="ghost" size="sm" class="text-danger-ink" (click)="act('remove')">Usuń</button>
              </div>
            }
            @if (x.settings.length) {
              <sv-setting-fields [settings]="x.settings" [values]="x.values" [idPrefix]="x.key" [links]="linkOptions()" [categories]="categoryOptions()"
                [imageUrl]="imageUrlFn" (changed)="changeSetting($event.id, $event.value)" (pickImage)="picking.set($event)" />
            } @else {<p class="text-[13px] text-ink-muted">Ta część nie ma ustawień. Teksty zmienisz, klikając je na podglądzie.</p>}
          } @else {
            <h2 class="text-[15px] font-semibold text-ink">Edycja na podglądzie</h2>
            <ul class="mt-3 space-y-2 text-[13px] text-ink-soft">
              <li>Kliknij sekcję na podglądzie albo na liście, aby zobaczyć jej ustawienia.</li>
              <li>Kliknij tekst, aby go poprawić od razu na stronie.</li>
              <li>Kliknij zdjęcie, aby je wymienić.</li>
              <li>Przeciągaj sekcje na liście po lewej, aby zmienić kolejność.</li>
              <li>Zmiany zapisują się same jako szkic. Klienci zobaczą je po kliknięciu „Opublikuj”.</li>
            </ul>
          }
        </aside>
      </div>
    }

    <sv-dialog [open]="adding()" heading="Dodaj sekcję" (closed)="adding.set(false)">
      <ul class="grid gap-2 sm:grid-cols-2">
        @for (t of addable(); track t.type) {
          <li><button type="button" class="w-full rounded-[10px] border border-line p-3 text-left hover:border-primary hover:bg-hover" (click)="addSection(t.type)">
            <span class="block text-[14px] font-semibold text-ink">{{ t.name }}</span>
            <span class="block text-[12px] text-ink-muted">{{ t.settings.length }} ustawień{{ t.blocks.length ? ' · elementy: ' + t.blocks[0].name.toLowerCase() : '' }}</span></button></li>
        }
      </ul>
    </sv-dialog>

    <sv-dialog [open]="historyOpen()" heading="Historia publikacji" (closed)="historyOpen.set(false)">
      <p class="mb-3 text-[13px] text-ink-soft">Wybrana wersja wróci jako szkic. Klienci zobaczą ją po kliknięciu „Opublikuj”.</p>
      <ul class="space-y-2">
        @for (v of tpl()?.versions ?? []; track v.id; let first = $first) {
          <li class="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2 text-[13px]">
            <span>{{ date(v.createdAt) }}@if (first) { <sv-badge tone="success">obecnie opublikowana</sv-badge>}</span>
            @if (canWrite) {<button sv-button variant="secondary" size="sm" (click)="restore(v.id)">Przywróć</button>}
          </li>
        }
      </ul>
    </sv-dialog>

    @if (picking(); as setting) {
      <sv-image-picker [tenantId]="ctx.tenantId()" [open]="true" [selected]="null" (chosen)="imageChosen($event)" (cleared)="picking.set(null)" (closed)="picking.set(null)" />
    }
  `,
})
export class TemplateEditorPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly catalog = inject(CatalogApi);
  private readonly content = inject(ContentApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly icons = icons;
  protected readonly devices = DEVICES;
  protected readonly pages = PAGES;
  protected readonly groupsInOrder = ['header', 'page', 'footer'];
  protected readonly isFixed = isFixed;
  protected readonly canAddBlock = canAddBlock;

  readonly tenantId = input.required<string>();
  protected get canWrite(): boolean {
    return this.ctx.can('THEMES_WRITE');
  }

  protected readonly res = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.api.template(params) });
  private readonly link = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.api.previewLink(params) });
  private readonly categoriesRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.catalog.categories(params) });
  private readonly pagesRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.content.list(params, 'PAGE', '', 0) });
  private readonly productRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.catalog.products(params, { page: 0, size: 1, status: 'ACTIVE' }) });
  private readonly libraryRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.api.themeImages(params) });

  protected readonly tpl = signal<TemplateResponse | null>(null);
  protected readonly docs = signal<Docs>({});
  private own = new Set<string>();
  private version = -1;
  protected readonly page = signal('index');
  protected readonly sel = signal<Selection>(null);
  protected readonly status = signal<SaveStatus>('saved');
  protected readonly unpublished = signal(false);
  protected readonly publishing = signal(false);
  protected readonly conflict = signal(false);
  protected readonly adding = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly picking = signal<string | null>(null);
  protected readonly device = signal<Device>('desktop');
  protected readonly dropAt = signal<string | null>(null);
  protected drag: { group: string; id: string; block?: string } | null = null;
  private readonly history = new History<{ docs: Docs; own: string[] }>();
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private renderTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  protected readonly frameReady = signal(false);
  private readonly stageSize = signal({ width: 1000, height: 700 });

  protected readonly schemas = computed<Record<string, TemplateSectionSchema>>(() => this.tpl()?.sections ?? {});
  protected readonly pageLabel = computed(() => PAGES.find((p) => p.id === this.page())?.label ?? '');
  protected readonly addable = computed(() => Object.values(this.schemas()).filter((s) => !isFixed(s.type)).sort((a, b) => a.name.localeCompare(b.name, 'pl')));
  protected readonly deviceWidth = computed(() => DEVICES.find((d) => d.id === this.device())!.width);
  protected readonly scale = computed(() => Math.min(1, (this.stageSize().width - 24) / this.deviceWidth()));
  protected readonly frameHeight = computed(() => (this.stageSize().height - 24) / this.scale());

  // ---- preview -------------------------------------------------------------------------------------------------------
  private readonly origin = computed(() => {
    const u = this.link.hasValue() ? this.link.value()?.url : null;
    try {
      return u ? new URL(u).origin : null;
    } catch {
      return null;
    }
  });
  private readonly framePath = computed(() => {
    const p = PAGES.find((x) => x.id === this.page())!;
    if (p.id === 'product') {
      const slug = this.productRes.hasValue() ? this.productRes.value().items[0]?.slug : null;
      return slug ? '/produkt/' + encodeURIComponent(slug) : '/produkty';
    }
    if (p.id === 'page') {
      const first = this.pagesRes.hasValue() ? this.pagesRes.value().items[0] : null;
      return first?.path ?? p.path;
    }
    return p.path;
  });
  protected readonly frameUrl = computed(() => {
    const u = this.link.hasValue() ? this.link.value() : null;
    if (!u || !this.origin()) return null;
    const url = new URL(this.framePath(), this.origin()!);
    url.searchParams.set('podglad', u.token);
    url.searchParams.set('edycja', '1');
    return this.sanitizer.bypassSecurityTrustResourceUrl(url.toString());
  });

  // ---- selection -----------------------------------------------------------------------------------------------------
  protected readonly selected = computed(() => {
    const s = this.sel();
    if (!s) return null;
    const doc = this.docs()[s.group === 'page' ? this.page() : s.group];
    const section = doc?.sections[s.section];
    if (!section) return null;
    const schema = this.schemas()[section.type];
    if (s.block) {
      const b = section.blocks?.[s.block];
      const bs = schema?.blocks.find((x) => x.type === b?.type);
      if (!b || !bs) return null;
      return { title: this.blockLabel(schema, b), sectionName: schema?.name ?? '', block: true, fixed: false, hidden: !!b.disabled,
        settings: bs.settings, values: b.settings, key: `${s.section}-${s.block}` };
    }
    return { title: schema?.name ?? section.type, sectionName: '', block: false, fixed: isFixed(section.type), hidden: !!section.disabled,
      settings: schema?.settings ?? [], values: section.settings, key: s.section };
  });

  protected readonly categoryOptions = computed<CategoryOption[]>(() =>
    buildTree(this.categoriesRes.hasValue() ? this.categoriesRes.value() : []).map((n) => ({ slug: n.category.slug, label: n.path.join(' › ') })));
  protected readonly linkOptions = computed<LinkOption[]>(() => [
    { value: '/', label: 'Strona główna' }, { value: '/produkty', label: 'Wszystkie produkty' }, { value: '/produkty?promocje=tak', label: 'Promocje' },
    ...this.categoryOptions().map((c) => ({ value: '/kategoria/' + c.slug, label: 'Kategoria: ' + c.label })),
    ...(this.pagesRes.hasValue() ? this.pagesRes.value().items : []).map((p) => ({ value: p.path, label: 'Strona: ' + p.title })),
    { value: '/blog', label: 'Blog' }, { value: '/konto', label: 'Konto klienta' }, { value: '/koszyk', label: 'Koszyk' },
    { value: 'legal:TERMS', label: 'Regulamin (strona sklepu)' }, { value: 'legal:PRIVACY', label: 'Polityka prywatności' },
    { value: 'legal:RETURNS', label: 'Zwroty' }, { value: 'legal:SHIPPING', label: 'Dostawa' },
  ]);
  protected readonly imageUrlFn = (ref: unknown): string | null => {
    if (typeof ref !== 'string' || !ref) return null;
    const t = this.tpl();
    if (ref.startsWith('asset:')) return t && this.origin() ? `${this.origin()}/_t/${t.code.toLowerCase()}/${t.templateVersion}/${encodeURIComponent(ref.slice(6))}` : null;
    return (this.libraryRes.hasValue() ? this.libraryRes.value() : []).find((i) => i.id === ref)?.urls['w400'] ?? null;
  };

  constructor() {
    effect(() => void this.ctx.load(this.tenantId()));
    effect(() => {
      if (!this.res.hasValue()) return;
      const t = this.res.value();
      if (this.tpl()) return; // keep the working copy; a reload is explicit
      this.load(t);
    });
    const destroy = inject(DestroyRef);
    const ro = new ResizeObserver(([e]) => this.stageSize.set({ width: e.contentRect.width, height: e.contentRect.height }));
    effect(() => {
      const el = this.stage()?.nativeElement;
      if (el) ro.observe(el);
    });
    destroy.onDestroy(() => {
      ro.disconnect();
      clearTimeout(this.saveTimer);
    });
  }

  private load(t: TemplateResponse): void {
    this.tpl.set(t);
    this.docs.set(fullDocs(t.defaults, t.state.draft));
    this.own = ownKeys(t.state.draft);
    this.version = t.state.version;
    this.unpublished.set(t.state.unpublishedChanges);
    this.status.set('saved');
    this.conflict.set(false);
  }

  protected reload(): void {
    this.tpl.set(null);
    this.res.reload();
  }

  protected errorText(e: unknown): string {
    const err = ApiError.from(e);
    return err.code === 'NOT_A_TEMPLATE_PACKAGE' ? 'Ten szablon korzysta z poprzedniego edytora.' : 'Nie udało się wczytać szablonu. ' + err.message;
  }

  protected blockLabel(schema: TemplateSectionSchema | undefined, b: { type: string; settings: Record<string, unknown> }): string {
    const bs = schema?.blocks.find((x) => x.type === b.type);
    const text = ['title', 'label', 'heading', 'question', 'text'].map((k) => b.settings[k]).find((v) => typeof v === 'string' && v.trim());
    return (text as string | undefined)?.slice(0, 40) ?? bs?.name ?? b.type;
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }

  // ---- changes -------------------------------------------------------------------------------------------------------

  private keyOf(group: string): string {
    return group === 'page' ? this.page() : group;
  }

  /** One change to one page/group: undo point, draft save, preview update. */
  private change(group: string, next: TemplatePageDoc, opts: { mergeKey?: string; render?: boolean } = {}): void {
    if (!this.canWrite) return;
    const key = this.keyOf(group);
    this.history.push({ docs: this.docs(), own: [...this.own] }, opts.mergeKey ?? null);
    this.docs.update((d) => ({ ...d, [key]: next }));
    this.own.add(key);
    this.afterChange(opts.render !== false);
  }

  private afterChange(render: boolean): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
    this.status.set('pending');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 700);
    if (render) this.renderPreview();
  }

  protected undo(): void {
    const prev = this.history.undo({ docs: this.docs(), own: [...this.own] });
    if (!prev) return;
    this.docs.set(prev.docs);
    this.own = new Set(prev.own);
    this.afterChange(true);
  }

  protected redo(): void {
    const next = this.history.redo({ docs: this.docs(), own: [...this.own] });
    if (!next) return;
    this.docs.set(next.docs);
    this.own = new Set(next.own);
    this.afterChange(true);
  }

  private async save(): Promise<void> {
    if (this.status() === 'saving') {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => void this.save(), 400);
      return;
    }
    this.status.set('saving');
    try {
      const state = await firstValueFrom(this.api.saveTemplateDraft(this.ctx.tenantId(), storeDoc(this.docs(), this.own), this.version));
      this.version = state.version;
      this.unpublished.set(state.unpublishedChanges);
      if (this.status() === 'saving') this.status.set('saved');
    } catch (e) {
      const err = ApiError.from(e);
      this.status.set('error');
      if (err.code === 'VERSION_CONFLICT') this.conflict.set(true);
      else this.toast.error(err.message);
    }
  }

  protected changeSetting(id: string, value: unknown): void {
    const s = this.sel();
    if (!s) return;
    const doc = this.docs()[this.keyOf(s.group)];
    this.change(s.group, setSetting(doc, s, id, value), { mergeKey: `${s.section}/${s.block ?? ''}:${id}` });
  }

  protected act(action: string, target: Selection = this.sel()): void {
    if (!target) return;
    const doc = this.docs()[this.keyOf(target.group)];
    const section = doc?.sections[target.section];
    if (!section) return;
    if (target.block) {
      const b = target.block;
      switch (action) {
        case 'up': return this.change(target.group, stepBlock(doc, target.section, b, -1));
        case 'down': return this.change(target.group, stepBlock(doc, target.section, b, 1));
        case 'hide': return this.change(target.group, toggleBlockHidden(doc, target.section, b));
        case 'remove':
          this.change(target.group, removeBlock(doc, target.section, b));
          return this.select({ group: target.group, section: target.section });
        case 'duplicate': {
          const d = duplicateBlock(doc, target.section, b);
          this.change(target.group, d.doc);
          return this.select({ ...target, block: d.id });
        }
      }
      return;
    }
    if (isFixed(section.type)) {
      if (action !== 'settings') this.toast.info('Tej części nie można przesuwać ani usuwać — jest stałym elementem strony.');
      return;
    }
    switch (action) {
      case 'up': return this.change(target.group, step(doc, target.section, -1));
      case 'down': return this.change(target.group, step(doc, target.section, 1));
      case 'hide': return this.change(target.group, toggleHidden(doc, target.section));
      case 'remove':
        this.change(target.group, remove(doc, target.section));
        return this.select(null);
      case 'duplicate': {
        const d = duplicate(doc, target.section);
        this.change(target.group, d.doc);
        return this.select({ group: target.group, section: d.id });
      }
    }
  }

  protected addSection(type: string): void {
    const t = this.tpl();
    if (!t) return;
    const after = this.sel()?.group === 'page' ? this.sel()!.section : null;
    const r = add(this.docs()[this.page()], newSection(type, t.defaults), after);
    this.change('page', r.doc);
    this.adding.set(false);
    this.select({ group: 'page', section: r.id });
  }

  protected addBlockTo(group: string, section: string, type: string): void {
    const r = addBlock(this.docs()[this.keyOf(group)], section, type);
    this.change(group, r.doc);
    this.select({ group, section, block: r.id });
  }

  // ---- drag & drop in the list ---------------------------------------------------------------------------------------

  protected dragOver(e: DragEvent, group: string, index: number, section?: string): void {
    if (!this.drag || this.drag.group !== group || (!!this.drag.block !== !!section) || (section && this.drag.id !== section)) return;
    e.preventDefault();
    this.dropAt.set(group + ':' + index);
  }

  protected dropSection(e: DragEvent, group: string, index: number): void {
    e.preventDefault();
    const d = this.drag;
    this.dropAt.set(null);
    this.drag = null;
    if (!d || d.block || d.group !== group) return;
    const doc = this.docs()[this.keyOf(group)];
    const target = doc.sections[doc.order[index]];
    if (target && isFixed(target.type) && group !== 'page') return;
    this.change(group, move(doc, d.id, index));
  }

  protected dropBlock(e: DragEvent, group: string, section: string, index: number): void {
    e.preventDefault();
    e.stopPropagation();
    const d = this.drag;
    this.dropAt.set(null);
    this.drag = null;
    if (!d?.block || d.id !== section) return;
    this.change(group, moveBlock(this.docs()[this.keyOf(group)], section, d.block, index));
  }

  // ---- images --------------------------------------------------------------------------------------------------------

  protected imageChosen(img: ProductImage): void {
    const setting = this.picking();
    this.picking.set(null);
    if (setting) this.changeSetting(setting, img.id);
  }

  // ---- selection, pages ----------------------------------------------------------------------------------------------

  protected select(s: Selection): void {
    this.sel.set(s);
    this.post({ type: 'shop:selected', section: s?.section ?? null, block: s?.block ?? null });
  }

  protected openPage(id: string): void {
    if (!PAGES.some((p) => p.id === id)) return;
    this.page.set(id);
    this.sel.set(null);
    this.frameReady.set(false);
  }

  // ---- preview messages ----------------------------------------------------------------------------------------------

  private post(m: Record<string, unknown>): void {
    const w = this.frame()?.nativeElement.contentWindow;
    const o = this.origin();
    if (w && o && this.frameReady()) w.postMessage(m, o);
  }

  private renderPreview(): void {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      const d = this.docs();
      this.post({ type: 'shop:render', doc: { pages: { [this.page()]: d[this.page()] }, groups: { header: d['header'], footer: d['footer'] } } });
    }, 120);
  }

  protected frameLoaded(): void {
    // The overlay announces itself (shop:ready); nothing to do until then.
  }

  protected message(e: MessageEvent): void {
    if (e.origin !== this.origin() || e.source !== this.frame()?.nativeElement.contentWindow || !e.data || typeof e.data.type !== 'string') return;
    const m = e.data as { type: string; section?: string; block?: string; setting?: string; value?: unknown; action?: string };
    const group = (id: string | undefined): string => {
      if (!id) return 'page';
      for (const g of ['header', 'footer']) if (this.docs()[g]?.sections[id]) return g;
      return 'page';
    };
    switch (m.type) {
      case 'shop:ready':
        this.frameReady.set(true);
        this.post({ type: 'shop:names', sections: Object.fromEntries(Object.values(this.schemas()).map((s) => [s.type, s.name])) });
        if (this.own.size || this.status() !== 'saved') this.renderPreview();
        if (this.sel()) this.select(this.sel());
        break;
      case 'shop:select':
        if (typeof m.section === 'string') this.sel.set({ group: group(m.section), section: m.section, ...(typeof m.block === 'string' ? { block: m.block } : {}) });
        break;
      case 'shop:text': {
        if (typeof m.section !== 'string' || typeof m.setting !== 'string' || typeof m.value !== 'string') return;
        const g = group(m.section);
        const doc = this.docs()[this.keyOf(g)];
        const target: Target = { section: m.section, ...(typeof m.block === 'string' ? { block: m.block } : {}) };
        // Already on screen: save it, do not re-render under the cursor
        this.change(g, setSetting(doc, target, m.setting, m.value), { mergeKey: `${m.section}/${m.block ?? ''}:${m.setting}`, render: false });
        break;
      }
      case 'shop:action':
        if (typeof m.section === 'string' && typeof m.action === 'string') {
          this.act(m.action, { group: group(m.section), section: m.section, ...(typeof m.block === 'string' ? { block: m.block } : {}) });
        }
        break;
      case 'shop:image':
        if (typeof m.section === 'string' && typeof m.setting === 'string') {
          this.sel.set({ group: group(m.section), section: m.section, ...(typeof m.block === 'string' ? { block: m.block } : {}) });
          if (this.canWrite) this.picking.set(m.setting);
        }
        break;
    }
  }

  // ---- publish, history, leaving -------------------------------------------------------------------------------------

  protected async publish(): Promise<void> {
    this.publishing.set(true);
    try {
      clearTimeout(this.saveTimer);
      if (this.status() !== 'saved') await this.save();
      if (this.status() === 'error') return;
      const state = await firstValueFrom(this.api.publishTemplate(this.ctx.tenantId()));
      this.version = state.version;
      this.unpublished.set(false);
      this.toast.success('Opublikowano — klienci widzą nowy wygląd.');
      const t = await firstValueFrom(this.api.template(this.ctx.tenantId()));
      this.tpl.update((x) => (x ? { ...x, versions: t.versions } : x));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.publishing.set(false);
    }
  }

  protected async restore(id: string): Promise<void> {
    try {
      clearTimeout(this.saveTimer);
      if (this.status() !== 'saved') await this.save();
      await firstValueFrom(this.api.restoreTemplateVersion(this.ctx.tenantId(), id, this.version));
      this.historyOpen.set(false);
      this.load(await firstValueFrom(this.api.template(this.ctx.tenantId())));
      this.renderPreview();
      this.toast.success('Przywrócono wersję jako szkic.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected keys(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo(); else this.undo();
    }
  }

  protected beforeUnload(e: BeforeUnloadEvent): void {
    if (this.status() !== 'saved') e.preventDefault();
  }

  protected async exit(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (this.status() === 'pending') await this.save();
    await this.router.navigate(['/sklep', this.ctx.tenantId(), 'wyglad']);
  }
}
