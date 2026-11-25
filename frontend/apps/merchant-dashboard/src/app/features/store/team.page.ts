import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError, SessionStore, TenantApi } from '@shopivo/api-client';
import { InvitableRole, STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS, StoreRole, TeamMember } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, DatePipe, DialogComponent, EmptyStateComponent, FieldComponent,
  LoadingComponent, PageHeaderComponent, controlError,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from './store-context';

const INVITABLE: InvitableRole[] = ['ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'];

@Component({
  selector: 'sv-team-page',
  imports: [ReactiveFormsModule, PageHeaderComponent, ButtonComponent, AlertComponent, BadgeComponent, DatePipe,
    DialogComponent, EmptyStateComponent, FieldComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Zespół" description="Osoby z dostępem do panelu sklepu i ich uprawnienia.">
      @if (canManage) {<button sv-button (click)="inviteOpen.set(true)">Zaproś osobę</button>}
    </sv-page-header>

    @if (message(); as m) {<sv-alert [tone]="m.tone" class="mt-6">{{ m.text }}</sv-alert>}

    <div class="sv-card mt-6 overflow-x-auto">
      @if (members.isLoading()) {
        <sv-loading />
      } @else if (members.error()) {
        <div class="p-4"><sv-alert tone="error">Nie udało się wczytać zespołu.</sv-alert></div>
      } @else {
        <table class="sv-table">
          <thead><tr><th scope="col">Osoba</th><th scope="col">Rola</th><th scope="col">Dołączył(a)</th>@if (canManage) {<th scope="col"><span class="sr-only">Akcje</span></th>}</tr></thead>
          <tbody>
            @for (m of members.value(); track m.membershipId) {
              <tr>
                <td>
                  <p class="font-medium text-zinc-900">{{ m.fullName }}
                    @if (m.userId === me()) {<span class="text-[12px] font-normal text-zinc-500"> (Ty)</span>}
                  </p>
                  <p class="text-zinc-500">{{ m.email }}</p>
                </td>
                <td>
                  @if (canChange(m)) {
                    <label class="sr-only" [for]="'role-' + m.membershipId">Rola: {{ m.fullName }}</label>
                    <select class="sv-input h-8 w-auto py-0 text-[13px]" [id]="'role-' + m.membershipId" [value]="m.role"
                      (change)="changeRole(m, $any($event.target).value)">
                      @for (r of assignableRoles(); track r) {<option [value]="r">{{ labels[r] }}</option>}
                    </select>
                  } @else {
                    <sv-badge [tone]="m.role === 'OWNER' ? 'brand' : 'neutral'">{{ labels[m.role] }}</sv-badge>
                  }
                  @if (m.status === 'DISABLED') {<sv-badge tone="danger" class="ml-1">Wyłączony</sv-badge>}
                </td>
                <td class="whitespace-nowrap text-zinc-600">{{ m.joinedAt | svDate: 'date' }}</td>
                @if (canManage) {
                  <td class="text-right">
                    @if (canChange(m)) {
                      <button sv-button variant="ghost" size="sm" (click)="toRemove.set(m)">Usuń</button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    @if (canManage) {
      <h2 class="mt-10 text-[15px] font-semibold">Oczekujące zaproszenia</h2>
      <div class="sv-card mt-3 overflow-x-auto">
        @if (invitations.isLoading()) {
          <sv-loading />
        } @else if (!invitations.value()?.length) {
          <sv-empty-state title="Brak oczekujących zaproszeń" description="Zaproszone osoby pojawią się tutaj do czasu akceptacji." />
        } @else {
          <table class="sv-table">
            <thead><tr><th scope="col">E-mail</th><th scope="col">Rola</th><th scope="col">Wygasa</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
            <tbody>
              @for (inv of invitations.value(); track inv.id) {
                <tr>
                  <td class="font-medium">{{ inv.email }}</td>
                  <td>{{ labels[inv.role] }}</td>
                  <td class="whitespace-nowrap text-zinc-600">{{ inv.expiresAt | svDate: 'date' }}</td>
                  <td class="whitespace-nowrap text-right">
                    <button sv-button variant="ghost" size="sm" (click)="resend(inv.id)">Wyślij ponownie</button>
                    <button sv-button variant="ghost" size="sm" (click)="revoke(inv.id)">Anuluj</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }

    <sv-dialog heading="Zaproś osobę do zespołu" [open]="inviteOpen()" (closed)="closeInvite()">
      <form [formGroup]="inviteForm" (ngSubmit)="invite()" id="invite-form" class="space-y-4 pt-2 text-zinc-900" novalidate>
        @if (inviteError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        <sv-field label="Adres e-mail" for="invite-email" [error]="inviteEmailError()">
          <input id="invite-email" type="email" class="sv-input" formControlName="email" />
        </sv-field>
        <sv-field label="Rola" for="invite-role" [hint]="descriptions[inviteForm.controls.role.value]">
          <select id="invite-role" class="sv-input" formControlName="role">
            @for (r of invitable; track r) {<option [value]="r">{{ labels[r] }}</option>}
          </select>
        </sv-field>
      </form>
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="closeInvite()">Anuluj</button>
        <button sv-button type="submit" form="invite-form" [loading]="inviting()">Wyślij zaproszenie</button>
      </ng-container>
    </sv-dialog>

    <sv-dialog heading="Usunąć osobę z zespołu?" [open]="!!toRemove()" (closed)="toRemove.set(null)">
      {{ toRemove()?.fullName }} ({{ toRemove()?.email }}) natychmiast straci dostęp do panelu sklepu.
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="toRemove.set(null)">Anuluj</button>
        <button sv-button variant="danger" type="button" [loading]="removing()" (click)="remove()">Usuń z zespołu</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class TeamPage {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(TenantApi);
  private readonly session = inject(SessionStore);

  protected readonly labels = STORE_ROLE_LABELS;
  protected readonly descriptions = STORE_ROLE_DESCRIPTIONS;
  protected readonly invitable = INVITABLE;
  protected readonly canManage = this.ctx.can('TEAM_MANAGE');
  protected readonly me = computed(() => this.session.user()?.id);
  protected readonly isOwner = computed(() => this.ctx.membership()?.role === 'OWNER');
  protected readonly assignableRoles = computed<StoreRole[]>(() => (this.isOwner() ? ['OWNER', ...INVITABLE] : INVITABLE));

  protected readonly message = signal<{ tone: 'success' | 'error'; text: string } | null>(null);
  protected readonly inviteOpen = signal(false);
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly toRemove = signal<TeamMember | null>(null);
  protected readonly removing = signal(false);

  protected readonly inviteForm = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    role: ['MANAGER' as InvitableRole],
  });

  protected readonly members = rxResource({
    params: () => this.ctx.tenantId(),
    stream: ({ params }) => this.api.members(params),
  });
  protected readonly invitations = rxResource({
    params: () => (this.canManage ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.invitations(params),
  });

  protected canChange(m: TeamMember): boolean {
    if (!this.canManage || m.userId === this.me()) return false;
    return m.role !== 'OWNER' || this.isOwner();
  }

  protected inviteEmailError(): string | null {
    return controlError(this.inviteForm.controls.email);
  }

  protected closeInvite(): void {
    this.inviteOpen.set(false);
    this.inviteError.set(null);
    this.inviteForm.reset({ email: '', role: 'MANAGER' });
  }

  async invite(): Promise<void> {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }
    this.inviting.set(true);
    this.inviteError.set(null);
    const { email, role } = this.inviteForm.getRawValue();
    try {
      await firstValueFrom(this.api.invite(this.ctx.tenantId(), email.trim(), role));
      this.closeInvite();
      this.message.set({ tone: 'success', text: `Wysłano zaproszenie na adres ${email.trim()}.` });
      this.invitations.reload();
    } catch (e) {
      this.inviteError.set(ApiError.from(e).message);
    } finally {
      this.inviting.set(false);
    }
  }

  async changeRole(member: TeamMember, role: StoreRole): Promise<void> {
    await this.run(() => this.api.updateMember(this.ctx.tenantId(), member.membershipId, { role }),
      `Zmieniono rolę: ${member.fullName} — ${STORE_ROLE_LABELS[role]}.`);
    this.members.reload();
  }

  async remove(): Promise<void> {
    const member = this.toRemove();
    if (!member) return;
    this.removing.set(true);
    await this.run(() => this.api.removeMember(this.ctx.tenantId(), member.membershipId), `Usunięto ${member.fullName} z zespołu.`);
    this.removing.set(false);
    this.toRemove.set(null);
    this.members.reload();
  }

  async resend(id: string): Promise<void> {
    await this.run(() => this.api.resendInvitation(this.ctx.tenantId(), id), 'Zaproszenie zostało wysłane ponownie.');
  }

  async revoke(id: string): Promise<void> {
    await this.run(() => this.api.revokeInvitation(this.ctx.tenantId(), id), 'Zaproszenie zostało anulowane.');
    this.invitations.reload();
  }

  private async run(action: () => import('rxjs').Observable<unknown>, success: string): Promise<void> {
    this.message.set(null);
    try {
      await firstValueFrom(action());
      this.message.set({ tone: 'success', text: success });
    } catch (e) {
      this.message.set({ tone: 'error', text: ApiError.from(e).message });
    }
  }
}
