import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TenantApi } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, DatePipe, EmptyStateComponent, LoadingComponent, PageHeaderComponent } from '@shopivo/shared-ui';
import { StoreContext } from './store-context';
import { auditActionLabel } from '../../shared/audit-labels';

@Component({
  selector: 'sv-audit-page',
  imports: [PageHeaderComponent, LoadingComponent, AlertComponent, EmptyStateComponent, ButtonComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Dziennik zdarzeń" description="Historia istotnych zmian w sklepie: kto, co i kiedy zrobił." />
    <div class="sv-card mt-6 overflow-x-auto">
      @if (logs.isLoading() && !logs.value()) {
        <sv-loading />
      } @else if (logs.error()) {
        <div class="p-4"><sv-alert tone="error">Nie udało się wczytać dziennika.</sv-alert></div>
      } @else if (!logs.value()?.items?.length) {
        <sv-empty-state title="Brak zdarzeń" />
      } @else {
        <table class="sv-table">
          <thead><tr><th scope="col">Data</th><th scope="col">Zdarzenie</th><th scope="col">Adres IP</th></tr></thead>
          <tbody>
            @for (entry of logs.value()!.items; track entry.id) {
              <tr>
                <td class="whitespace-nowrap text-zinc-600">{{ entry.createdAt | svDate }}</td>
                <td>{{ label(entry.action) }}</td>
                <td class="font-mono text-[12px] text-zinc-500">{{ entry.ipAddress ?? '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
        <div class="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-[13px] text-zinc-600">
          <span>Strona {{ page() + 1 }} z {{ logs.value()!.totalPages || 1 }}</span>
          <div class="flex gap-2">
            <button sv-button variant="secondary" size="sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button variant="secondary" size="sm" [disabled]="page() + 1 >= logs.value()!.totalPages" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AuditPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  protected readonly page = signal(0);
  protected readonly label = auditActionLabel;
  protected readonly logs = rxResource({
    params: () => ({ tenantId: this.ctx.tenantId(), page: this.page() }),
    stream: ({ params }) => this.api.auditLogs(params.tenantId, params.page),
  });
}
