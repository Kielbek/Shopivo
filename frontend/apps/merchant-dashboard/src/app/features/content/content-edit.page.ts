import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi, StorefrontAdminApi, StoresApi } from '@shopivo/api-client';
import { ContentEntry, ContentInput, ContentKind, ContentStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, DatePipe, ButtonComponent, CardComponent, DialogComponent, FieldComponent, LoadingComponent, PageHeaderComponent,
  TabOption, TabsComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { RichPreviewComponent } from './rich-preview';
import { DevicePreviewComponent } from './device-preview';
import { LegalDataFormComponent } from './legal-data-form';

interface Form {
  title: string; slug: string; excerpt: string; body: string; showInFooter: boolean; seoTitle: string; seoDescription: string;
}

const PLACEHOLDER = /\[uzupełnij[^\]]*\]/g;

/** Editor of a page or blog post (route `tresci/nowa?rodzaj=` or `tresci/:id`). */
@Component({
  selector: 'sv-content-edit-page',
  imports: [DevicePreviewComponent, LegalDataFormComponent, FormsModule, RouterLink, DatePipe, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, FieldComponent, DialogComponent, TabsComponent, RichPreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="../" [queryParams]="{ zakladka: kind() === 'POST' ? 'blog' : null }" class="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink">
      <svg [lucideIcon]="icons.arrowLeft" [size]="14" />Strony i blog
    </a>
    @if (id() && entry.isLoading() && !entry.value()) {
      <sv-loading class="mt-2" variant="detail" />
    } @else if (id() && entry.error()) {
      <sv-alert tone="error" class="mt-6">Nie znaleziono strony.</sv-alert>
    } @else {
      <sv-page-header class="mt-3" [title]="heading()" [description]="kind() === 'POST' ? 'Wpis na blogu sklepu.' : 'Strona informacyjna sklepu.'">
        @if (current(); as e) {
          <sv-badge [tone]="e.status === 'PUBLISHED' ? 'success' : 'neutral'">{{ e.status === 'PUBLISHED' ? 'Opublikowana' : 'Szkic' }}</sv-badge>
        }
      </sv-page-header>

      @if (current()?.systemKey) {
        <section class="sv-card mt-5 p-5" aria-labelledby="legal-panel">
          <div class="flex flex-wrap items-start gap-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px]" [class]="placeholders() ? 'bg-warning/20 text-warning-ink' : 'bg-success/15 text-success-ink'">
              <svg [lucideIcon]="placeholders() ? icons.legal : icons.check" [size]="18" /></span>
            <div class="min-w-0 flex-1">
              <h2 id="legal-panel" class="text-[15px] font-semibold text-ink">Dokument prawny ze wzoru</h2>
              <p class="mt-0.5 text-[13px] text-ink-soft">Wzór wypełniamy danymi Twojej firmy. Shopivo nie świadczy porad prawnych — przeczytaj go i dostosuj do swojej
                działalności (najlepiej z prawnikiem).</p>
              @if (placeholders()) {
                <p class="mt-3 text-[13px] text-warning-ink"><strong class="font-semibold">Do uzupełnienia ({{ placeholders() }}):</strong> {{ missingItems().join(' · ') }}</p>
              } @else {
                <p class="mt-3 text-[13px] text-success-ink">Wszystkie dane są uzupełnione.</p>
              }
            </div>
            @if (canWrite) {
              <div class="flex flex-wrap gap-2">
                <button sv-button size="sm" [variant]="placeholders() ? 'primary' : 'secondary'" (click)="dataForm.openForm()"><svg [lucideIcon]="icons.pencil" />Dane w dokumentach</button>
                <button sv-button size="sm" variant="ghost" (click)="confirmTemplate.set(true)"><svg [lucideIcon]="icons.refresh" />Wstaw aktualny wzór</button>
              </div>
            }
          </div>
        </section>
        <sv-legal-data-form #dataForm (saved)="confirmTemplate.set(true)" />
        <sv-dialog heading="Wstawić aktualny wzór?" [open]="confirmTemplate()" (closed)="confirmTemplate.set(false)">
          <p class="text-[14px] text-ink-soft">Treść w edytorze zastąpimy wzorem wypełnionym aktualnymi danymi. Zmiana nie jest zapisana, dopóki nie klikniesz
            „Zapisz” lub „Opublikuj” — możesz ją przejrzeć w podglądzie.</p>
          <sv-alert tone="warning" class="mt-4">Twoje ręczne zmiany w treści tego dokumentu zostaną zastąpione.</sv-alert>
          <ng-container dialog-actions>
            <button sv-button variant="secondary" type="button" (click)="confirmTemplate.set(false)">Nie teraz</button>
            <button sv-button type="button" [loading]="loadingTemplate()" (click)="insertTemplate()">Wstaw wzór</button>
          </ng-container>
        </sv-dialog>
      }
      @if (error(); as e) {<sv-alert tone="error" class="mt-5">{{ e }}</sv-alert>}

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-6">
          <sv-card>
            <div class="grid gap-4">
              <sv-field label="Tytuł" for="c-title"><input id="c-title" name="title" class="sv-input" maxlength="200" [disabled]="!canWrite" [(ngModel)]="f.title" /></sv-field>
              <sv-field label="Adres" for="c-slug" [hint]="'Adres w sklepie: ' + prefix() + (f.slug || 'tworzony z tytułu')" [optional]="!id()">
                <input id="c-slug" name="slug" class="sv-input" maxlength="140" [disabled]="!canWrite" [(ngModel)]="f.slug" placeholder="np. o-nas" />
              </sv-field>
              @if (kind() === 'POST') {
                <sv-field label="Zajawka" for="c-excerpt" hint="Krótki opis na liście wpisów (do 300 znaków)." [optional]="true">
                  <textarea id="c-excerpt" name="excerpt" class="sv-input !h-20 py-2" maxlength="300" [disabled]="!canWrite" [(ngModel)]="f.excerpt"></textarea>
                </sv-field>
              }
            </div>
          </sv-card>

          <sv-card>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="text-[15px] font-semibold text-ink">Treść</h2>
              <sv-tabs label="Widok treści" [tabs]="viewTabs" [active]="view()" (activeChange)="view.set($any($event))" />
            </div>
            @if (view() === 'edycja') {
              <div role="tabpanel" id="panel-edycja" aria-labelledby="tab-edycja" class="mt-4">
                <label class="sr-only" for="c-body">Treść</label>
                <textarea id="c-body" name="body" class="sv-input !h-[480px] py-3 font-mono text-[13px] leading-relaxed" maxlength="100000"
                  [disabled]="!canWrite" [(ngModel)]="f.body" (ngModelChange)="onBodyChange()"></textarea>
                <details class="mt-3 text-[12px] text-ink-muted">
                  <summary class="cursor-pointer select-none font-medium text-ink">Formatowanie</summary>
                  <ul class="mt-2 grid gap-1 sm:grid-cols-2">
                    <li><code>## Nagłówek</code>, <code>### Podtytuł</code></li>
                    <li><code>**pogrubienie**</code>, <code>*kursywa*</code></li>
                    <li><code>- punkt</code> lub <code>1. punkt</code></li>
                    <li><code>[tekst](/strona/regulamin)</code> lub <code>[tekst](https://…)</code></li>
                    <li>pusta linia = nowy akapit, <code>---</code> = linia</li>
                  </ul>
                </details>
              </div>
            } @else if (view() === 'sklep') {
              <div role="tabpanel" id="panel-sklep" aria-labelledby="tab-sklep" class="mt-4">
                @if (current(); as e) {
                  <p class="mb-3 text-[12px] text-ink-muted">Tak stronę widzą klienci (z wyglądem Twojego sklepu). Pokazuje zapisaną wersję — zapisz zmiany i kliknij „Odśwież”.</p>
                  <sv-device-preview [url]="previewUrl()" [title]="'Podgląd: ' + e.title" />
                } @else {
                  <p class="text-[13px] text-ink-muted">Zapisz stronę, aby zobaczyć ją w wyglądzie sklepu.</p>
                }
              </div>
            } @else {
              <div role="tabpanel" id="panel-podglad" aria-labelledby="tab-podglad" class="mt-4 rounded-[10px] border border-line p-5">
                <h1 class="mb-4 text-[22px] font-semibold text-ink">{{ f.title || 'Bez tytułu' }}</h1>
                <sv-rich-preview [source]="f.body" />
              </div>
            }
          </sv-card>
        </div>

        <div class="space-y-6">
          <sv-card heading="Publikacja">
            @if (current(); as e) {
              <dl class="space-y-1.5 text-[13px]">
                <div class="flex justify-between gap-2"><dt class="text-ink-muted">Status</dt><dd class="font-medium text-ink">{{ e.status === 'PUBLISHED' ? 'Opublikowana' : 'Szkic' }}</dd></div>
                @if (e.publishedAt) {<div class="flex justify-between gap-2"><dt class="text-ink-muted">Pierwsza publikacja</dt><dd class="text-ink">{{ e.publishedAt | svDate: 'date' }}</dd></div>}
                @if (e.publishedRevision) {<div class="flex justify-between gap-2"><dt class="text-ink-muted">Wersja</dt><dd class="text-ink">{{ e.publishedRevision }}</dd></div>}
              </dl>
              @if (e.systemKey && e.status === 'PUBLISHED') {
                <p class="mt-3 text-[12px] text-ink-muted">Każda opublikowana zmiana tworzy nową wersję. Przy zamówieniu zapisujemy, którą wersję regulaminu zaakceptował klient.</p>
              }
            } @else {
              <p class="text-[13px] text-ink-muted">Nowa {{ kind() === 'POST' ? 'treść wpisu' : 'strona' }} — zapisz jako szkic lub od razu opublikuj.</p>
            }
            @if (canWrite) {
              <div class="mt-4 flex flex-col gap-2">
                @if (current()?.status === 'PUBLISHED') {
                  <button sv-button [loading]="saving() === 'PUBLISHED'" (click)="save('PUBLISHED')">Zapisz i opublikuj zmiany</button>
                  <button sv-button variant="secondary" [loading]="saving() === 'DRAFT'" (click)="save('DRAFT')">Wycofaj publikację</button>
                } @else {
                  <button sv-button variant="accent" [loading]="saving() === 'PUBLISHED'" (click)="save('PUBLISHED')">Opublikuj</button>
                  <button sv-button variant="secondary" [loading]="saving() === 'DRAFT'" (click)="save('DRAFT')">Zapisz szkic</button>
                }
              </div>
            }
            @if (current(); as e) {
              <div class="mt-4 flex flex-col gap-2 border-t border-line pt-4">
                @if (e.status === 'PUBLISHED') {
                  <a sv-button variant="ghost" [href]="storeUrl() + e.path" target="_blank" rel="noopener"><svg [lucideIcon]="icons.external" />Zobacz w sklepie</a>
                } @else if (canPreview) {
                  <button sv-button variant="ghost" (click)="preview(e.path)"><svg [lucideIcon]="icons.eye" />Podgląd w sklepie</button>
                }
                @if (canWrite) {<button sv-button variant="ghost" class="!text-danger-ink" (click)="confirmDelete.set(true)"><svg [lucideIcon]="icons.trash" />Usuń</button>}
              </div>
            }
          </sv-card>

          @if (kind() === 'PAGE') {
            <sv-card heading="Wyświetlanie">
              @if (current()?.systemKey) {
                <p class="text-[13px] text-ink-muted">Dokumenty prawne są zawsze w stopce sklepu, a regulamin i polityka prywatności także przy zamówieniu.</p>
              } @else {
                <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="footer" [disabled]="!canWrite" [(ngModel)]="f.showInFooter" />Pokaż link w stopce sklepu</label>
              }
            </sv-card>
          }

          <sv-card heading="Wyszukiwarki (SEO)">
            <div class="grid gap-4">
              <sv-field label="Tytuł strony" for="c-seo-t" [optional]="true" hint="Domyślnie: tytuł."><input id="c-seo-t" name="seoTitle" class="sv-input" maxlength="200" [disabled]="!canWrite" [(ngModel)]="f.seoTitle" /></sv-field>
              <sv-field label="Opis" for="c-seo-d" [optional]="true" hint="Domyślnie: początek treści.">
                <textarea id="c-seo-d" name="seoDescription" class="sv-input !h-24 py-2" maxlength="320" [disabled]="!canWrite" [(ngModel)]="f.seoDescription"></textarea>
              </sv-field>
            </div>
          </sv-card>
        </div>
      </div>
    }

    <sv-dialog heading="Usunąć stronę?" [open]="confirmDelete()" (closed)="confirmDelete.set(false)">
      „{{ f.title }}” zniknie ze sklepu. Tej operacji nie można cofnąć.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="confirmDelete.set(false)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="deleting()" (click)="remove()">Usuń</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class ContentEditPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly admin = inject(StorefrontAdminApi);
  private readonly storesApi = inject(StoresApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly canPreview = this.ctx.can('THEMES_WRITE');
  protected readonly viewTabs: TabOption[] = [{ id: 'edycja', label: 'Edycja' }, { id: 'podglad', label: 'Podgląd tekstu' }, { id: 'sklep', label: 'W sklepie' }];

  /** Route param (absent for a new entry). */
  readonly id = input<string>();
  /** Query param for a new entry. */
  readonly rodzaj = input<string>();

  protected f: Form = { title: '', slug: '', excerpt: '', body: '', showInFooter: false, seoTitle: '', seoDescription: '' };
  protected readonly view = signal<'edycja' | 'podglad' | 'sklep'>('edycja');
  private readonly previewLink = rxResource({
    params: () => (this.view() === 'sklep' ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.admin.previewLink(params),
  });
  protected readonly previewUrl = computed(() => {
    const e = this.current();
    const link = this.previewLink.hasValue() ? this.previewLink.value()?.url : null;
    if (!e || !link) return null;
    const url = new URL(link);
    url.pathname = e.path;
    return url.toString();
  });
  protected readonly saving = signal<ContentStatus | null>(null);
  protected readonly deleting = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly saved = signal<ContentEntry | null>(null);
  /** Bumped on every edit so `placeholders` re-evaluates (the form object is mutated by ngModel). */
  private readonly bodyVersion = signal(0);

  protected readonly entry = rxResource({
    params: () => (this.id() ? { t: this.ctx.tenantId(), id: this.id()! } : undefined),
    stream: ({ params }) => this.api.get(params.t, params.id),
  });
  private readonly config = rxResource({ stream: () => this.storesApi.config() });
  protected readonly current = computed(() => this.saved() ?? (this.entry.hasValue() ? this.entry.value() : null));
  protected readonly kind = computed<ContentKind>(() => this.current()?.kind ?? (this.rodzaj() === 'POST' ? 'POST' : 'PAGE'));
  protected readonly prefix = computed(() => (this.kind() === 'POST' ? '/blog/' : '/strona/'));
  protected readonly heading = computed(() => this.current()?.title ?? (this.kind() === 'POST' ? 'Nowy wpis' : 'Nowa strona'));
  protected readonly placeholders = computed(() => {
    this.bodyVersion();
    this.current();
    return (this.f.body.match(PLACEHOLDER) ?? []).length;
  });
  protected readonly missingItems = computed(() => {
    this.bodyVersion();
    this.current();
    return (this.f.body.match(PLACEHOLDER) ?? []).map((m) => m.replace(/^\[uzupełnij:?\s*/i, '').replace(/\]$/, '').trim() || 'uzupełnij');
  });
  protected readonly confirmTemplate = signal(false);
  protected readonly loadingTemplate = signal(false);

  /** Puts the template (filled with the current data) into the editor; the merchant reviews and saves it. */
  protected async insertTemplate(): Promise<void> {
    const key = this.current()?.systemKey;
    if (!key) return;
    this.loadingTemplate.set(true);
    try {
      this.f.body = (await firstValueFrom(this.api.legalTemplate(this.ctx.tenantId(), key))).body;
      this.bodyVersion.update((v) => v + 1);
      this.confirmTemplate.set(false);
      this.view.set('podglad');
      this.toast.success('Wstawiono wzór — sprawdź treść i zapisz lub opublikuj.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.loadingTemplate.set(false);
    }
  }

  protected readonly storeUrl = computed(() =>
    (this.config.value()?.storefrontUrlTemplate ?? 'https://{host}').replace('{host}', this.ctx.store()?.primaryHostname ?? ''));

  private loadedId: string | null = null;

  constructor() {
    // Copy the loaded entry into the editable form once per entry (later saves keep the user's edits).
    effect(() => {
      const e = this.current();
      if (e && e.id !== this.loadedId) {
        this.loadedId = e.id;
        this.f = { title: e.title, slug: e.slug, excerpt: e.excerpt ?? '', body: e.body, showInFooter: e.showInFooter,
          seoTitle: e.seoTitle ?? '', seoDescription: e.seoDescription ?? '' };
        untracked(() => this.bodyVersion.update((v) => v + 1));
      }
    });
  }

  protected onBodyChange(): void {
    this.bodyVersion.update((v) => v + 1);
  }

  protected async save(status: ContentStatus): Promise<void> {
    this.error.set(null);
    this.saving.set(status);
    const e = this.current();
    const input: ContentInput = {
      kind: this.kind(), title: this.f.title.trim(), slug: this.f.slug.trim() || null, excerpt: this.f.excerpt.trim() || null, body: this.f.body,
      status, showInFooter: this.f.showInFooter, seoTitle: this.f.seoTitle.trim() || null, seoDescription: this.f.seoDescription.trim() || null,
      version: e?.version ?? 0,
    };
    try {
      const result = await firstValueFrom(e ? this.api.update(this.ctx.tenantId(), e.id, input) : this.api.create(this.ctx.tenantId(), input));
      this.saved.set(result);
      this.loadedId = result.id;
      this.f.slug = result.slug;
      this.bodyVersion.update((v) => v + 1);
      this.toast.success(status === 'PUBLISHED' ? 'Opublikowano.' : e?.status === 'PUBLISHED' ? 'Wycofano publikację.' : 'Zapisano szkic.');
      if (!e) await this.router.navigate(['/sklep', this.ctx.tenantId(), 'tresci', result.id], { replaceUrl: true });
    } catch (err) {
      this.error.set(ApiError.from(err).message);
    } finally {
      this.saving.set(null);
    }
  }

  protected async remove(): Promise<void> {
    const e = this.current();
    if (!e) return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.delete(this.ctx.tenantId(), e.id));
      this.toast.success('Usunięto.');
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'tresci'], { queryParams: { zakladka: e.kind === 'POST' ? 'blog' : null } });
    } catch (err) {
      this.confirmDelete.set(false);
      this.error.set(ApiError.from(err).message);
    } finally {
      this.deleting.set(false);
    }
  }

  protected async preview(path: string): Promise<void> {
    const tab = window.open('', '_blank');
    try {
      const link = new URL((await firstValueFrom(this.admin.previewLink(this.ctx.tenantId()))).url);
      link.pathname = path;
      if (tab) {
        tab.opener = null;
        tab.location.href = link.toString();
      } else {
        window.location.assign(link.toString());
      }
    } catch (err) {
      tab?.close();
      this.toast.error(ApiError.from(err).message);
    }
  }
}
