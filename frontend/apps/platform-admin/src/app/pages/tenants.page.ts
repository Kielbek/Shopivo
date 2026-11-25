import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AdminApi, ApiError, SessionStore } from '@shopivo/api-client';
import { AdminTenantRow, TenantStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, DialogComponent, EmptyStateComponent, LoadingComponent,
  PageHeaderComponent,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'sv-admin-tenants',
  imports: [FormsModule, PageHeaderComponent, LoadingComponent, AlertComponent, BadgeComponent, ButtonComponent, DatePipe,
    DialogComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Sklepy" />
    <form class="mt-6 flex flex-wrap gap-2" (ngSubmit)="search()">
      <label for="q" class="sr-only">Szukaj</label>
      <input id="q" name="q" type="search" class="sv-input max-w-xs bg-card" placeholder="Nazwa sklepu" [(ngModel)]="queryDraft" />
      <label for="status" class="sr-only">Status</label>
      <select id="status" name="status" class="sv-input w-auto" [ngModel]="status() ?? ''" (ngModelChange)="status.set($event || null); page.set(0)">
        <option value="">Wszystkie statusy</option>
        <option value="ACTIVE">Aktywne</option>
        <option value="SUSPENDED">Zawieszone</option>
      </select>
      <button sv-button variant="secondary" type="submit">Szukaj</button>
    </form>
    @if (message(); as m) {<sv-alert [tone]="m.tone" class="mt-4">{{ m.text }}</sv-alert>}
    <div class="sv-card mt-4 overflow-hidden">
      @if (rows.isLoading() && !rows.value()) {
        <sv-loading />
      } @else if (rows.error()) {
        <div class="p-4"><sv-alert tone="error">Nie udało się wczytać listy sklepów.</sv-alert></div>
      } @else if (!rows.value()?.items?.length) {
        <sv-empty-state title="Brak sklepów spełniających kryteria" />
      } @else {
        <div class="overflow-x-auto px-3 pt-3 sm:px-5"><table class="sv-table min-w-[720px]">
          <thead><tr><th scope="col">Sklep</th><th scope="col">Właściciel</th><th scope="col">Status</th><th scope="col">Utworzono</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
          <tbody>
            @for (row of rows.value()!.items; track row.tenant.id) {
              <tr>
                <td>
                  <p class="font-medium">{{ row.tenant.name }}</p>
                  <p class="text-ink-muted">{{ row.store?.primaryHostname ?? '—' }}</p>
                </td>
                <td>{{ row.owner?.email ?? '—' }}</td>
                <td>
                  @if (row.tenant.status === 'ACTIVE') {<sv-badge tone="success">Aktywny</sv-badge>}
                  @else if (row.tenant.status === 'SUSPENDED') {
                    <sv-badge tone="danger">Zawieszony</sv-badge>
                    <p class="mt-1 max-w-[220px] truncate text-[12px] text-ink-muted" [title]="row.tenant.suspendedReason ?? ''">{{ row.tenant.suspendedReason }}</p>
                  } @else {<sv-badge>Zamknięty</sv-badge>}
                </td>
                <td class="whitespace-nowrap text-ink-soft">{{ row.tenant.createdAt | svDate: 'date' }}</td>
                <td class="text-right">
                  @if (session.isPlatformAdmin()) {
                    @if (row.tenant.status === 'ACTIVE') {
                      <button sv-button variant="ghost" size="sm" (click)="toSuspend.set(row)">Zawieś</button>
                    } @else if (row.tenant.status === 'SUSPENDED') {
                      <button sv-button variant="ghost" size="sm" (click)="reactivate(row)">Przywróć</button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>
        <div class="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ rows.value()!.totalItems }} sklepów</span>
          <div class="flex gap-2">
            <button sv-button variant="secondary" size="sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button variant="secondary" size="sm" [disabled]="page() + 1 >= rows.value()!.totalPages" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </div>

    <sv-dialog heading="Zawiesić sklep?" [open]="!!toSuspend()" (closed)="toSuspend.set(null)">
      Zespół sklepu „{{ toSuspend()?.tenant?.name }}” straci dostęp do panelu. Podaj powód — zostanie zapisany w dzienniku.
      <label for="reason" class="sv-label mt-4">Powód</label>
      <textarea id="reason" class="sv-input mt-1.5" rows="3" maxlength="500" [(ngModel)]="reason"></textarea>
      <ng-container dialog-actions>
        <button sv-button variant="secondary" (click)="toSuspend.set(null)">Anuluj</button>
        <button sv-button variant="danger" [disabled]="!reason.trim()" [loading]="busy()" (click)="suspend()">Zawieś sklep</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class TenantsPage {
  private readonly api = inject(AdminApi);
  protected readonly session = inject(SessionStore);
  protected queryDraft = '';
  protected reason = '';
  protected readonly query = signal('');
  protected readonly status = signal<TenantStatus | null>(null);
  protected readonly page = signal(0);
  protected readonly busy = signal(false);
  protected readonly toSuspend = signal<AdminTenantRow | null>(null);
  protected readonly message = signal<{ tone: 'success' | 'error'; text: string } | null>(null);

  protected readonly rows = rxResource({
    params: () => ({ q: this.query(), status: this.status(), page: this.page() }),
    stream: ({ params }) => this.api.tenants(params.q, params.status, params.page),
  });

  protected search(): void {
    this.page.set(0);
    this.query.set(this.queryDraft);
  }

  async suspend(): Promise<void> {
    const row = this.toSuspend();
    if (!row) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.suspendTenant(row.tenant.id, this.reason.trim()));
      this.message.set({ tone: 'success', text: `Zawieszono sklep „${row.tenant.name}”.` });
      this.toSuspend.set(null);
      this.reason = '';
      this.rows.reload();
    } catch (e) {
      this.message.set({ tone: 'error', text: ApiError.from(e).message });
    } finally {
      this.busy.set(false);
    }
  }

  async reactivate(row: AdminTenantRow): Promise<void> {
    try {
      await firstValueFrom(this.api.reactivateTenant(row.tenant.id));
      this.message.set({ tone: 'success', text: `Przywrócono sklep „${row.tenant.name}”.` });
      this.rows.reload();
    } catch (e) {
      this.message.set({ tone: 'error', text: ApiError.from(e).message });
    }
  }
}
