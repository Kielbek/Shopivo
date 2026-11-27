import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ApiError, StoresApi } from '@shopivo/api-client';
import { STORE_ROLE_LABELS } from '@shopivo/shared-models';
import { LucideDynamicIcon } from '@lucide/angular';
import { AlertComponent, BadgeComponent, ButtonComponent, EmptyStateComponent, LoadingComponent, icons } from '@shopivo/shared-ui';
import { TopBar } from './top-bar';

@Component({
  selector: 'sv-store-picker-page',
  imports: [RouterLink, LucideDynamicIcon, TopBar, AlertComponent, BadgeComponent, ButtonComponent, EmptyStateComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-top-bar />
    <main class="mx-auto max-w-[880px] px-4 py-10 sm:px-6">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h1 class="text-[24px] font-semibold tracking-[-0.02em]">Moje sklepy</h1>
          <p class="mt-1 text-[13px] text-ink-soft">Sklepy, w których jesteś właścicielem lub członkiem zespołu.</p>
        </div>
        <a sv-button routerLink="/nowy-sklep"><svg [lucideIcon]="icons.plus" />Nowy sklep</a>
      </div>
      <div class="sv-card mt-6">
        @if (stores.isLoading()) {
          <sv-loading />
        } @else if (stores.error()) {
          <div class="p-4"><sv-alert tone="error">{{ errorMessage() }}</sv-alert></div>
        } @else if (!stores.value()?.length) {
          <sv-empty-state icon="store" illustration="store" title="Nie masz jeszcze sklepu" description="Utwórz pierwszy sklep — zajmie to mniej niż minutę.">
            <a sv-button routerLink="/nowy-sklep">Utwórz sklep</a>
          </sv-empty-state>
        } @else {
          <ul class="divide-y divide-line">
            @for (store of stores.value(); track store.tenantId) {
              <li>
                @if (store.tenantStatus === 'ACTIVE') {
                  <a [routerLink]="['/sklep', store.tenantId]" class="flex items-center justify-between gap-4 px-5 py-4 hover:bg-hover">
                    <div class="flex min-w-0 items-center gap-3">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary-strong">
                        <svg [lucideIcon]="icons.store" [size]="18" />
                      </span>
                      <div class="min-w-0">
                      <p class="truncate font-medium text-ink">{{ store.name }}</p>
                      <p class="truncate text-[13px] text-ink-muted">{{ store.primaryHostname }}</p>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <sv-badge tone="info">{{ roleLabels[store.role] }}</sv-badge>
                      @if (store.status === 'DRAFT') {<sv-badge tone="warning">Szkic</sv-badge>}
                    </div>
                  </a>
                } @else {
                  <div class="flex items-center justify-between gap-4 px-5 py-4 opacity-70">
                    <div class="min-w-0">
                      <p class="truncate font-medium">{{ store.name }}</p>
                      <p class="truncate text-[13px] text-ink-muted">{{ store.primaryHostname }}</p>
                    </div>
                    <sv-badge tone="danger">Zawieszony</sv-badge>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </div>
    </main>
  `,
})
export class StorePickerPage {
  private readonly api = inject(StoresApi);
  protected readonly roleLabels = STORE_ROLE_LABELS;
  protected readonly icons = icons;
  protected readonly stores = rxResource({ stream: () => this.api.myStores() });

  protected errorMessage(): string {
    return ApiError.from(this.stores.error()).message;
  }
}
