import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi } from '@shopivo/api-client';
import { ContentKind, LegalKey, Redirect } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, DatePipe, ButtonComponent, CardComponent, EmptyStateComponent, FieldComponent, LoadingComponent,
  PageHeaderComponent, TabOption, TabsComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

type Tab = 'strony' | 'blog' | 'przekierowania';

/** Pages (with the legal documents checklist), blog posts and redirects. */
@Component({
  selector: 'sv-content-page',
  imports: [FormsModule, RouterLink, DatePipe, NgTemplateOutlet, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent,
    AlertComponent, LoadingComponent, EmptyStateComponent, TabsComponent, FieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Strony i blog" description="Regulamin, polityka prywatności i inne strony informacyjne, wpisy na blogu oraz przekierowania starych adresów.">
      @if (canWrite && tab() !== 'przekierowania') {
        <a sv-button [routerLink]="['nowa']" [queryParams]="{ rodzaj: tab() === 'blog' ? 'POST' : 'PAGE' }">
          <svg [lucideIcon]="icons.plus" />{{ tab() === 'blog' ? 'Nowy wpis' : 'Nowa strona' }}
        </a>
      }
    </sv-page-header>

    <sv-tabs class="mt-6" label="Rodzaj treści" [tabs]="tabs" [active]="tab()" (activeChange)="setTab($any($event))" />

    @if (tab() === 'strony') {
      <div role="tabpanel" id="panel-strony" aria-labelledby="tab-strony">
        <sv-card class="mt-5" heading="Dokumenty prawne" subheading="Regulamin i polityka prywatności są wymagane do publikacji sklepu. Wzory wypełniamy danymi Twojej firmy — przeczytaj je i dostosuj (najlepiej z prawnikiem) przed publikacją.">
          @if (legal.isLoading() && !legal.value()) {
            <sv-loading />
          } @else if (legal.error()) {
            <sv-alert tone="error">Nie udało się wczytać dokumentów.</sv-alert>
          } @else {
            <ul class="divide-y divide-line">
              @for (l of legal.value(); track l.key) {
                <li class="flex flex-wrap items-center gap-3 py-3">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px]"
                    [class]="l.entry?.status === 'PUBLISHED' ? 'bg-success/15 text-success-ink' : l.requiredForPublish ? 'bg-warning/20 text-warning-ink' : 'bg-canvas text-ink-soft'">
                    <svg [lucideIcon]="l.entry?.status === 'PUBLISHED' ? icons.check : icons.pages" [size]="16" />
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-ink">{{ l.title }}
                      @if (l.requiredForPublish) {<span class="ml-1 text-[12px] font-normal text-ink-muted">· wymagany</span>}</p>
                    <p class="text-[12px] text-ink-muted">
                      @if (!l.entry) {Nie utworzono} @else if (l.entry.status === 'PUBLISHED') {Opublikowany · {{ l.entry.path }}} @else {Szkic — nie jest widoczny w sklepie}
                    </p>
                  </div>
                  @if (l.entry) {
                    <a sv-button variant="secondary" size="sm" [routerLink]="[l.entry.id]">Edytuj</a>
                  } @else if (canWrite) {
                    <button sv-button variant="secondary" size="sm" [loading]="creating() === l.key" (click)="createLegal(l.key)">Utwórz ze wzoru</button>
                  }
                </li>
              }
            </ul>
          }
        </sv-card>
        <sv-card class="mt-5" [flush]="true" heading="Wszystkie strony">
          <ng-container *ngTemplateOutlet="list" />
        </sv-card>
      </div>
    } @else if (tab() === 'blog') {
      <div role="tabpanel" id="panel-blog" aria-labelledby="tab-blog">
        <sv-card class="mt-5" [flush]="true"><ng-container *ngTemplateOutlet="list" /></sv-card>
      </div>
    } @else {
      <div role="tabpanel" id="panel-przekierowania" aria-labelledby="tab-przekierowania">
        <sv-card class="mt-5" heading="Przekierowania 301" subheading="Gdy klient lub wyszukiwarka wejdzie na nieistniejący adres, zostanie przeniesiony pod nowy. Zmiana adresu produktu, kategorii, strony lub wpisu dodaje przekierowanie automatycznie.">
          @if (canSeo) {
            <form class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" (ngSubmit)="addRedirect()">
              <sv-field label="Stary adres" for="r-from"><input id="r-from" name="from" class="sv-input" placeholder="/stary-sklep/kubki" maxlength="300" [(ngModel)]="from" /></sv-field>
              <sv-field label="Nowy adres" for="r-to"><input id="r-to" name="to" class="sv-input" placeholder="/kategoria/kubki" maxlength="300" [(ngModel)]="to" /></sv-field>
              <button sv-button type="submit" [loading]="addingRedirect()">Dodaj</button>
            </form>
            @if (redirectError(); as e) {<sv-alert tone="error" class="mt-3">{{ e }}</sv-alert>}
          }
          @if (redirects.isLoading() && !redirects.value()) {
            <sv-loading />
          } @else if (redirects.error()) {
            <sv-alert tone="error" class="mt-4">Nie udało się wczytać przekierowań.</sv-alert>
          } @else if (!redirects.value()?.length) {
            <p class="mt-5 text-[13px] text-ink-muted">Brak przekierowań.</p>
          } @else {
            <ul class="mt-5 divide-y divide-line">
              @for (r of redirects.value(); track r.id) {
                <li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                  <code class="min-w-0 break-all text-ink">{{ r.fromPath }}</code>
                  <svg [lucideIcon]="icons.arrowRight" [size]="14" class="shrink-0 text-ink-soft" />
                  <code class="min-w-0 flex-1 break-all text-ink">{{ r.toPath }}</code>
                  @if (r.automatic) {<sv-badge>Automatyczne</sv-badge>}
                  @if (canSeo) {<button sv-button variant="ghost" size="icon" [attr.aria-label]="'Usuń przekierowanie z ' + r.fromPath" (click)="removeRedirect(r)"><svg [lucideIcon]="icons.trash" /></button>}
                </li>
              }
            </ul>
          }
        </sv-card>
      </div>
    }

    <ng-template #list>
      <div class="border-b border-line px-5 py-3">
        <label class="sr-only" for="c-q">Szukaj</label>
        <input id="c-q" type="search" class="sv-input max-w-xs" [placeholder]="tab() === 'blog' ? 'Szukaj wpisów…' : 'Szukaj stron…'" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </div>
      @if (entries.isLoading() && !entries.value()) {
        <sv-loading />
      } @else if (entries.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać listy.</sv-alert></div>
      } @else if (!entries.value()?.items?.length) {
        <sv-empty-state [icon]="'pages'" [title]="query() ? 'Brak wyników' : tab() === 'blog' ? 'Brak wpisów' : 'Brak stron'"
          [description]="tab() === 'blog' ? 'Wpisy na blogu pomagają klientom i wyszukiwarkom — opisz nowości, porady, kulisy pracy.' : 'Dodaj np. stronę „O nas” lub „Kontakt”.'" />
      } @else {
        <ul>
          @for (e of entries.value()!.items; track e.id) {
            <li class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
              <div class="min-w-0 flex-1">
                <a [routerLink]="[e.id]" class="font-medium text-ink hover:underline">{{ e.title }}</a>
                <p class="truncate text-[12px] text-ink-muted">{{ e.path }} · zmieniono {{ e.updatedAt | svDate }}</p>
              </div>
              @if (e.systemKey) {<sv-badge tone="info">Dokument prawny</sv-badge>}
              @if (e.showInFooter && !e.systemKey) {<sv-badge>W stopce</sv-badge>}
              <sv-badge [tone]="e.status === 'PUBLISHED' ? 'success' : 'neutral'">{{ e.status === 'PUBLISHED' ? 'Opublikowana' : 'Szkic' }}</sv-badge>
            </li>
          }
        </ul>
      }
    </ng-template>
  `,
})
export class ContentPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly canSeo = this.ctx.can('SEO_WRITE');
  protected readonly tabs: TabOption[] = [{ id: 'strony', label: 'Strony' }, { id: 'blog', label: 'Blog' }, { id: 'przekierowania', label: 'Przekierowania' }];

  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('zakladka') as Tab) || 'strony');
  protected readonly query = signal('');
  protected readonly creating = signal<LegalKey | null>(null);
  protected from = '';
  protected to = '';
  protected readonly addingRedirect = signal(false);
  protected readonly redirectError = signal<string | null>(null);

  private readonly kind = computed<ContentKind | null>(() => (this.tab() === 'blog' ? 'POST' : this.tab() === 'strony' ? 'PAGE' : null));
  protected readonly entries = rxResource({
    params: () => (this.kind() ? { t: this.ctx.tenantId(), kind: this.kind()!, q: this.query().trim() } : undefined),
    stream: ({ params }) => this.api.list(params.t, params.kind, params.q, 0),
  });
  protected readonly legal = rxResource({
    params: () => (this.tab() === 'strony' ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.legal(params),
  });
  protected readonly redirects = rxResource({
    params: () => (this.tab() === 'przekierowania' ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.redirects(params),
  });

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.query.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { zakladka: tab === 'strony' ? null : tab }, replaceUrl: true });
  }

  protected async createLegal(key: LegalKey): Promise<void> {
    this.creating.set(key);
    try {
      const entry = await firstValueFrom(this.api.createLegal(this.ctx.tenantId(), key));
      await this.router.navigate([entry.id], { relativeTo: this.route });
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.creating.set(null);
    }
  }

  protected async addRedirect(): Promise<void> {
    this.redirectError.set(null);
    this.addingRedirect.set(true);
    try {
      await firstValueFrom(this.api.addRedirect(this.ctx.tenantId(), this.from, this.to));
      this.from = '';
      this.to = '';
      this.toast.success('Dodano przekierowanie.');
      this.redirects.reload();
    } catch (e) {
      this.redirectError.set(ApiError.from(e).message);
    } finally {
      this.addingRedirect.set(false);
    }
  }

  protected async removeRedirect(r: Redirect): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteRedirect(this.ctx.tenantId(), r.id));
      this.toast.success('Usunięto przekierowanie.');
      this.redirects.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

}
