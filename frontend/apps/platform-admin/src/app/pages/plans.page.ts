import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { AdminBillingApi, ApiError, PlanInput, SessionStore } from '@shopivo/api-client';
import { EntitlementDefinition, Plan, formatEntitlement } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, ButtonComponent, CardComponent, DialogComponent, FieldComponent, LoadingComponent,
  MoneyPipe, PageHeaderComponent, ToastService, icons,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

interface PlanForm {
  id: string | null;
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  trialDays: number;
  active: boolean;
  publicPlan: boolean;
  /** Net prices in złoty as typed (empty = not offered). */
  month: string;
  year: string;
  entitlements: Record<string, string>;
  version: number;
}

/**
 * Plans, prices and limits are data. Changing a price only affects new subscribers — existing ones keep the price
 * they bought (grandfathering).
 */
@Component({
  selector: 'sv-admin-plans',
  imports: [FormsModule, LucideDynamicIcon, PageHeaderComponent, CardComponent, BadgeComponent, ButtonComponent, AlertComponent,
    FieldComponent, LoadingComponent, DialogComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Plany i limity"
      description="Ceny netto. Zmiana ceny dotyczy tylko nowych subskrypcji — obecni klienci zachowują swoją cenę.">
      @if (isAdmin) {<button sv-button (click)="openNew()"><svg [lucideIcon]="icons.plus" />Nowy plan</button>}
    </sv-page-header>

    @if (data.isLoading() && !data.value()) {
      <sv-loading />
    } @else if (data.error()) {
      <sv-alert tone="error" class="mt-6">Nie udało się wczytać planów.</sv-alert>
    } @else if (data.value(); as d) {
      <sv-card class="mt-6" [flush]="true">
        <div class="overflow-x-auto px-5 py-3">
          <table class="sv-table min-w-[880px]">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col" class="text-right">Miesięcznie</th>
                <th scope="col" class="text-right">Rocznie</th>
                @for (e of shownLimits(d.entitlements); track e.key) {<th scope="col" class="text-right">{{ e.label }}</th>}
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Akcje</span></th>
              </tr>
            </thead>
            <tbody>
              @for (p of d.plans; track p.id) {
                <tr>
                  <td><p class="font-medium text-ink">{{ p.name }}</p><p class="text-[12px] text-ink-muted">{{ p.code }} · próba {{ p.trialDays }} dni</p></td>
                  <td class="text-right tabular-nums">{{ price(p, 'MONTH') | svMoney }}</td>
                  <td class="text-right tabular-nums">{{ price(p, 'YEAR') | svMoney }}</td>
                  @for (e of shownLimits(d.entitlements); track e.key) {
                    <td class="text-right tabular-nums">{{ format(e.kind, p.entitlements[e.key], e.key) }}</td>
                  }
                  <td>
                    <sv-badge [tone]="p.active ? 'success' : 'neutral'">{{ p.active ? 'Aktywny' : 'Wyłączony' }}</sv-badge>
                    @if (!p.publicPlan) {<sv-badge class="ml-1">Ukryty</sv-badge>}
                  </td>
                  <td class="text-right">
                    <button sv-button variant="ghost" size="sm" (click)="openEdit(p)">{{ isAdmin ? 'Edytuj' : 'Szczegóły' }}</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </sv-card>
      <p class="mt-3 text-[12px] text-ink-muted">
        Limity „uczciwego użytkowania” (zamówienia, odsłony) nie blokują sklepu — po przekroczeniu sklep jest oznaczany w raporcie
        zużycia, a właściciel dostaje propozycję wyższego planu. Limity twarde (produkty, zespół, miejsce) blokują dodawanie.
      </p>
    }

    <sv-dialog [heading]="form()?.id ? 'Plan ' + form()!.name : 'Nowy plan'" [open]="!!form()" (closed)="close()">
      @if (form(); as f) {
        <form id="plan-form" class="space-y-5" (ngSubmit)="save()">
          @if (error(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
          <fieldset class="grid gap-4 sm:grid-cols-2" [disabled]="!isAdmin">
            @if (!f.id) {
              <sv-field label="Kod" for="plan-code" hint="Wielkie litery, np. ENTERPRISE. Nie można go później zmienić.">
                <input id="plan-code" name="code" class="sv-input uppercase" required maxlength="40" [(ngModel)]="f.code" />
              </sv-field>
            }
            <sv-field label="Nazwa" for="plan-name"><input id="plan-name" name="name" class="sv-input" required maxlength="100" [(ngModel)]="f.name" /></sv-field>
            <sv-field label="Opis" for="plan-desc" [optional]="true" class="sm:col-span-2">
              <input id="plan-desc" name="description" class="sv-input" maxlength="500" [(ngModel)]="f.description" />
            </sv-field>
            <sv-field label="Cena miesięczna netto (zł)" for="plan-month" hint="Puste = niedostępny miesięcznie">
              <input id="plan-month" name="month" class="sv-input" inputmode="decimal" [(ngModel)]="f.month" />
            </sv-field>
            <sv-field label="Cena roczna netto (zł)" for="plan-year" hint="Puste = niedostępny rocznie">
              <input id="plan-year" name="year" class="sv-input" inputmode="decimal" [(ngModel)]="f.year" />
            </sv-field>
            <sv-field label="Okres próbny (dni)" for="plan-trial">
              <input id="plan-trial" name="trial" type="number" min="0" max="90" class="sv-input" [(ngModel)]="f.trialDays" />
            </sv-field>
            <sv-field label="Kolejność" for="plan-sort">
              <input id="plan-sort" name="sort" type="number" class="sv-input" [(ngModel)]="f.sortOrder" />
            </sv-field>
            <div class="flex flex-wrap gap-x-6 gap-y-3 sm:col-span-2">
              <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="active" [(ngModel)]="f.active" />Aktywny (można kupić)</label>
              <label class="flex items-center gap-2.5 text-[13px] text-ink"><input type="checkbox" role="switch" class="sv-switch" name="public" [(ngModel)]="f.publicPlan" />Widoczny w cenniku</label>
            </div>
          </fieldset>

          <fieldset class="border-t border-line pt-4" [disabled]="!isAdmin">
            <legend class="pt-4 text-[13px] font-semibold text-ink">Limity i funkcje <span class="font-normal text-ink-muted">(-1 = bez limitu)</span></legend>
            <div class="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              @for (e of data.value()?.entitlements; track e.key) {
                @if (e.kind === 'FEATURE') {
                  <label class="flex items-center gap-2.5 text-[13px] text-ink">
                    <input type="checkbox" role="switch" class="sv-switch" [name]="'ent-' + e.key"
                      [ngModel]="f.entitlements[e.key] === 'true'" (ngModelChange)="f.entitlements[e.key] = $event ? 'true' : 'false'" />
                    {{ e.label }}
                  </label>
                } @else {
                  <sv-field [label]="e.label + (e.key === 'storage.max_mb' ? ' (MB)' : '') + (e.kind === 'FAIR_USE' ? ' — uczciwe użytkowanie' : '')" [for]="'ent-' + e.key">
                    <input class="sv-input" type="number" min="-1" [id]="'ent-' + e.key" [name]="'ent-' + e.key" [(ngModel)]="f.entitlements[e.key]" />
                  </sv-field>
                }
              }
            </div>
          </fieldset>
        </form>
      }
      <ng-container dialog-actions>
        <button sv-button variant="secondary" type="button" (click)="close()">{{ isAdmin ? 'Anuluj' : 'Zamknij' }}</button>
        @if (isAdmin) {<button sv-button type="submit" form="plan-form" [loading]="saving()">Zapisz plan</button>}
      </ng-container>
    </sv-dialog>
  `,
})
export class PlansPage {
  private readonly api = inject(AdminBillingApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly isAdmin = inject(SessionStore).user()?.platformRole === 'PLATFORM_ADMIN';
  protected readonly format = formatEntitlement;

  protected readonly data = rxResource({ stream: () => this.api.plans() });
  protected readonly form = signal<PlanForm | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly limitKeys = computed(() => ['products.max', 'staff.max', 'orders.monthly.fair_use']);

  protected shownLimits(all: EntitlementDefinition[]): EntitlementDefinition[] {
    return all.filter((e) => this.limitKeys().includes(e.key));
  }

  protected price(p: Plan, interval: 'MONTH' | 'YEAR'): number | null {
    return p.prices.find((x) => x.interval === interval)?.amountMinor ?? null;
  }

  protected openNew(): void {
    const entitlements: Record<string, string> = {};
    for (const e of this.data.value()?.entitlements ?? []) entitlements[e.key] = e.kind === 'FEATURE' ? 'false' : '0';
    this.error.set(null);
    this.form.set({ id: null, code: '', name: '', description: '', sortOrder: 100, trialDays: 14, active: false, publicPlan: true,
      month: '', year: '', entitlements, version: 0 });
  }

  protected openEdit(p: Plan): void {
    this.error.set(null);
    const zl = (v: number | null) => (v === null ? '' : (v / 100).toFixed(2).replace('.', ','));
    this.form.set({ id: p.id, code: p.code, name: p.name, description: p.description ?? '', sortOrder: p.sortOrder,
      trialDays: p.trialDays, active: p.active, publicPlan: p.publicPlan, month: zl(this.price(p, 'MONTH')),
      year: zl(this.price(p, 'YEAR')), entitlements: { ...p.entitlements }, version: p.version });
  }

  protected close(): void {
    if (!this.saving()) this.form.set(null);
  }

  protected async save(): Promise<void> {
    const f = this.form();
    if (!f) return;
    const month = toMinor(f.month);
    const year = toMinor(f.year);
    if (month === undefined || year === undefined) {
      this.error.set('Cena musi być kwotą, np. 79 lub 79,00.');
      return;
    }
    const input: PlanInput = {
      code: f.id ? undefined : f.code.trim().toUpperCase(), name: f.name.trim(), description: f.description.trim() || null,
      sortOrder: Number(f.sortOrder) || 0, active: f.active, publicPlan: f.publicPlan, trialDays: Number(f.trialDays) || 0,
      entitlements: Object.fromEntries(Object.entries(f.entitlements).map(([k, v]) => [k, String(v)])),
      prices: { MONTH: month, YEAR: year }, version: f.version,
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(f.id ? this.api.updatePlan(f.id, input) : this.api.createPlan(input));
      this.toast.success('Zapisano plan.');
      this.form.set(null);
      this.data.reload();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
    } finally {
      this.saving.set(false);
    }
  }
}

/** "79,90" → 7990; "" → null (not offered); invalid → undefined. */
function toMinor(value: string): number | null | undefined {
  const v = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!v) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return undefined;
  return Math.round(Number(v) * 100);
}
