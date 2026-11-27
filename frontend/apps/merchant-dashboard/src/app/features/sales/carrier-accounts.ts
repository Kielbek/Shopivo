import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ShippingApi } from '@shopivo/api-client';
import { CarrierAccount, CarrierDescriptor, CarrierServiceChoice, CarrierServiceView, ShippingType } from '@shopivo/shared-models';
import { AlertComponent, ButtonComponent, FieldComponent, LoadingComponent, ToastService, icons, moneyInput, parseMoney } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';
import { BrandLogoComponent } from './brand-logo';

interface Draft { values: Record<string, string>; sandbox: boolean; }
/** One delivery kind of a service in the picker: ticked or not, with its price. */
interface Pick { on: boolean; price: string; freeFrom: string; name: string; }

/**
 * Carrier connections. Aggregators (Furgonetka — sign-in, Apaczka — App ID/Secret) give many couriers at once: after
 * connecting, the merchant ticks the services they use and sets a price — each becomes a ready shipping method.
 * InPost connects directly with ShipX keys. Secrets are write-only.
 */
@Component({
  selector: 'sv-carrier-accounts',
  imports: [FormsModule, LucideDynamicIcon, FieldComponent, ButtonComponent, AlertComponent, LoadingComponent, BrandLogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mt-7" aria-labelledby="carriers-h">
      <h2 id="carriers-h" class="text-[14.5px] font-semibold text-ink">Przewoźnicy</h2>
      <p class="mt-0.5 max-w-2xl text-[13px] text-ink-soft">Połącz konto, zaznacz kurierów, z których korzystasz, i ustal ceny — resztą zajmiemy się my:
        klient wybierze dostawę lub paczkomat, a Ty utworzysz przesyłkę i etykietę jednym kliknięciem w zamówieniu.</p>

      @if (overview.isLoading() && !overview.value()) {
        <div class="mt-3"><sv-loading variant="form" /></div>
      } @else if (overview.error()) {
        <sv-alert tone="error" class="mt-3">Nie udało się wczytać przewoźników.</sv-alert>
      } @else {
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          @for (c of carriers(); track c.id) {
            @let acc = account(c.id);
            <article class="sv-card flex flex-col p-5" [class.ring-2]="openId() === c.id" [class.ring-ink]="openId() === c.id">
              <div class="flex items-start gap-3">
                <sv-brand-logo [brand]="c.id" [name]="c.name" class="h-11 w-24" />
                <div class="min-w-0 flex-1">
                  <h3 class="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-ink">{{ c.name }}
                    @if (c.aggregator) {<span class="settings-pill !bg-neon-soft !text-[#2E6B0F]">Wielu kurierów</span>}
                    @if (acc) {
                      <span class="settings-pill" [class]="acc.enabled ? '!bg-success-soft !text-success-ink' : ''">
                        {{ acc.enabled ? 'Połączony' : acc.verifiedAt ? 'Połączony — wyłączony' : 'Do sprawdzenia' }}</span>
                    }
                    @if (acc?.sandbox) {<span class="settings-pill !bg-warning-soft !text-warning-ink">Sandbox</span>}
                  </h3>
                  <p class="mt-1 text-[12.5px] leading-5 text-ink-soft">{{ c.description }}</p>
                </div>
              </div>
              @if (c.aggregator) {
                <div class="mt-3 flex flex-wrap gap-1.5" aria-label="Dostępni kurierzy">
                  @for (k of couriers; track k) {<sv-brand-logo [brand]="k" class="h-7 w-14" />}
                </div>
              }
              @if (acc?.services?.length) {
                <p class="mt-3 text-[12.5px] text-ink-soft">Zaznaczone usługi: <span class="font-medium text-ink">{{ serviceNames(acc!) }}</span></p>
              }
              <div class="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4" [class.mt-4]="true">
                @if (!canWrite) {
                  <span class="text-[12.5px] text-ink-muted">Podgląd — zmiany wymagają uprawnień do ustawień.</span>
                } @else if (c.oauth) {
                  @if (!c.available) {
                    <span class="text-[12.5px] text-ink-muted">Wymaga skonfigurowania aplikacji {{ c.name }} na platformie Shopivo.</span>
                  } @else {
                    <button sv-button size="sm" [variant]="acc ? 'secondary' : 'primary'" [loading]="busy() === c.id + ':connect'" (click)="connect(c)">
                      {{ acc ? 'Połącz ponownie' : 'Połącz konto' }} <svg [lucideIcon]="icons.external" /></button>
                    <label class="flex items-center gap-1.5 text-[12px] text-ink-muted">
                      <input type="checkbox" class="sv-checkbox" [ngModel]="draft(c.id).sandbox" (ngModelChange)="setSandbox(c.id, $event)" />Konto testowe</label>
                  }
                } @else {
                  <button sv-button size="sm" [variant]="acc ? 'secondary' : 'primary'" (click)="toggleOpen(c.id, 'keys')">{{ acc ? 'Dane konta' : 'Połącz' }}</button>
                }
                @if (c.aggregator && acc?.verifiedAt && canWrite) {
                  <button sv-button size="sm" [variant]="acc!.services.length ? 'secondary' : 'accent'" (click)="openServices(c)">
                    {{ acc!.services.length ? 'Kurierzy i ceny' : 'Wybierz kurierów' }}</button>
                }
                @if (acc && !c.aggregator && canWrite) {
                  @if (acc.enabled) {
                    <button sv-button variant="ghost" size="sm" [loading]="busy() === c.id + ':toggle'" (click)="toggle(c, false)">Wyłącz</button>
                  } @else if (acc.verifiedAt) {
                    <button sv-button variant="accent" size="sm" [loading]="busy() === c.id + ':toggle'" (click)="toggle(c, true)">Włącz</button>
                  }
                }
                @if (c.docsUrl) {<a class="ml-auto text-[12px] text-ink-muted hover:text-ink" [href]="c.docsUrl" target="_blank" rel="noopener">Dokumentacja ↗</a>}
              </div>
            </article>
          }
        </div>
        @if (errors()['_']; as e) {<sv-alert tone="error" class="mt-3">{{ e }}</sv-alert>}

        <!-- Keys (Apaczka, InPost) -->
        @if (openId() && mode() === 'keys' && carrier(openId()!); as c) {
          @let acc = account(c.id);
          <form class="sv-card mt-3 p-5" (ngSubmit)="save(c)" [attr.aria-label]="'Dane konta ' + c.name">
            <div class="flex items-center gap-3">
              <sv-brand-logo [brand]="c.id" [name]="c.name" class="h-9 w-20" />
              <h3 class="flex-1 text-[14px] font-semibold text-ink">Dane konta {{ c.name }}</h3>
              <button type="button" class="text-[13px] text-ink-muted hover:text-ink" (click)="openId.set(null)">Zamknij</button>
            </div>
            <fieldset class="mt-4 grid gap-4 sm:grid-cols-2">
              @for (f of c.credentials; track f.key) {
                <sv-field [label]="f.label" [for]="c.id + '-' + f.key" [hint]="acc?.filled?.[f.key] && f.secret ? 'Zapisane — zostaw puste, aby nie zmieniać.' : (f.hint ?? '')">
                  <input [id]="c.id + '-' + f.key" [name]="c.id + '-' + f.key" class="sv-input" autocomplete="off" maxlength="1000"
                    [type]="f.secret ? 'password' : 'text'" [ngModel]="draft(c.id).values[f.key] ?? ''" (ngModelChange)="setValue(c.id, f.key, $event)" />
                </sv-field>
              }
              <label class="flex items-center gap-2.5 text-[13px] text-ink sm:col-span-2">
                <input type="checkbox" role="switch" class="sv-switch" [name]="c.id + '-sandbox'" [ngModel]="draft(c.id).sandbox" (ngModelChange)="setSandbox(c.id, $event)" />
                Środowisko testowe (sandbox)
              </label>
            </fieldset>
            @if (errors()[c.id]; as e) {<sv-alert tone="error" class="mt-3">{{ e }}</sv-alert>}
            <div class="mt-4 flex flex-wrap gap-2">
              <button sv-button type="submit" [loading]="busy() === c.id + ':save'">Zapisz i sprawdź połączenie</button>
            </div>
          </form>
        }

        <!-- Services picker (aggregators) -->
        @if (openId() && mode() === 'services' && carrier(openId()!); as c) {
          <section class="sv-card mt-3 overflow-hidden p-0" [attr.aria-label]="'Kurierzy w ' + c.name">
            <div class="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <sv-brand-logo [brand]="c.id" [name]="c.name" class="h-9 w-20" />
              <div class="min-w-0 flex-1">
                <h3 class="text-[14px] font-semibold text-ink">Kurierzy z konta {{ c.name }}</h3>
                <p class="text-[12.5px] text-ink-muted">Zaznacz, z czego korzystasz, i podaj cenę dla klienta (brutto). Każda pozycja to gotowy sposób dostawy w sklepie.</p>
              </div>
              <button type="button" class="text-[13px] text-ink-muted hover:text-ink" (click)="openId.set(null)">Zamknij</button>
            </div>
            @if (servicesLoading()) {
              <div class="p-5"><sv-loading variant="list" /></div>
            } @else if (!services().length) {
              <p class="px-5 py-6 text-[13px] text-ink-muted">Na koncie {{ c.name }} nie ma aktywnych usług. Włącz przewoźników w panelu {{ c.name }} i odśwież.</p>
            } @else {
              <ul class="divide-y divide-line">
                @for (v of services(); track v.service.id) {
                  <li class="px-5 py-4">
                    <div class="flex items-center gap-3">
                      <sv-brand-logo [brand]="v.service.courier" [name]="v.service.name" class="h-9 w-16" />
                      <p class="min-w-0 flex-1 font-medium text-ink">{{ v.service.name }}</p>
                    </div>
                    <div class="mt-3 grid gap-2 sm:grid-cols-2">
                      @for (type of v.service.types; track type) {
                        @let p = pick(v.service.id, type);
                        <div class="rounded-[12px] border p-3 transition-colors" [class]="p.on ? 'border-ink bg-[#FAFBF9]' : 'border-line'">
                          <label class="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-ink">
                            <input type="checkbox" class="sv-checkbox" [ngModel]="p.on" (ngModelChange)="setPick(v.service.id, type, { on: $event })" />
                            {{ type === 'PARCEL_LOCKER' ? 'Dostawa do punktu / paczkomatu' : 'Kurier pod drzwi' }}
                          </label>
                          @if (p.on) {
                            <div class="mt-3 grid grid-cols-2 gap-2">
                              <sv-field label="Cena" [for]="'p-' + v.service.id + type">
                                <input [id]="'p-' + v.service.id + type" class="sv-input" inputmode="decimal" placeholder="0,00" [ngModel]="p.price"
                                  (ngModelChange)="setPick(v.service.id, type, { price: $event })" /></sv-field>
                              <sv-field label="Darmowa od" [for]="'f-' + v.service.id + type" [optional]="true">
                                <input [id]="'f-' + v.service.id + type" class="sv-input" inputmode="decimal" placeholder="np. 200,00" [ngModel]="p.freeFrom"
                                  (ngModelChange)="setPick(v.service.id, type, { freeFrom: $event })" /></sv-field>
                              <sv-field class="col-span-2" label="Nazwa w sklepie" [for]="'n-' + v.service.id + type">
                                <input [id]="'n-' + v.service.id + type" class="sv-input" maxlength="100" [ngModel]="p.name"
                                  (ngModelChange)="setPick(v.service.id, type, { name: $event })" /></sv-field>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  </li>
                }
              </ul>
              @if (errors()[c.id]; as e) {<div class="px-5 pb-3"><sv-alert tone="error">{{ e }}</sv-alert></div>}
              <div class="flex flex-wrap items-center justify-end gap-3 border-t border-line bg-[#FAFBF9] px-5 py-3">
                <span class="mr-auto text-[12.5px] text-ink-muted">Zaznaczone: {{ pickedCount() }}</span>
                <button sv-button [loading]="busy() === c.id + ':services'" (click)="saveServices(c)">Zapisz kurierów</button>
              </div>
            }
          </section>
        }
      }
    </section>
  `,
})
export class CarrierAccountsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ShippingApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly couriers = ['inpost', 'dpd', 'dhl', 'gls', 'ups', 'poczta', 'orlen'];

  /** `?polaczono=<carrier>` / `?blad=…` after the carrier's sign-in (set by the page). */
  readonly connected = input<string | null>(null);
  readonly connectError = input<string | null>(null);
  /** Shipping methods changed (ticked services) — the page reloads its list. */
  readonly methodsChanged = output<void>();

  protected readonly overview = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.carriers(params) });
  protected readonly openId = signal<string | null>(null);
  protected readonly mode = signal<'keys' | 'services'>('keys');
  protected readonly busy = signal<string | null>(null);
  protected readonly errors = signal<Record<string, string>>({});
  private readonly drafts = signal<Record<string, Draft>>({});
  protected readonly services = signal<CarrierServiceView[]>([]);
  protected readonly servicesLoading = signal(false);
  private readonly picks = signal<Record<string, Pick>>({});

  /** Aggregators first (easiest start), dev simulator last. */
  protected readonly carriers = computed<CarrierDescriptor[]>(() => [...(this.overview.value()?.carriers ?? [])]
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name)));
  protected readonly pickedCount = computed(() => Object.values(this.picks()).filter((p) => p.on).length);

  /** Carrier to open the courier picker for once the overview has loaded (after returning from sign-in). */
  private readonly pendingServices = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.connected();
      if (!id) return;
      untracked(() => {
        this.toast.success('Konto połączone. Teraz zaznacz kurierów, z których korzystasz.');
        this.pendingServices.set(id);
      });
    });
    effect(() => {
      const id = this.pendingServices();
      const c = id ? this.carriers().find((x) => x.id === id) : null;
      if (c) untracked(() => {
        this.pendingServices.set(null);
        void this.openServices(c);
      });
    });
    effect(() => {
      const e = this.connectError();
      if (e) untracked(() => this.errors.set({ _: e === 'anulowano' ? 'Logowanie zostało anulowane.' : 'Nie udało się połączyć konta. Spróbuj ponownie.' }));
    });
  }

  protected account(id: string): CarrierAccount | null {
    return this.overview.value()?.accounts.find((a) => a.carrierId === id) ?? null;
  }

  protected carrier(id: string): CarrierDescriptor | null {
    return this.carriers().find((c) => c.id === id) ?? null;
  }

  protected serviceNames(acc: CarrierAccount): string {
    return acc.services.map((s) => s.name).join(', ');
  }

  protected draft(id: string): Draft {
    return this.drafts()[id] ?? { values: {}, sandbox: this.account(id)?.sandbox ?? false };
  }

  protected setValue(id: string, key: string, value: string): void {
    const d = this.draft(id);
    this.drafts.update((all) => ({ ...all, [id]: { ...d, values: { ...d.values, [key]: value } } }));
  }

  protected setSandbox(id: string, sandbox: boolean): void {
    this.drafts.update((all) => ({ ...all, [id]: { ...this.draft(id), sandbox } }));
  }

  protected toggleOpen(id: string, mode: 'keys' | 'services'): void {
    const same = this.openId() === id && this.mode() === mode;
    this.mode.set(mode);
    this.openId.set(same ? null : id);
  }

  protected async connect(c: CarrierDescriptor): Promise<void> {
    await this.run(c.id, 'connect', async () => {
      const { url } = await firstValueFrom(this.api.connectCarrier(this.ctx.tenantId(), c.id, this.draft(c.id).sandbox));
      // Only a secure sign-in page (plain http only for a local development stand-in).
      if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) throw new Error('Nieoczekiwany adres logowania.');
      window.location.assign(url);
    });
  }

  /** Saves keys and tests the connection right away (aggregators then open the courier picker). */
  protected async save(c: CarrierDescriptor): Promise<void> {
    await this.run(c.id, 'save', async () => {
      const t = this.ctx.tenantId();
      const d = this.draft(c.id);
      await firstValueFrom(this.api.saveCarrier(t, c.id, { credentials: d.values, sandbox: d.sandbox, version: this.account(c.id)?.version ?? -1 }));
      this.drafts.update((all) => ({ ...all, [c.id]: { ...d, values: {} } }));
      try {
        await firstValueFrom(this.api.testCarrier(t, c.id));
      } finally {
        this.overview.reload();
      }
      this.toast.success(`Połączono konto ${c.name}.`);
      if (c.aggregator) await this.openServices(c);
      else this.openId.set(null);
    });
  }

  protected async openServices(c: CarrierDescriptor): Promise<void> {
    this.mode.set('services');
    this.openId.set(c.id);
    this.servicesLoading.set(true);
    this.errors.update((e) => ({ ...e, [c.id]: '' }));
    try {
      const list = await firstValueFrom(this.api.carrierServices(this.ctx.tenantId(), c.id));
      this.services.set(list);
      const picks: Record<string, Pick> = {};
      for (const v of list) {
        for (const type of v.service.types) {
          const m = v.methods.find((x) => x.type === type && x.active);
          picks[key(v.service.id, type)] = m
            ? { on: true, price: moneyInput(m.priceMinor), freeFrom: m.freeFromMinor === null ? '' : moneyInput(m.freeFromMinor), name: m.name }
            : { on: false, price: '', freeFrom: '', name: type === 'PARCEL_LOCKER' ? `${v.service.name} — odbiór w punkcie` : `${v.service.name} — kurier` };
        }
      }
      this.picks.set(picks);
    } catch (e) {
      this.errors.update((er) => ({ ...er, [c.id]: ApiError.from(e).message }));
      this.services.set([]);
    } finally {
      this.servicesLoading.set(false);
    }
  }

  protected pick(serviceId: string, type: ShippingType): Pick {
    return this.picks()[key(serviceId, type)] ?? { on: false, price: '', freeFrom: '', name: '' };
  }

  protected setPick(serviceId: string, type: ShippingType, change: Partial<Pick>): void {
    this.picks.update((all) => ({ ...all, [key(serviceId, type)]: { ...this.pick(serviceId, type), ...change } }));
  }

  protected async saveServices(c: CarrierDescriptor): Promise<void> {
    const choices: CarrierServiceChoice[] = [];
    for (const v of this.services()) {
      for (const type of v.service.types) {
        const p = this.pick(v.service.id, type);
        if (!p.on) continue;
        const price = parseMoney(p.price);
        const free = p.freeFrom.trim() ? parseMoney(p.freeFrom) : null;
        if (price === undefined || price === null || free === undefined) {
          this.errors.update((e) => ({ ...e, [c.id]: `Podaj poprawną cenę dla „${p.name || v.service.name}”.` }));
          return;
        }
        choices.push({ serviceId: v.service.id, type, name: p.name.trim() || null, priceMinor: price, freeFromMinor: free });
      }
    }
    await this.run(c.id, 'services', async () => {
      const saved = await firstValueFrom(this.api.saveCarrierServices(this.ctx.tenantId(), c.id, choices));
      this.services.set(saved);
      this.overview.reload();
      this.methodsChanged.emit();
      this.toast.success(choices.length ? `Zapisano — ${choices.length} ${choices.length === 1 ? 'sposób' : 'sposoby'} dostawy w sklepie.` : 'Zapisano.');
      this.openId.set(null);
    });
  }

  protected async toggle(c: CarrierDescriptor, enabled: boolean): Promise<void> {
    await this.run(c.id, 'toggle', async () => {
      await firstValueFrom(this.api.enableCarrier(this.ctx.tenantId(), c.id, enabled));
      this.overview.reload();
    });
  }

  private async run(id: string, kind: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(id + ':' + kind);
    this.errors.update((e) => ({ ...e, [id]: '', _: '' }));
    try {
      await action();
    } catch (e) {
      const msg = e instanceof Error && !(e as { status?: number }).status ? e.message : ApiError.from(e).message;
      this.errors.update((er) => ({ ...er, [this.openId() === id ? id : '_']: msg }));
    } finally {
      this.busy.set(null);
    }
  }
}

function key(serviceId: string, type: ShippingType): string {
  return serviceId + '|' + type;
}

function order(c: CarrierDescriptor): number {
  return c.id === 'fake' ? 9 : c.aggregator ? (c.oauth ? 0 : 1) : 2;
}
