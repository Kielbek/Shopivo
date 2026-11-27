import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal, viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, CatalogApi, ContentApi, StorefrontAdminApi } from '@shopivo/api-client';
import { ProductImage, SectionType, ThemeField, ThemeSection } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, IconName, LogoComponent, SelectComponent, SelectOption, ToastOutletComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { buildTree } from '../catalog/category-tree';
import { StoreContext } from '../store/store-context';
import { contrast } from '../storefront/appearance.page';
import { ImagePickerComponent } from './image-picker';
import { GROUP_HELP, SECTION_ICONS, optionLabel } from './labels';
import { PropFormComponent } from './prop-form';

type View = { kind: 'home' } | { kind: 'section'; id: string } | { kind: 'add' } | { kind: 'group'; group: string };
type Device = 'desktop' | 'tablet' | 'phone';

const DEVICES: { id: Device; label: string; width: number; icon: IconName }[] = [
  { id: 'desktop', label: 'Komputer', width: 1280, icon: 'monitor' },
  { id: 'tablet', label: 'Tablet', width: 820, icon: 'tablet' },
  { id: 'phone', label: 'Telefon', width: 390, icon: 'smartphone' },
];

const GROUPS: { name: string; icon: IconName; hint: string }[] = [
  { name: 'Nagłówek', icon: 'menu', hint: 'Logo, menu, pasek informacyjny, nawigacja w telefonie' },
  { name: 'Stopka', icon: 'pages', hint: 'Tekst, newsletter, media społecznościowe' },
  { name: 'Kolory', icon: 'appearance', hint: 'Przyciski, tło, tekst' },
  { name: 'Typografia', icon: 'pencil', hint: 'Krój pisma, zaokrąglenia, karty produktów' },
];

function newId(type: string): string {
  return type.replace(/[^a-z]/g, '').slice(0, 10) + Math.random().toString(36).slice(2, 8);
}

/**
 * Full-screen theme editor (outside the panel layout): own top bar, a sidebar with separate views (home-page sections,
 * one section, add a section, header, footer, colours, typography) and the real storefront in the middle, updated live
 * through postMessage (the storefront accepts it only from the panel origin and only in preview).
 */
@Component({
  selector: 'sv-theme-editor-page',
  imports: [RouterLink, LucideDynamicIcon, LogoComponent, AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, SelectComponent,
    ToastOutletComponent, ImagePickerComponent, PropFormComponent],
  providers: [StoreContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-dvh bg-canvas lg:[background:var(--nav-bg)]', '(window:beforeunload)': 'beforeUnload($event)' },
  template: `
    <sv-toast-outlet />
    <!-- Collapsed panel navigation (desktop): the editor keeps the way back to every part of the store. -->
    <nav class="hidden w-[68px] shrink-0 flex-col items-center lg:flex" aria-label="Panel sklepu">
      <a [routerLink]="['/sklep', tenantId()]" class="flex h-16 items-center" aria-label="Przegląd sklepu" (click)="go($event, [])"><sv-logo [mark]="true" /></a>
      <ul class="flex flex-1 flex-col items-center gap-1 pt-2">
        @for (r of rail; track r.label) {
          <li>
            <a [routerLink]="['/sklep', tenantId(), ...r.path]" [attr.title]="r.label" [attr.aria-label]="r.label" (click)="go($event, r.path)"
              [attr.aria-current]="r.current ? 'page' : null"
              class="flex size-10 items-center justify-center rounded-[10px] transition-colors"
              [class]="r.current ? 'bg-nav-active text-nav-active-text' : 'text-nav-muted hover:bg-nav-hover hover:text-nav-strong'">
              <svg [lucideIcon]="icons[r.icon]" [size]="18" [strokeWidth]="1.75" /></a>
          </li>
        }
      </ul>
      <div class="flex w-full justify-center border-t border-nav-line pb-3 pt-3">
        <a [routerLink]="['/sklep', tenantId(), 'ustawienia']" title="Ustawienia" aria-label="Ustawienia" (click)="go($event, ['ustawienia'])"
          class="flex size-10 items-center justify-center rounded-[10px] text-nav-muted hover:bg-nav-hover hover:text-nav-strong">
          <svg [lucideIcon]="icons.settings" [size]="18" [strokeWidth]="1.75" /></a>
      </div>
    </nav>
    <div class="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas lg:my-2.5 lg:mr-2.5 lg:rounded-[18px]">
    <!-- top bar -->
    <header class="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card px-3 sm:px-4">
      <button type="button" class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] px-2 text-[13px] font-medium text-ink-soft hover:bg-hover hover:text-ink" (click)="exit()">
        <svg [lucideIcon]="icons.arrowLeft" [size]="16" />Wyjdź</button>
      <span class="hidden h-6 w-px bg-line sm:block"></span>
      <div class="hidden min-w-0 items-center gap-2 sm:flex">
        <span class="truncate text-[14px] font-semibold text-ink">{{ presetName() }}</span>
        @if (dirty()) {<sv-badge tone="warning">Niezapisane</sv-badge>}
        @else if (data.hasValue() && data.value().state.unpublishedChanges) {<sv-badge tone="info">Szkic</sv-badge>}
        @else if (data.hasValue()) {<sv-badge tone="success">Opublikowany</sv-badge>}
      </div>
      <span class="flex-1 sm:hidden"></span>
      <div class="mx-auto hidden rounded-[10px] bg-canvas p-1 sm:inline-flex" role="radiogroup" aria-label="Widok urządzenia">
        @for (d of devices; track d.id) {
          <button type="button" role="radio" [attr.aria-checked]="device() === d.id" [attr.aria-label]="d.label" [title]="d.label"
            class="flex h-8 w-10 items-center justify-center rounded-[8px] transition-colors"
            [class]="device() === d.id ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,18,16,0.1)]' : 'text-ink-muted hover:text-ink'" (click)="device.set(d.id)">
            <svg [lucideIcon]="icons[d.icon]" [size]="16" /></button>
        }
      </div>
      @if (canWrite) {
        <button sv-button variant="secondary" size="sm" [disabled]="!dirty()" [loading]="saving()" (click)="save()">Zapisz</button>
        <button sv-button variant="accent" size="sm" [loading]="publishing()" [disabled]="!dirty() && !(data.hasValue() && data.value().state.unpublishedChanges)" (click)="publish()">Opublikuj</button>
      }
    </header>

    @if (data.isLoading() && !data.hasValue()) {
      <div class="flex flex-1"><div class="w-[340px] space-y-3 border-r border-line bg-card p-4">@for (i of [1,2,3,4,5,6]; track i) {<span class="sv-shimmer block h-11 rounded-[8px]"></span>}</div>
        <div class="flex-1 p-6"><span class="sv-shimmer block h-full rounded-[14px]"></span></div></div>
    } @else if (data.error()) {
      <div class="p-6"><sv-alert tone="error">Nie udało się wczytać wyglądu sklepu.</sv-alert></div>
    } @else {
      <div class="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <!-- sidebar -->
        <aside class="flex max-h-[55dvh] min-h-0 w-full shrink-0 flex-col border-t border-line bg-card lg:max-h-none lg:w-[340px] lg:border-r lg:border-t-0" aria-label="Ustawienia wyglądu">
          @switch (view().kind) {
            @case ('home') {
              <div class="min-h-0 flex-1 overflow-y-auto">
                <div class="px-4 pb-2 pt-4">
                  <p class="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Strona główna</p>
                  <p class="mt-0.5 text-[12px] text-ink-muted">Przeciągnij, aby zmienić kolejność. Kliknij, aby edytować.</p>
                </div>
                <ul class="px-2" aria-label="Sekcje strony głównej">
                  @for (s of sections(); track s.id; let i = $index) {
                    <li class="group flex items-center gap-1 rounded-[8px] pr-1 transition-colors" [class.bg-primary-soft]="dropIndex() === i"
                      [attr.draggable]="canWrite" (dragstart)="dragStart(i, $event)" (dragover)="dragOver(i, $event)" (drop)="dropAt(i, $event)" (dragend)="dragIndex.set(null); dropIndex.set(null)">
                      <span class="cursor-grab px-1 text-ink-muted opacity-0 group-hover:opacity-100" aria-hidden="true"><svg [lucideIcon]="icons.grip" [size]="14" /></span>
                      <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 rounded-[8px] px-2 py-2 text-left hover:bg-hover" (click)="open({ kind: 'section', id: s.id })">
                        <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-canvas text-ink-soft" [class.opacity-40]="!s.enabled"><svg [lucideIcon]="icons[sectionIcon(s.type)]" [size]="15" /></span>
                        <span class="min-w-0" [class.opacity-50]="!s.enabled">
                          <span class="block truncate text-[13px] font-medium text-ink">{{ typeOf(s.type)?.name }}</span>
                          @if (s.data['heading']) {<span class="block truncate text-[12px] text-ink-muted">{{ s.data['heading'] }}</span>}
                        </span>
                      </button>
                      <button type="button" class="rounded-[6px] p-1.5 text-ink-muted hover:bg-hover hover:text-ink" [attr.aria-label]="(s.enabled ? 'Ukryj sekcję ' : 'Pokaż sekcję ') + typeOf(s.type)?.name"
                        [disabled]="!canWrite" (click)="toggle(s.id)"><svg [lucideIcon]="s.enabled ? icons.eye : icons.eyeOff" [size]="15" /></button>
                      <span class="hidden lg:flex lg:flex-col">
                        <button type="button" class="rounded p-0.5 text-ink-muted hover:text-ink disabled:opacity-20" [disabled]="!canWrite || i === 0" [attr.aria-label]="'Przesuń wyżej: ' + typeOf(s.type)?.name" (click)="move(i, i - 1)"><svg [lucideIcon]="icons.chevronUp" [size]="12" /></button>
                        <button type="button" class="rounded p-0.5 text-ink-muted hover:text-ink disabled:opacity-20" [disabled]="!canWrite || i === sections().length - 1" [attr.aria-label]="'Przesuń niżej: ' + typeOf(s.type)?.name" (click)="move(i, i + 1)"><svg [lucideIcon]="icons.chevronDown" [size]="12" /></button>
                      </span>
                    </li>
                  }
                </ul>
                @if (canWrite) {
                  <div class="px-4 py-2">
                    <button type="button" class="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong py-2.5 text-[13px] font-medium text-primary-strong hover:border-primary hover:bg-primary-soft"
                      [disabled]="sections().length >= 20" (click)="open({ kind: 'add' })"><svg [lucideIcon]="icons.plus" [size]="15" />Dodaj sekcję</button>
                  </div>
                }
                <div class="mt-2 border-t border-line px-4 pb-2 pt-4">
                  <p class="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Cały sklep</p>
                </div>
                <ul class="px-2 pb-3">
                  @for (g of groups; track g.name) {
                    <li><button type="button" class="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-2 text-left hover:bg-hover" (click)="open({ kind: 'group', group: g.name })">
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-canvas text-ink-soft"><svg [lucideIcon]="icons[g.icon]" [size]="15" /></span>
                      <span class="min-w-0 flex-1"><span class="block text-[13px] font-medium text-ink">{{ g.name }}</span><span class="block truncate text-[12px] text-ink-muted">{{ g.hint }}</span></span>
                      <svg [lucideIcon]="icons.chevronRight" [size]="15" class="text-ink-muted" /></button></li>
                  }
                </ul>
                <div class="border-t border-line p-4">
                  <a [routerLink]="['/sklep', tenantId(), 'wyglad', 'szablony']" class="flex items-center gap-2.5 rounded-[10px] border border-line p-3 hover:bg-hover">
                    <svg [lucideIcon]="icons.grid" [size]="16" class="text-ink-soft" />
                    <span class="min-w-0 flex-1"><span class="block text-[13px] font-medium text-ink">Szablon: {{ presetName() }}</span><span class="block text-[12px] text-ink-muted">Zmień na inny (wszystkie są darmowe)</span></span>
                    <svg [lucideIcon]="icons.chevronRight" [size]="15" class="text-ink-muted" /></a>
                </div>
              </div>
            }
            @case ('section') {
              @if (currentSection(); as s) {
                @let t = typeOf(s.type);
                <div class="flex items-center gap-2 border-b border-line px-3 py-3">
                  <button type="button" class="rounded-[8px] p-1.5 text-ink-soft hover:bg-hover" aria-label="Wróć do listy sekcji" (click)="open({ kind: 'home' })"><svg [lucideIcon]="icons.arrowLeft" [size]="16" /></button>
                  <div class="min-w-0"><p class="truncate text-[14px] font-semibold text-ink">{{ t?.name }}</p><p class="truncate text-[12px] text-ink-muted">{{ t?.description }}</p></div>
                </div>
                <div class="min-h-0 flex-1 overflow-y-auto p-4">
                  <fieldset [disabled]="!canWrite">
                    <sv-prop-form [props]="t?.props ?? []" [data]="s.data" [categories]="categoryList()" [links]="linkOptions()" [imageUrl]="imageUrlFn"
                      [idPrefix]="s.id" (changed)="updateSection(s.id, $event)" (pickImage)="pickFor({ section: s.id, key: $event })" />
                  </fieldset>
                </div>
                @if (canWrite) {
                  <div class="flex gap-2 border-t border-line p-3">
                    <button sv-button variant="secondary" size="sm" class="flex-1" (click)="toggle(s.id)"><svg [lucideIcon]="s.enabled ? icons.eyeOff : icons.eye" />{{ s.enabled ? 'Ukryj' : 'Pokaż' }}</button>
                    <button sv-button variant="ghost" size="sm" class="flex-1 !text-danger-ink" (click)="removeSection(s.id)"><svg [lucideIcon]="icons.trash" />Usuń sekcję</button>
                  </div>
                }
              }
            }
            @case ('add') {
              <div class="flex items-center gap-2 border-b border-line px-3 py-3">
                <button type="button" class="rounded-[8px] p-1.5 text-ink-soft hover:bg-hover" aria-label="Wróć do listy sekcji" (click)="open({ kind: 'home' })"><svg [lucideIcon]="icons.arrowLeft" [size]="16" /></button>
                <p class="text-[14px] font-semibold text-ink">Dodaj sekcję</p>
              </div>
              <ul class="min-h-0 flex-1 overflow-y-auto p-2">
                @for (t of sectionTypes(); track t.type) {
                  <li><button type="button" class="flex w-full items-start gap-3 rounded-[10px] p-3 text-left hover:bg-hover" (click)="addSection(t)">
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-primary-soft text-primary"><svg [lucideIcon]="icons[sectionIcon(t.type)]" [size]="16" /></span>
                    <span><span class="block text-[13px] font-medium text-ink">{{ t.name }}</span><span class="block text-[12px] leading-4 text-ink-muted">{{ t.description }}</span></span>
                  </button></li>
                }
              </ul>
            }
            @case ('group') {
              @let g = currentGroup();
              <div class="flex items-center gap-2 border-b border-line px-3 py-3">
                <button type="button" class="rounded-[8px] p-1.5 text-ink-soft hover:bg-hover" aria-label="Wróć" (click)="open({ kind: 'home' })"><svg [lucideIcon]="icons.arrowLeft" [size]="16" /></button>
                <p class="text-[14px] font-semibold text-ink">{{ g }}</p>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto p-4">
                @if (groupHelp[g]) {<p class="mb-4 text-[12px] text-ink-muted">{{ groupHelp[g] }}</p>}
                @if (g === 'Kolory' && lowContrast()) {
                  <sv-alert tone="warning" class="mb-4">Tekst może być słabo czytelny (kontrast {{ contrastValue() }}:1, zalecane 4,5:1).</sv-alert>
                }
                <fieldset class="space-y-4" [disabled]="!canWrite">
                  @for (f of fieldsOf(g); track f.key) {
                    @let id = 'f-' + f.key;
                    <div>
                      <label class="sv-label" [attr.for]="id">{{ f.label }}</label>
                      <div class="mt-1.5">
                        @switch (f.type) {
                          @case ('COLOR') {
                            <div class="flex gap-2">
                              <input type="color" class="h-10 w-12 shrink-0 cursor-pointer rounded-[var(--radius-control)] border border-line bg-card p-1" [attr.aria-label]="f.label + ' – paleta'"
                                [value]="settings()[f.key]" (input)="setSetting(f.key, $any($event.target).value)" />
                              <input class="sv-input uppercase" [id]="id" maxlength="7" [value]="settings()[f.key]" (change)="setSetting(f.key, $any($event.target).value)" />
                            </div>
                          }
                          @case ('SELECT') {
                            <sv-select [inputId]="id" [ariaLabel]="f.label" [options]="fieldOptions(f)" [value]="settings()[f.key]" (valueChange)="setSetting(f.key, $event ?? '')" />
                          }
                          @case ('IMAGE') {
                            @let url = imageUrlFn(settings()[f.key]);
                            <div class="flex items-center gap-3">
                              <span class="flex h-14 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-line bg-canvas text-ink-muted">
                                @if (url) {<img [src]="url" alt="" class="max-h-full max-w-full object-contain" />} @else {<svg [lucideIcon]="icons.image" [size]="18" />}
                              </span>
                              <div class="flex flex-col items-start gap-1">
                                <button type="button" class="text-[13px] font-medium text-primary-strong hover:underline" [id]="id" [attr.aria-label]="(url ? 'Zmień ' : 'Dodaj ') + f.label.toLowerCase()" (click)="pickFor({ setting: f.key })">{{ url ? 'Zmień logo' : 'Dodaj logo' }}</button>
                                @if (url) {<button type="button" class="text-[12px] text-ink-muted hover:text-danger-ink" (click)="setSetting(f.key, '')">Usuń (pokaż nazwę sklepu)</button>}
                              </div>
                            </div>
                            <p class="mt-1 text-[12px] text-ink-muted">Najlepiej PNG z przezroczystym tłem, poziome.</p>
                          }
                          @default {
                            <input class="sv-input" [id]="id" [attr.maxlength]="f.maxLength" [placeholder]="f.type === 'URL' ? 'https://…' : ''"
                              [value]="settings()[f.key] ?? ''" (change)="setSetting(f.key, $any($event.target).value.trim())" />
                          }
                        }
                      </div>
                    </div>
                  }
                </fieldset>
              </div>
            }
          }
        </aside>

        <!-- preview -->
        <main class="relative min-h-0 flex-1 overflow-hidden" #stage>
          @if (error(); as e) {<sv-alert tone="error" class="absolute inset-x-4 top-4 z-10">{{ e }}</sv-alert>}
          @if (frameUrl(); as src) {
            <div class="flex h-full justify-center overflow-hidden p-4">
              <div class="origin-top overflow-hidden bg-white shadow-[0_10px_40px_rgba(15,18,16,0.16)] transition-[width]"
                [class]="device() === 'phone' ? 'rounded-[28px] ring-[10px] ring-night' : device() === 'tablet' ? 'rounded-[18px] ring-[8px] ring-night' : 'rounded-[10px]'"
                [style.width.px]="deviceWidth()" [style.height.px]="frameHeight()" [style.transform]="'scale(' + scale() + ')'">
                <iframe #frame [src]="src" title="Podgląd sklepu na żywo" class="block size-full border-0 bg-white" sandbox="allow-scripts allow-same-origin allow-forms" (load)="framed()"></iframe>
              </div>
            </div>
          } @else {
            <div class="h-full p-6"><span class="sv-shimmer block h-full rounded-[14px]"></span></div>
          }
        </main>
      </div>
    }

    </div>

    <sv-image-picker #picker [tenantId]="ctx.tenantId()" [open]="!!picking()" [selected]="pickingValue()"
      (chosen)="imageChosen($event)" (cleared)="imageCleared()" (closed)="picking.set(null)" />

    <sv-dialog heading="Masz niezapisane zmiany" [open]="confirmExit()" (closed)="confirmExit.set(false)">
      <p class="text-[14px] text-ink-soft">Jeśli wyjdziesz teraz, zmiany w wyglądzie zostaną utracone.</p>
      <ng-container dialog-actions>
        <button sv-button variant="ghost" type="button" (click)="leave()">Wyjdź bez zapisywania</button>
        <button sv-button type="button" [loading]="saving()" (click)="saveAndLeave()">Zapisz i wyjdź</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class ThemeEditorPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly catalog = inject(CatalogApi);
  private readonly content = inject(ContentApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly icons = icons;
  protected readonly devices = DEVICES;
  protected readonly groups = GROUPS;
  protected readonly groupHelp = GROUP_HELP;

  readonly tenantId = input.required<string>();
  protected get canWrite(): boolean {
    return this.ctx.can('THEMES_WRITE');
  }

  protected readonly data = rxResource({ params: () => (this.ctx.tenantId() ? this.ctx.tenantId() : undefined), stream: ({ params }) => this.api.theme(params) });
  private readonly categoriesRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.catalog.categories(params) });
  private readonly pagesRes = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.content.list(params, 'PAGE', '', 0) });
  private readonly link = rxResource({ params: () => this.ctx.tenantId() || undefined, stream: ({ params }) => this.api.previewLink(params) });

  protected readonly code = signal('');
  protected readonly settings = signal<Record<string, string>>({});
  protected readonly sections = signal<ThemeSection[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly publishing = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly view = signal<View>({ kind: 'home' });
  /** Phones edit with the phone preview (the device switch is hidden there). */
  protected readonly device = signal<Device>(typeof window !== 'undefined' && window.innerWidth < 640 ? 'phone' : 'desktop');
  protected readonly picking = signal<{ section?: string; key?: string; setting?: string } | null>(null);
  protected readonly confirmExit = signal(false);
  protected readonly dragIndex = signal<number | null>(null);
  protected readonly dropIndex = signal<number | null>(null);
  private readonly images = signal<Record<string, Record<string, string>>>({});
  private readonly stageWidth = signal(1000);
  private readonly stageHeight = signal(700);
  private version = -1;
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly picker = viewChild<ImagePickerComponent>('picker');

  protected readonly sectionTypes = computed<SectionType[]>(() => (this.data.hasValue() ? this.data.value().sectionTypes : []));
  protected readonly presetName = computed(() => (this.data.hasValue() ? this.data.value().presets.find((p) => p.code === this.code())?.name ?? '' : ''));
  protected readonly currentSection = computed(() => {
    const v = this.view();
    return v.kind === 'section' ? this.sections().find((s) => s.id === v.id) ?? null : null;
  });
  protected readonly currentGroup = computed(() => {
    const v = this.view();
    return v.kind === 'group' ? v.group : '';
  });
  protected readonly categoryList = computed(() => (this.categoriesRes.hasValue() ? this.categoriesRes.value() : []));
  protected readonly linkOptions = computed<SelectOption[]>(() => [
    { value: '/produkty', label: 'Wszystkie produkty' },
    ...buildTree(this.categoryList()).map((n) => ({ value: '/kategoria/' + n.category.slug, label: 'Kategoria: ' + n.path.join(' › ') })),
    ...(this.pagesRes.hasValue() ? this.pagesRes.value().items : []).map((p) => ({ value: p.path, label: 'Strona: ' + p.title })),
    { value: '/blog', label: 'Blog' },
  ]);
  protected readonly imageUrlFn = (id: string | null | undefined): string | null => (id ? this.images()[id]?.['w400'] ?? null : null);
  protected readonly pickingValue = computed(() => {
    const p = this.picking();
    if (!p) return null;
    if (p.setting) return this.settings()[p.setting] || null;
    return this.sections().find((s) => s.id === p.section)?.data[p.key!] || null;
  });
  protected readonly contrastValue = computed(() => contrast(this.settings()['text'], this.settings()['background']).toFixed(1).replace('.', ','));
  protected readonly lowContrast = computed(() => contrast(this.settings()['text'], this.settings()['background']) < 4.5);

  // ---- preview frame ------------------------------------------------------------------------------------------------
  private readonly previewUrl = computed(() => (this.link.hasValue() ? this.link.value()?.url ?? null : null));
  protected readonly frameUrl = computed(() => {
    const u = this.previewUrl();
    return u && /^https?:\/\//.test(u) ? this.sanitizer.bypassSecurityTrustResourceUrl(u) : null;
  });
  private readonly frameOrigin = computed(() => {
    const u = this.previewUrl();
    try { return u ? new URL(u).origin : null; } catch { return null; }
  });
  protected readonly deviceWidth = computed(() => DEVICES.find((d) => d.id === this.device())!.width);
  protected readonly scale = computed(() => Math.min(1, (this.stageWidth() - 48) / this.deviceWidth()));
  protected readonly frameHeight = computed(() => Math.round((this.stageHeight() - 32) / this.scale()));

  constructor() {
    effect(() => void this.ctx.load(this.tenantId()));
    effect(() => {
      if (!this.data.hasValue()) return;
      const d = this.data.value();
      if (d.state.version < 0) {
        void this.router.navigate(['/sklep', this.tenantId(), 'wyglad', 'szablony'], { replaceUrl: true });
        return;
      }
      this.code.set(d.state.draft.code);
      this.settings.set({ ...d.state.draft.settings });
      this.sections.set(structuredClone(d.state.draft.sections ?? []));
      this.version = d.state.version;
      this.dirty.set(false);
      void this.loadImages();
    });
    // Every change goes to the preview at once.
    effect(() => {
      const theme = { code: this.code(), settings: this.settings(), sections: this.sections() };
      this.post({ type: 'shopivo:theme', theme, images: this.images() });
    });
    const destroyRef = inject(DestroyRef);
    const onMessage = (e: MessageEvent) => {
      if (e.origin === this.frameOrigin() && e.data?.type === 'shopivo:ready') {
        this.post({ type: 'shopivo:theme', theme: { code: this.code(), settings: this.settings(), sections: this.sections() }, images: this.images() });
      }
    };
    window.addEventListener('message', onMessage);
    destroyRef.onDestroy(() => window.removeEventListener('message', onMessage));
    afterNextRender(() => {
      const ro = new ResizeObserver(() => {
        const el = this.stage()?.nativeElement;
        if (el) {
          this.stageWidth.set(el.clientWidth);
          this.stageHeight.set(el.clientHeight);
        }
      });
      const watch = () => {
        const el = this.stage()?.nativeElement;
        if (el) ro.observe(el); else setTimeout(watch, 200);
      };
      watch();
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  private post(message: unknown): void {
    const win = this.frame()?.nativeElement.contentWindow;
    const origin = this.frameOrigin();
    if (win && origin) win.postMessage(message, origin);
  }

  protected framed(): void {
    // The storefront announces itself ("shopivo:ready"); this is a fallback for a slow handshake.
    setTimeout(() => this.post({ type: 'shopivo:theme', theme: { code: this.code(), settings: this.settings(), sections: this.sections() }, images: this.images() }), 400);
  }

  private async loadImages(): Promise<void> {
    const list = await this.picker()?.load();
    if (list) this.images.set(Object.fromEntries(list.map((i) => [i.id, i.urls])));
  }

  // ---- navigation in the sidebar ------------------------------------------------------------------------------------
  protected open(v: View): void {
    this.view.set(v);
  }

  protected typeOf(type: string): SectionType | undefined {
    return this.sectionTypes().find((t) => t.type === type);
  }

  protected sectionIcon(type: string): IconName {
    return SECTION_ICONS[type] ?? 'pages';
  }

  protected fieldsOf(group: string): ThemeField[] {
    return (this.data.hasValue() ? this.data.value().fields : []).filter((f) => f.group === group);
  }

  protected fieldOptions(f: ThemeField): SelectOption[] {
    return (f.options ?? []).map((o) => ({ value: o, label: optionLabel(f.key, o) }));
  }

  // ---- edits --------------------------------------------------------------------------------------------------------
  private touch(): void {
    this.dirty.set(true);
  }

  protected setSetting(key: string, value: string): void {
    this.settings.update((s) => ({ ...s, [key]: value }));
    this.touch();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected updateSection(id: string, data: Record<string, any>): void {
    this.sections.update((list) => list.map((s) => (s.id === id ? { ...s, data } : s)));
    this.touch();
  }

  protected toggle(id: string): void {
    this.sections.update((list) => list.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
    this.touch();
  }

  protected move(from: number, to: number): void {
    if (to < 0 || to >= this.sections().length) return;
    const list = [...this.sections()];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    this.sections.set(list);
    this.touch();
  }

  protected dragStart(i: number, e: DragEvent): void {
    this.dragIndex.set(i);
    e.dataTransfer?.setData('text/plain', String(i));
  }

  protected dragOver(i: number, e: DragEvent): void {
    if (this.dragIndex() === null) return;
    e.preventDefault();
    this.dropIndex.set(i);
  }

  protected dropAt(i: number, e: DragEvent): void {
    e.preventDefault();
    const from = this.dragIndex();
    this.dragIndex.set(null);
    this.dropIndex.set(null);
    if (from !== null && from !== i) this.move(from, i);
  }

  protected addSection(t: SectionType): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    for (const p of t.props) {
      data[p.key] = p.kind === 'SELECT' ? p.options?.[0] : p.kind === 'ITEMS' || p.kind === 'CATEGORIES' ? [] : p.kind === 'TOGGLE' ? false : '';
    }
    if ('heading' in data) data['heading'] = t.name;
    const s: ThemeSection = { id: newId(t.type), type: t.type, enabled: true, data };
    this.sections.update((list) => [...list, s]);
    this.touch();
    this.open({ kind: 'section', id: s.id });
  }

  protected removeSection(id: string): void {
    this.sections.update((list) => list.filter((s) => s.id !== id));
    this.touch();
    this.open({ kind: 'home' });
  }

  // ---- images -------------------------------------------------------------------------------------------------------
  protected async pickFor(target: { section?: string; key?: string; setting?: string }): Promise<void> {
    this.picking.set(target);
    await this.loadImages();
  }

  protected imageChosen(img: ProductImage): void {
    this.images.update((m) => ({ ...m, [img.id]: img.urls }));
    this.applyImage(img.id);
  }

  protected imageCleared(): void {
    this.applyImage('');
  }

  private applyImage(id: string): void {
    const p = this.picking();
    if (!p) return;
    if (p.setting) this.setSetting(p.setting, id);
    else if (p.section && p.key) {
      const s = this.sections().find((x) => x.id === p.section);
      if (s) this.updateSection(s.id, { ...s.data, [p.key]: id });
    }
    this.picking.set(null);
  }

  // ---- save / publish / exit ----------------------------------------------------------------------------------------
  protected async save(): Promise<boolean> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const state = await firstValueFrom(this.api.saveTheme(this.ctx.tenantId(), this.code(), this.settings(), this.version, this.sections()));
      this.version = state.version;
      this.dirty.set(false);
      this.data.update((d) => (d ? { ...d, state } : d));
      this.toast.success('Zapisano zmiany (szkic).');
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
      this.toast.success('Opublikowano — klienci widzą nowy wygląd.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.publishing.set(false);
    }
  }

  /** Where "leave" goes: the appearance overview, or a rail destination. */
  private exitTo: string[] = ['wyglad'];
  protected readonly rail: { label: string; icon: IconName; path: string[]; current?: boolean }[] = [
    { label: 'Przegląd', icon: 'dashboard', path: [] },
    { label: 'Zamówienia', icon: 'orders', path: ['zamowienia'] },
    { label: 'Produkty', icon: 'products', path: ['produkty'] },
    { label: 'Klienci', icon: 'users', path: ['klienci'] },
    { label: 'Wygląd sklepu', icon: 'appearance', path: ['wyglad'], current: true },
    { label: 'Strony i blog', icon: 'pages', path: ['tresci'] },
  ];

  protected go(e: MouseEvent, path: string[]): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    this.exitTo = path;
    if (this.dirty()) this.confirmExit.set(true);
    else this.leave();
  }

  protected exit(): void {
    this.exitTo = ['wyglad'];
    if (this.dirty()) this.confirmExit.set(true);
    else this.leave();
  }

  protected leave(): void {
    this.dirty.set(false);
    this.confirmExit.set(false);
    void this.router.navigate(['/sklep', this.tenantId(), ...this.exitTo]);
  }

  protected async saveAndLeave(): Promise<void> {
    if (await this.save()) this.leave();
  }

  protected beforeUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) e.preventDefault();
  }
}
