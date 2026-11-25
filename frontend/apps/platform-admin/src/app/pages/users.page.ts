import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AdminApi, ApiError, SessionStore } from '@shopivo/api-client';
import { UserView } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, EmptyStateComponent, LoadingComponent, PageHeaderComponent,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'sv-admin-users',
  imports: [FormsModule, PageHeaderComponent, LoadingComponent, AlertComponent, BadgeComponent, ButtonComponent, DatePipe,
    EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Użytkownicy" description="Konta sprzedawców i administratorów platformy." />
    <form class="mt-6 flex gap-2" (ngSubmit)="page.set(0); query.set(queryDraft)">
      <label for="q" class="sr-only">Szukaj</label>
      <input id="q" name="q" type="search" class="sv-input max-w-xs bg-card" placeholder="E-mail lub nazwisko" [(ngModel)]="queryDraft" />
      <button sv-button variant="secondary" type="submit">Szukaj</button>
    </form>
    @if (message(); as m) {<sv-alert [tone]="m.tone" class="mt-4">{{ m.text }}</sv-alert>}
    <div class="sv-card mt-4 overflow-hidden">
      @if (users.isLoading() && !users.value()) {
        <sv-loading />
      } @else if (users.error()) {
        <div class="p-4"><sv-alert tone="error">Nie udało się wczytać użytkowników.</sv-alert></div>
      } @else if (!users.value()?.items?.length) {
        <sv-empty-state title="Brak użytkowników spełniających kryteria" />
      } @else {
        <div class="overflow-x-auto px-3 pt-3 sm:px-5"><table class="sv-table min-w-[720px]">
          <thead><tr><th scope="col">Użytkownik</th><th scope="col">Status</th><th scope="col">MFA</th><th scope="col">Ostatnie logowanie</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
          <tbody>
            @for (u of users.value()!.items; track u.id) {
              <tr>
                <td>
                  <p class="font-medium">{{ u.firstName }} {{ u.lastName }}
                    @if (u.platformRole) {<sv-badge tone="brand" class="ml-1">{{ u.platformRole === 'PLATFORM_ADMIN' ? 'Administrator' : 'Wsparcie' }}</sv-badge>}
                  </p>
                  <p class="text-ink-muted">{{ u.email }}</p>
                </td>
                <td>
                  @switch (u.status) {
                    @case ('ACTIVE') {<sv-badge tone="success">Aktywny</sv-badge>}
                    @case ('PENDING_VERIFICATION') {<sv-badge tone="warning">Niepotwierdzony</sv-badge>}
                    @case ('SUSPENDED') {<sv-badge tone="danger">Zablokowany</sv-badge>}
                    @default {<sv-badge>Usunięty</sv-badge>}
                  }
                </td>
                <td>{{ u.mfaEnabled ? 'Tak' : 'Nie' }}</td>
                <td class="whitespace-nowrap text-ink-soft">{{ u.lastLoginAt | svDate }}</td>
                <td class="text-right">
                  @if (session.isPlatformAdmin() && !u.platformRole) {
                    @if (u.status === 'SUSPENDED') {
                      <button sv-button variant="ghost" size="sm" (click)="reactivate(u)">Odblokuj</button>
                    } @else if (u.status !== 'DELETED') {
                      <button sv-button variant="ghost" size="sm" (click)="suspend(u)">Zablokuj</button>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        </div>
        <div class="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-muted">
          <span>{{ users.value()!.totalItems }} użytkowników</span>
          <div class="flex gap-2">
            <button sv-button variant="secondary" size="sm" [disabled]="page() === 0" (click)="page.set(page() - 1)">Poprzednia</button>
            <button sv-button variant="secondary" size="sm" [disabled]="page() + 1 >= users.value()!.totalPages" (click)="page.set(page() + 1)">Następna</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class UsersPage {
  private readonly api = inject(AdminApi);
  protected readonly session = inject(SessionStore);
  protected queryDraft = '';
  protected readonly query = signal('');
  protected readonly page = signal(0);
  protected readonly message = signal<{ tone: 'success' | 'error'; text: string } | null>(null);
  protected readonly users = rxResource({
    params: () => ({ q: this.query(), page: this.page() }),
    stream: ({ params }) => this.api.users(params.q, params.page),
  });

  async suspend(u: UserView): Promise<void> {
    if (!confirm(`Zablokować konto ${u.email}? Wszystkie sesje zostaną natychmiast wylogowane.`)) return;
    await this.run(() => firstValueFrom(this.api.suspendUser(u.id)), `Zablokowano konto ${u.email}.`);
  }

  async reactivate(u: UserView): Promise<void> {
    await this.run(() => firstValueFrom(this.api.reactivateUser(u.id)), `Odblokowano konto ${u.email}.`);
  }

  private async run(action: () => Promise<unknown>, success: string): Promise<void> {
    try {
      await action();
      this.message.set({ tone: 'success', text: success });
      this.users.reload();
    } catch (e) {
      this.message.set({ tone: 'error', text: ApiError.from(e).message });
    }
  }
}
