import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { TenantApi } from '@shopivo/api-client';
import { LucideDynamicIcon } from '@lucide/angular';
import { AlertComponent, ButtonComponent, CardComponent, DatePipe, EmptyStateComponent, LoadingComponent, PageHeaderComponent, icons } from '@shopivo/shared-ui';
import { StoreContext } from './store-context';
import { auditActionLabel } from '../../shared/audit-labels';

@Component({
  selector: 'sv-audit-page',
  imports: [LucideDynamicIcon, PageHeaderComponent, LoadingComponent, AlertComponent, EmptyStateComponent, ButtonComponent, DatePipe, CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Dziennik zdarzeń" description="Historia istotnych zmian w sklepie: kto, co i kiedy zrobił." />
    <sv-card class="mt-6" heading="Ostatnie zdarzenia" [flush]="true">
      @if (logs.isLoading() && !logs.value()) {
        <sv-loading />
      } @else if (logs.error()) {
        <div class="px-5 pb-5"><sv-alert tone="error">Nie udało się wczytać dziennika.</sv-alert></div>
      } @else if (!logs.value()?.items?.length) {
        <sv-empty-state icon="audit" title="Brak zdarzeń" />
      } @else {
        <div class="overflow-x-auto px-5">
          <table class="sv-table min-w-[560px]">
            <thead><tr><th scope="col">Zdarzenie</th><th scope="col">Data</th><th scope="col">Adres IP</th></tr></thead>
            <tbody>
              @for (entry of logs.value()!.items; track entry.id) {
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-strong">
                        <svg [lucideIcon]="icons.audit" [size]="15" />
                      </span>
                      <span class="font-medium text-ink">{{ label(entry.action) }}</span>
                    </div>
                  </td>
                  <td class="whitespace-nowrap text-ink-soft">{{ entry.createdAt | svDate }}</td>
                  <td class="font-mono text-[12px] text-ink-muted">{{ entry.ipAddress ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>Strona {{ page() + 1 }} z {{ logs.value()!.totalPages || 1 }}</span>
          <div class="flex gap-2">
            <button sv-button variant="secondary" size="sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">
              <svg [lucideIcon]="icons.chevronLeft" />Poprzednia</button>
            <button sv-button variant="secondary" size="sm" [disabled]="page() + 1 >= logs.value()!.totalPages" (click)="page.set(page() + 1)">
              Następna<svg [lucideIcon]="icons.chevronRight" /></button>
          </div>
        </div>
      }
    </sv-card>
  `,
})
export class AuditPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  protected readonly page = signal(0);
  protected readonly icons = icons;
  protected readonly label = auditActionLabel;
  protected readonly logs = rxResource({
    params: () => ({ tenantId: this.ctx.tenantId(), page: this.page() }),
    stream: ({ params }) => this.api.auditLogs(params.tenantId, params.page),
  });
}
