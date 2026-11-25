import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SessionStore, TenantApi } from '@shopivo/api-client';
import { BadgeComponent, DatePipe, PageHeaderComponent } from '@shopivo/shared-ui';
import { of } from 'rxjs';
import { StoreContext } from './store-context';

interface ChecklistItem {
  label: string;
  description: string;
  done: boolean;
  link: string;
  action: string;
}

@Component({
  selector: 'sv-overview-page',
  imports: [RouterLink, PageHeaderComponent, BadgeComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.store(); as store) {
      <sv-page-header [title]="store.name" description="Podsumowanie konfiguracji sklepu." />

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <div class="sv-card p-4">
          <p class="text-[12px] font-medium uppercase tracking-wide text-zinc-500">Status</p>
          <div class="mt-2">
            @switch (store.status) {
              @case ('DRAFT') {<sv-badge tone="warning">Szkic — niepublikowany</sv-badge>}
              @case ('PUBLISHED') {<sv-badge tone="success">Opublikowany</sv-badge>}
              @case ('SUSPENDED') {<sv-badge tone="danger">Zawieszony</sv-badge>}
            }
          </div>
        </div>
        <div class="sv-card p-4">
          <p class="text-[12px] font-medium uppercase tracking-wide text-zinc-500">Adres sklepu</p>
          <p class="mt-2 truncate font-medium">{{ store.primaryHostname }}</p>
        </div>
        <div class="sv-card p-4">
          <p class="text-[12px] font-medium uppercase tracking-wide text-zinc-500">Utworzono</p>
          <p class="mt-2 font-medium">{{ store.createdAt | svDate: 'date' }}</p>
        </div>
      </div>

      <section class="sv-card mt-6">
        <div class="border-b border-zinc-100 px-5 py-4">
          <h2 class="text-[15px] font-semibold">Pierwsze kroki</h2>
          <p class="mt-0.5 text-[13px] text-zinc-600">{{ doneCount() }} z {{ checklist().length }} ukończone</p>
        </div>
        <ul class="divide-y divide-zinc-100">
          @for (item of checklist(); track item.label) {
            <li class="flex items-start gap-4 px-5 py-4">
              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border"
                [class]="item.done ? 'border-brand-600 bg-brand-600 text-white' : 'border-zinc-300'" aria-hidden="true">
                @if (item.done) {<svg viewBox="0 0 16 16" class="size-3" fill="currentColor"><path d="M6.2 11.4 2.8 8l1-1 2.4 2.3 6-6 1 1z"/></svg>}
              </span>
              <div class="min-w-0 flex-1">
                <p class="font-medium" [class.text-zinc-500]="item.done">{{ item.label }}<span class="sr-only">{{ item.done ? ' (ukończone)' : '' }}</span></p>
                <p class="text-[13px] text-zinc-600">{{ item.description }}</p>
              </div>
              @if (!item.done) {<a [routerLink]="item.link" class="sv-link shrink-0 text-[13px]">{{ item.action }}</a>}
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class OverviewPage {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  private readonly session = inject(SessionStore);

  private readonly settings = rxResource({
    params: () => this.ctx.tenantId(),
    stream: ({ params }) => this.api.settings(params),
  });
  private readonly members = rxResource({
    params: () => (this.ctx.can('TEAM_READ') ? this.ctx.tenantId() : null),
    stream: ({ params }) => (params ? this.api.members(params) : of(null)),
  });
  private readonly invitations = rxResource({
    params: () => (this.ctx.can('TEAM_MANAGE') ? this.ctx.tenantId() : null),
    stream: ({ params }) => (params ? this.api.invitations(params) : of(null)),
  });

  protected readonly checklist = computed<ChecklistItem[]>(() => {
    const s = this.settings.value();
    const items: ChecklistItem[] = [
      {
        label: 'Uzupełnij dane firmy',
        description: 'Nazwa firmy, NIP i adres są wymagane na dokumentach sprzedaży i w stopce sklepu.',
        done: !!s?.legalCompanyName && !!s?.taxId && !!s?.addressLine1,
        link: 'ustawienia',
        action: 'Uzupełnij',
      },
      {
        label: 'Włącz weryfikację dwuetapową',
        description: 'Chroni konto i sklep przed przejęciem, nawet gdy hasło wycieknie.',
        done: !!this.session.user()?.mfaEnabled,
        link: '/konto',
        action: 'Włącz',
      },
    ];
    if (this.ctx.can('TEAM_MANAGE')) {
      items.push({
        label: 'Zaproś zespół',
        description: 'Dodaj osoby, które pomogą Ci prowadzić sklep, z odpowiednimi uprawnieniami.',
        done: (this.members.value()?.length ?? 0) > 1 || (this.invitations.value()?.length ?? 0) > 0,
        link: 'zespol',
        action: 'Zaproś',
      });
    }
    return items;
  });

  protected readonly doneCount = computed(() => this.checklist().filter((i) => i.done).length);
}
