import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, NewsletterApi } from '@shopivo/api-client';
import { NewsletterStatus, NewsletterSubscriber } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent, InfoTipComponent,
  LoadingComponent, PageHeaderComponent, ToastService, downloadBlob, icons, plural,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const STATUS: Record<NewsletterStatus, { label: string; tone: 'success' | 'info' | 'neutral' }> = {
  CONFIRMED: { label: 'Potwierdzony', tone: 'success' },
  PENDING: { label: 'Czeka na potwierdzenie', tone: 'info' },
  UNSUBSCRIBED: { label: 'Wypisany', tone: 'neutral' },
};

/**
 * Newsletter subscribers collected by the storefront form (double opt-in). Only confirmed addresses may receive
 * marketing mail, so only they are exported.
 */
@Component({
  selector: 'sv-newsletter-page',
  imports: [FormsModule, RouterLink, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    LoadingComponent, EmptyStateComponent, DialogComponent, InfoTipComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Newsletter" description="Adresy zapisane przez formularz w sklepie. Zapis wymaga potwierdzenia linkiem z e-maila (double opt-in).">
      @if (canExport) {
        <button sv-button variant="secondary" [disabled]="!(counts()['CONFIRMED'] ?? 0)" (click)="export()"><svg [lucideIcon]="icons.download" />Eksport potwierdzonych (CSV)</button>
      }
    </sv-page-header>

    <div class="mt-6 grid gap-3 sm:grid-cols-3">
      @for (s of tiles; track s.status) {
        <button type="button" class="sv-card p-4 text-left transition-colors hover:border-line-strong" [class.ring-2]="status() === s.status" [class.ring-primary]="status() === s.status"
          [attr.aria-pressed]="status() === s.status" (click)="filter(status() === s.status ? null : s.status)">
          <p class="text-[12px] text-ink-muted">{{ s.label }}</p>
          @if (summary.isLoading() && !summary.value()) {<span class="sv-shimmer mt-1 block h-7 w-12 rounded"></span>}
          @else {<p class="mt-0.5 text-[24px] font-semibold tabular-nums text-ink">{{ counts()[s.status] ?? 0 }}</p>}
        </button>
      }
    </div>

    <sv-card class="mt-4" [flush]="true">
      <div class="flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-center">
        <div class="relative sm:w-80">
          <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input class="sv-input pl-9" type="search" placeholder="Szukaj adresu e-mail…" aria-label="Szukaj subskrybentów"
            [ngModel]="query()" (ngModelChange)="query.set($event); page.set(0)" />
        </div>
        @if (status(); as st) {
          <button type="button" class="inline-flex items-center gap-1 text-[13px] text-ink-soft hover:text-ink" (click)="filter(null)">
            <svg [lucideIcon]="icons.close" [size]="14" />Filtr: {{ labels[st].label }}</button>
        }
      </div>
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading variant="table" [rows]="6" />
      } @else if (rows.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać listy.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        @if (query() || status()) {
          <sv-empty-state icon="mail" title="Brak wyników" description="Zmień filtry." />
        } @else {
          <sv-empty-state icon="mail" illustration="newsletter" title="Nikt jeszcze się nie zapisał"
            description="Formularz newslettera pokazuje się w stopce sklepu i w sekcji „Newsletter” na stronie głównej.">
            <a sv-button variant="secondary" class="mt-4" [routerLink]="['/sklep', ctx.tenantId(), 'edytor-wygladu']">Ustaw w edytorze wyglądu</a>
          </sv-empty-state>
        }
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[640px]">
            <thead><tr><th scope="col">E-mail</th><th scope="col">Status</th><th scope="col">Zapisany</th>
              <th scope="col">Potwierdzenie <sv-info-tip text="Data kliknięcia linku w e-mailu potwierdzającym. Zapisujemy ją wraz z treścią zgody — to dowód zgody na wysyłkę (RODO)." /></th>
              @if (canWrite) {<th scope="col"><span class="sr-only">Akcje</span></th>}</tr></thead>
            <tbody>
              @for (s of rows.value()!.items; track s.id) {
                <tr>
                  <td class="break-all font-medium text-ink">{{ s.email }}</td>
                  <td><sv-badge [tone]="labels[s.status].tone">{{ labels[s.status].label }}</sv-badge></td>
                  <td class="whitespace-nowrap text-ink-muted">{{ s.createdAt | svDate: 'date' }}</td>
                  <td class="whitespace-nowrap text-ink-muted">{{ s.status === 'UNSUBSCRIBED' ? 'wypisany ' + (s.unsubscribedAt | svDate: 'date') : s.confirmedAt ? (s.confirmedAt | svDate: 'date') : '—' }}</td>
                  @if (canWrite) {
                    <td class="text-right"><button sv-button variant="ghost" size="icon" [attr.aria-label]="'Usuń ' + s.email" (click)="toDelete.set(s)"><svg [lucideIcon]="icons.trash" /></button></td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ total() }}</span>
          <div class="flex gap-2">
            <button sv-button size="sm" variant="secondary" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button size="sm" variant="secondary" [disabled]="page() + 1 >= (rows.value()?.totalPages ?? 1)" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </sv-card>

    <sv-dialog heading="Usunąć adres z listy?" [open]="!!toDelete()" (closed)="toDelete.set(null)">
      Adres {{ toDelete()?.email }} zostanie trwale usunięty razem z zapisem zgody. Użyj tego np. na żądanie usunięcia danych — aby
      ktoś po prostu przestał dostawać newsletter, wystarczy link „wypisz się” w wiadomości.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="toDelete.set(null)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="deleting()" (click)="remove()">Usuń</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class NewsletterPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(NewsletterApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly labels = STATUS;
  protected readonly canWrite = this.ctx.can('CUSTOMERS_WRITE');
  protected readonly canExport = this.ctx.can('MARKETING_WRITE');
  protected readonly tiles = (['CONFIRMED', 'PENDING', 'UNSUBSCRIBED'] as NewsletterStatus[]).map((status) => ({ status, label: STATUS[status].label }));

  protected readonly query = signal('');
  protected readonly status = signal<NewsletterStatus | null>(null);
  protected readonly page = signal(0);
  protected readonly toDelete = signal<NewsletterSubscriber | null>(null);
  protected readonly deleting = signal(false);

  protected readonly summary = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.summary(params) });
  protected readonly counts = computed(() => this.summary.value()?.counts ?? {});
  protected readonly rows = rxResource({
    params: () => ({ t: this.ctx.tenantId(), s: this.status(), q: this.query(), p: this.page() }),
    stream: ({ params }) => this.api.list(params.t, params.s, params.q, params.p),
  });
  protected readonly total = computed(() => plural(this.rows.value()?.totalItems ?? 0, 'adres', 'adresy', 'adresów'));

  protected filter(s: NewsletterStatus | null): void {
    this.status.set(s);
    this.page.set(0);
  }

  protected async export(): Promise<void> {
    try {
      downloadBlob(await firstValueFrom(this.api.exportCsv(this.ctx.tenantId())), `newsletter-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async remove(): Promise<void> {
    const s = this.toDelete();
    if (!s) return;
    this.deleting.set(true);
    try {
      await firstValueFrom(this.api.delete(this.ctx.tenantId(), s.id));
      this.toast.success('Usunięto adres.');
      this.rows.reload();
      this.summary.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.deleting.set(false);
      this.toDelete.set(null);
    }
  }
}
