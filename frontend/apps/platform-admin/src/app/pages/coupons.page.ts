import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { AdminBillingApi, ApiError, CouponInput, SessionStore } from '@shopivo/api-client';
import { Coupon } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DatePipe, DialogComponent, EmptyStateComponent, FieldComponent,
  LoadingComponent, MoneyPipe, PageHeaderComponent, SelectComponent, SelectOption, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const DURATIONS: SelectOption[] = [
  { value: 'ONCE', label: 'Jednorazowo', description: 'Pierwsza płatność' },
  { value: 'REPEATING', label: 'Przez kilka miesięcy', description: 'Np. 3 miesiące' },
  { value: 'FOREVER', label: 'Zawsze', description: 'Każda płatność' },
];

/** Discount codes for subscriptions (one redemption per store). */
@Component({
  selector: 'sv-admin-coupons',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    FieldComponent, LoadingComponent, DialogComponent, EmptyStateComponent, SelectComponent, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Kupony" description="Kody rabatowe na subskrypcje. Każdy sklep może użyć danego kodu raz.">
      @if (isAdmin) {<button sv-button (click)="open()"><svg [lucideIcon]="icons.plus" />Nowy kupon</button>}
    </sv-page-header>

    <sv-card class="mt-6" [flush]="true">
      @if (coupons.isLoading() && !coupons.value()) {
        <sv-loading />
      } @else if (coupons.error()) {
        <div class="p-5"><sv-alert tone="error">Nie udało się wczytać kuponów.</sv-alert></div>
      } @else if (!coupons.value()?.length) {
        <sv-empty-state icon="discount" title="Brak kuponów" description="Utwórz kod rabatowy, np. na pierwsze miesiące." />
      } @else {
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[720px]">
            <thead><tr><th scope="col">Kod</th><th scope="col">Rabat</th><th scope="col">Czas trwania</th><th scope="col">Użycia</th><th scope="col">Ważny do</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Akcje</span></th></tr></thead>
            <tbody>
              @for (c of coupons.value(); track c.id) {
                <tr>
                  <td><p class="font-medium text-ink">{{ c.code }}</p>@if (c.description) {<p class="text-[12px] text-ink-muted">{{ c.description }}</p>}</td>
                  <td>{{ c.percentOff !== null ? c.percentOff + '%' : (c.amountOffMinor | svMoney) + ' netto' }}</td>
                  <td>{{ durationLabel(c) }}</td>
                  <td class="tabular-nums">{{ c.redeemedCount }}{{ c.maxRedemptions !== null ? ' / ' + c.maxRedemptions : '' }}</td>
                  <td class="whitespace-nowrap text-ink-soft">{{ c.validUntil | svDate: 'date' }}</td>
                  <td><sv-badge [tone]="c.active ? 'success' : 'neutral'">{{ c.active ? 'Aktywny' : 'Wyłączony' }}</sv-badge></td>
                  <td class="text-right">
                    @if (isAdmin) {
                      <button sv-button variant="ghost" size="sm" (click)="toggle(c)">{{ c.active ? 'Wyłącz' : 'Włącz' }}</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </sv-card>

    <sv-dialog heading="Nowy kupon" [open]="!!form()" (closed)="form.set(null)">
      @if (form(); as f) {
        <form id="coupon-form" class="grid gap-4 sm:grid-cols-2" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error" class="sm:col-span-2">{{ e }}</sv-alert>}
          <sv-field label="Kod" for="c-code"><input id="c-code" name="code" class="sv-input uppercase" maxlength="40" required [(ngModel)]="f.code" /></sv-field>
          <sv-field label="Opis" for="c-desc" [optional]="true"><input id="c-desc" name="desc" class="sv-input" maxlength="200" [(ngModel)]="f.description" /></sv-field>
          <sv-field label="Rabat procentowy" for="c-pct" hint="1–100. Zostaw puste dla rabatu kwotowego.">
            <input id="c-pct" name="pct" type="number" min="1" max="100" class="sv-input" [(ngModel)]="f.percent" />
          </sv-field>
          <sv-field label="Rabat kwotowy netto (zł)" for="c-amt" [optional]="true">
            <input id="c-amt" name="amt" class="sv-input" inputmode="decimal" [(ngModel)]="f.amount" />
          </sv-field>
          <sv-field label="Czas trwania" for="c-dur">
            <sv-select inputId="c-dur" name="dur" [options]="durations" [(ngModel)]="f.duration" ariaLabel="Czas trwania" />
          </sv-field>
          @if (f.duration === 'REPEATING') {
            <sv-field label="Liczba miesięcy" for="c-months"><input id="c-months" name="months" type="number" min="1" max="36" class="sv-input" [(ngModel)]="f.months" /></sv-field>
          }
          <sv-field label="Limit użyć" for="c-max" [optional]="true"><input id="c-max" name="max" type="number" min="1" class="sv-input" [(ngModel)]="f.max" /></sv-field>
          <sv-field label="Ważny do" for="c-until" [optional]="true"><input id="c-until" name="until" type="date" class="sv-input" [(ngModel)]="f.until" /></sv-field>
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="form.set(null)">Anuluj</button>
        <button sv-button type="submit" form="coupon-form" [loading]="saving()">Utwórz kupon</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class CouponsPage {
  private readonly api = inject(AdminBillingApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly durations = DURATIONS;
  protected readonly isAdmin = inject(SessionStore).user()?.platformRole === 'PLATFORM_ADMIN';

  protected readonly coupons = rxResource({ stream: () => this.api.coupons() });
  protected readonly form = signal<{ code: string; description: string; percent: number | null; amount: string;
    duration: 'ONCE' | 'REPEATING' | 'FOREVER'; months: number | null; max: number | null; until: string } | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected durationLabel(c: Coupon): string {
    if (c.duration === 'ONCE') return 'Jednorazowo';
    if (c.duration === 'FOREVER') return 'Zawsze';
    return `${c.durationMonths} mies.`;
  }

  protected open(): void {
    this.error.set(null);
    this.form.set({ code: '', description: '', percent: null, amount: '', duration: 'ONCE', months: 3, max: null, until: '' });
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f) return;
    const amount = f.amount.trim() ? Math.round(Number(f.amount.replace(',', '.')) * 100) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      this.error.set('Nieprawidłowa kwota rabatu.');
      return;
    }
    const input: CouponInput = {
      code: f.code.trim().toUpperCase(), description: f.description.trim() || null,
      percentOff: f.percent ? Number(f.percent) : null, amountOffMinor: amount, duration: f.duration,
      durationMonths: f.duration === 'REPEATING' ? Number(f.months) : null, maxRedemptions: f.max ? Number(f.max) : null,
      validUntil: f.until ? new Date(f.until + 'T23:59:59').toISOString() : null,
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.api.createCoupon(input));
      this.toast.success(`Utworzono kupon ${input.code}.`);
      this.form.set(null);
      this.coupons.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  protected async toggle(c: Coupon): Promise<void> {
    try {
      await firstValueFrom(this.api.setCouponActive(c.id, !c.active));
      this.coupons.reload();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
