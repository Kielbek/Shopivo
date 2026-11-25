import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AdminApi } from '@shopivo/api-client';
import { AlertComponent, ButtonComponent, DatePipe, EmptyStateComponent, LoadingComponent, PageHeaderComponent } from '@shopivo/shared-ui';

@Component({
  selector: 'sv-admin-audit',
  imports: [PageHeaderComponent, LoadingComponent, AlertComponent, EmptyStateComponent, ButtonComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Dziennik zdarzeń" description="Zdarzenia bezpieczeństwa i administracyjne z całej platformy." />
    <div class="sv-card mt-6 overflow-x-auto">
      @if (logs.isLoading() && !logs.value()) {
        <sv-loading />
      } @else if (logs.error()) {
        <div class="p-4"><sv-alert tone="error">Nie udało się wczytać dziennika.</sv-alert></div>
      } @else if (!logs.value()?.items?.length) {
        <sv-empty-state title="Brak zdarzeń" />
      } @else {
        <table class="sv-table">
          <thead><tr><th scope="col">Data</th><th scope="col">Zdarzenie</th><th scope="col">Aktor</th><th scope="col">Obiekt</th><th scope="col">IP</th><th scope="col">Szczegóły</th></tr></thead>
          <tbody>
            @for (e of logs.value()!.items; track e.id) {
              <tr>
                <td class="whitespace-nowrap text-zinc-600">{{ e.createdAt | svDate }}</td>
                <td class="font-mono text-[12px]">{{ e.action }}</td>
                <td class="text-[12px]">{{ e.actorType }}<br /><span class="font-mono text-zinc-500">{{ e.actorUserId?.slice(0, 8) ?? '' }}</span></td>
                <td class="text-[12px]">{{ e.targetType ?? '—' }}<br /><span class="font-mono text-zinc-500">{{ e.targetId?.slice(0, 8) ?? '' }}</span></td>
                <td class="font-mono text-[12px] text-zinc-500">{{ e.ipAddress ?? '—' }}</td>
                <td class="max-w-[260px] truncate font-mono text-[12px] text-zinc-500" [title]="e.metadata">{{ e.metadata === '{}' ? '' : e.metadata }}</td>
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
export class AdminAuditPage {
  private readonly api = inject(AdminApi);
  protected readonly page = signal(0);
  protected readonly logs = rxResource({
    params: () => this.page(),
    stream: ({ params }) => this.api.auditLogs(params),
  });
}
