import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiError, SessionStore, TenantApi } from '@shopivo/api-client';
import { InvitableRole, STORE_ROLE_DESCRIPTIONS, STORE_ROLE_LABELS, StoreRole, TeamMember } from '@shopivo/shared-models';
import { LucideDynamicIcon } from '@lucide/angular';
import {
  AlertComponent, AvatarComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent,
  EmptyStateComponent, FieldComponent, LoadingComponent, PageHeaderComponent, ToastService, controlError, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from './store-context';

const INVITABLE: InvitableRole[] = ['ADMIN', 'MANAGER', 'PRODUCT_MANAGER', 'ORDER_MANAGER', 'CUSTOMER_SUPPORT'];

@Component({
  selector: 'sv-team-page',
  imports: [ReactiveFormsModule, LucideDynamicIcon, PageHeaderComponent, ButtonComponent, AlertComponent, BadgeComponent,
    DatePipe, DialogComponent, EmptyStateComponent, FieldComponent, LoadingComponent, CardComponent, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Zespół" description="Osoby z dostępem do panelu sklepu i ich uprawnienia.">
      @if (canManage) {
        <button sv-button (click)="inviteOpen.set(true)"><svg [lucideIcon]="icons.userPlus" />Zaproś osobę</button>
      }
    </sv-page-header>

    <sv-card class="mt-6" heading="Członkowie zespołu" [subheading]="membersCount()" [flush]="true">
      @if (members.isLoading()) {
        <sv-loading />
      } @else if (members.error()) {
        <div class="px-5 pb-5"><sv-alert tone="error">Nie udało się wczytać zespołu.</sv-alert></div>
      } @else {
        <div class="overflow-x-auto px-5 pb-3">
          <table class="sv-table min-w-[560px]">
            <thead><tr><th scope="col">Osoba</th><th scope="col">Rola</th><th scope="col">Dołączył(a)</th>@if (canManage) {<th scope="col"><span class="sr-only">Akcje</span></th>}</tr></thead>
            <tbody>
              @for (m of members.value(); track m.membershipId) {
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <sv-avatar [name]="m.fullName" />
                      <div class="min-w-0">
                        <p class="truncate font-medium text-ink">{{ m.fullName }}
                          @if (m.userId === me()) {<span class="text-[12px] font-normal text-ink-muted"> (Ty)</span>}
                        </p>
                        <p class="truncate text-[12px] text-ink-muted">{{ m.email }}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    @if (canChange(m)) {
                      <label class="sr-only" [for]="'role-' + m.membershipId">Rola: {{ m.fullName }}</label>
                      <select class="sv-input h-8 w-auto text-[13px]" [id]="'role-' + m.membershipId"
                        (change)="changeRole(m, $any($event.target).value)">
                        @for (r of assignableRoles(); track r) {<option [value]="r" [selected]="r === m.role">{{ labels[r] }}</option>}
                      </select>
                    } @else {
                      <sv-badge [tone]="m.role === 'OWNER' ? 'violet' : 'info'">{{ labels[m.role] }}</sv-badge>
                    }
                    @if (m.status === 'DISABLED') {<sv-badge tone="danger" class="ml-1">Wyłączony</sv-badge>}
                  </td>
                  <td class="whitespace-nowrap text-ink-soft">{{ m.joinedAt | svDate: 'date' }}</td>
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
        </div>
      }
    </sv-card>

    @if (canManage) {
      <sv-card class="mt-4" heading="Oczekujące zaproszenia" subheading="Zaproszenia są ważne przez 7 dni." [flush]="true">
        @if (invitations.isLoading()) {
          <sv-loading />
        } @else if (!invitations.value()?.length) {
          <sv-empty-state icon="mail" title="Brak oczekujących zaproszeń" description="Zaproszone osoby pojawią się tutaj do czasu akceptacji." />
        } @else {
          <div class="overflow-x-auto px-5 pb-3">
            <table class="sv-table min-w-[560px]">
              <thead><tr><th scope="col">E-mail</th><th scope="col">Rola</th><th scope="col">Wygasa</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
              <tbody>
                @for (inv of invitations.value(); track inv.id) {
                  <tr>
                    <td class="font-medium">{{ inv.email }}</td>
                    <td><sv-badge tone="info">{{ labels[inv.role] }}</sv-badge></td>
                    <td class="whitespace-nowrap text-ink-soft">{{ inv.expiresAt | svDate: 'date' }}</td>
                    <td class="whitespace-nowrap text-right">
                      <button sv-button variant="ghost" size="sm" (click)="resend(inv.id)">Wyślij ponownie</button>
                      <button sv-button variant="ghost" size="sm" (click)="revoke(inv.id)">Anuluj</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </sv-card>
    }

    <sv-dialog heading="Zaproś osobę do zespołu" [open]="inviteOpen()" (closed)="closeInvite()">
      <p>Wyślemy zaproszenie e-mailem. Osoba bez konta Shopivo utworzy je po kliknięciu w link.</p>
      <form [formGroup]="inviteForm" (ngSubmit)="invite()" id="invite-form" class="mt-4 space-y-4 text-ink" novalidate>
        @if (inviteError(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
        <sv-field label="Adres e-mail" for="invite-email" [error]="inviteEmailError()">
          <input id="invite-email" type="email" class="sv-input" formControlName="email" placeholder="jan@firma.pl" />
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
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;

  protected readonly labels = STORE_ROLE_LABELS;
  protected readonly descriptions = STORE_ROLE_DESCRIPTIONS;
  protected readonly invitable = INVITABLE;
  protected readonly canManage = this.ctx.can('TEAM_MANAGE');
  protected readonly me = computed(() => this.session.user()?.id);
  protected readonly isOwner = computed(() => this.ctx.membership()?.role === 'OWNER');
  protected readonly membersCount = computed(() => {
    const n = this.members.value()?.length ?? 0;
    return n === 1 ? '1 osoba' : `${n} ${n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'osoby' : 'osób'}`;
  });
  protected readonly assignableRoles = computed<StoreRole[]>(() => (this.isOwner() ? ['OWNER', ...INVITABLE] : INVITABLE));

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
      this.toast.success(`Wysłano zaproszenie na adres ${email.trim()}.`);
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
    try {
      await firstValueFrom(action());
      this.toast.success(success);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
