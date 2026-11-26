import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ApiError, ShippingApi } from '@shopivo/api-client';
import { Order, SHIPMENT_STATUS_LABELS, Shipment, ShipmentInput, ShipmentStatus } from '@shopivo/shared-models';
import {
  AlertComponent, BadgeComponent, BadgeTone, ButtonComponent, CardComponent, DatePipe, FieldComponent, LoadingComponent, SelectComponent, SelectOption,
  ToastService, downloadBlob,
} from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

const TONE: Record<ShipmentStatus, BadgeTone> = {
  PENDING: 'neutral', READY: 'info', IN_TRANSIT: 'info', READY_FOR_PICKUP: 'warning', DELIVERED: 'success', RETURNED: 'warning', FAILED: 'danger', CANCELED: 'neutral',
};

/** Shipments of an order whose delivery method is linked to a carrier: create the parcel, download the label, follow tracking. */
@Component({
  selector: 'sv-order-shipments',
  imports: [FormsModule, CardComponent, BadgeComponent, ButtonComponent, AlertComponent, FieldComponent, LoadingComponent, SelectComponent, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-card heading="Przesyłka">
      @if (list.isLoading() && !list.hasValue()) {
        <sv-loading />
      } @else if (list.error()) {
        <sv-alert tone="error">Nie udało się wczytać przesyłek.</sv-alert>
      } @else {
        @for (s of shipments(); track s.id) {
          <div class="mb-3 rounded-[10px] border border-line p-3 text-[13px]">
            <div class="flex flex-wrap items-center gap-1.5">
              <sv-badge [tone]="tone[s.status]">{{ labels[s.status] }}</sv-badge>
              @if (s.sandbox) {<sv-badge tone="warning">Sandbox</sv-badge>}
              <span class="text-ink-muted">{{ s.service === 'PARCEL_LOCKER' ? 'Paczkomat' : 'Kurier' }} · {{ s.createdAt | svDate }}</span>
            </div>
            @if (s.trackingNumber) {
              <p class="mt-1.5 text-ink-soft">Nr: <span class="font-medium text-ink">{{ s.trackingNumber }}</span>
                @if (s.trackingUrl) { · <a class="sv-link" [href]="s.trackingUrl" target="_blank" rel="noopener">Śledź</a>}</p>
            }
            @if (s.error) {<p class="mt-1.5 text-danger">{{ s.error }}</p>}
            @if (canWrite && s.status !== 'FAILED' && s.status !== 'CANCELED') {
              <div class="mt-2 flex flex-wrap gap-2">
                @if (s.labelAvailable) {
                  <button sv-button size="sm" variant="secondary" [loading]="busy() === s.id + ':label'" (click)="label(s)">Pobierz etykietę</button>
                }
                @if (s.status !== 'DELIVERED') {
                  <button sv-button size="sm" variant="ghost" [loading]="busy() === s.id + ':refresh'" (click)="refresh(s)">Odśwież status</button>
                }
              </div>
            }
          </div>
        }
        @if (canCreate()) {
          <form class="grid gap-3" (ngSubmit)="create()">
            @if (locker()) {
              <sv-field label="Gabaryt" for="sh-tpl">
                <sv-select inputId="sh-tpl" name="tpl" ariaLabel="Gabaryt paczki" [options]="templates" [(ngModel)]="template" />
              </sv-field>
            } @else {
              <sv-field label="Waga (kg)" for="sh-w"><input id="sh-w" name="w" class="sv-input" inputmode="decimal" [(ngModel)]="weightKg" /></sv-field>
              <div class="grid grid-cols-3 gap-2">
                <sv-field label="Dł. (cm)" for="sh-l"><input id="sh-l" name="l" class="sv-input" inputmode="numeric" [(ngModel)]="lengthCm" /></sv-field>
                <sv-field label="Szer. (cm)" for="sh-wd"><input id="sh-wd" name="wd" class="sv-input" inputmode="numeric" [(ngModel)]="widthCm" /></sv-field>
                <sv-field label="Wys. (cm)" for="sh-h"><input id="sh-h" name="h" class="sv-input" inputmode="numeric" [(ngModel)]="heightCm" /></sv-field>
              </div>
            }
            <sv-field label="Nadanie" for="sh-send">
              <sv-select inputId="sh-send" name="send" ariaLabel="Sposób nadania" [options]="sendingOptions" [(ngModel)]="sendingMethod" />
            </sv-field>
            @if (error(); as e) {<sv-alert tone="error">{{ e }}</sv-alert>}
            <button sv-button type="submit" [loading]="busy() === 'create'">{{ shipments().length ? 'Utwórz nową przesyłkę' : 'Utwórz przesyłkę' }}</button>
            @if (order().paymentMethod === 'COD' && order().paymentStatus === 'UNPAID') {
              <p class="text-[12px] text-ink-muted">Przesyłka zostanie nadana za pobraniem na kwotę zamówienia.</p>
            }
          </form>
        } @else if (!shipments().length) {
          <p class="text-[13px] text-ink-muted">Brak przesyłki.</p>
        }
      }
    </sv-card>
  `,
})
export class OrderShipmentsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ShippingApi);
  private readonly toast = inject(ToastService);
  protected readonly canWrite = this.ctx.can('ORDERS_WRITE');
  protected readonly labels = SHIPMENT_STATUS_LABELS;
  protected readonly tone = TONE;

  readonly order = input.required<Order>();
  /** The order changed on the server (tracking number recorded). */
  readonly changed = output<void>();

  protected readonly list = rxResource({
    params: () => ({ t: this.ctx.tenantId(), id: this.order().id }),
    stream: ({ params }) => this.api.shipments(params.t, params.id),
  });
  private readonly local = signal<Shipment[] | null>(null);
  protected readonly shipments = computed(() => this.local() ?? (this.list.hasValue() ? this.list.value() : []));
  protected readonly locker = computed(() => !!this.order().pickupPoint);
  protected readonly canCreate = computed(() => this.canWrite && this.order().status !== 'CANCELED'
    && !this.shipments().some((s) => s.status !== 'FAILED' && s.status !== 'CANCELED'));

  protected readonly templates: SelectOption[] = [
    { value: 'small', label: 'A — mała (8 × 38 × 64 cm)' },
    { value: 'medium', label: 'B — średnia (19 × 38 × 64 cm)' },
    { value: 'large', label: 'C — duża (41 × 38 × 64 cm)' },
  ];
  protected readonly sendingOptions: SelectOption[] = [
    { value: 'PARCEL_LOCKER', label: 'Nadam w paczkomacie' },
    { value: 'COURIER_PICKUP', label: 'Odbiór przez kuriera' },
  ];
  protected template = 'small';
  protected sendingMethod: ShipmentInput['sendingMethod'] = 'PARCEL_LOCKER';
  protected weightKg = '1';
  protected lengthCm = '30';
  protected widthCm = '20';
  protected heightCm = '10';
  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected async create(): Promise<void> {
    let input: ShipmentInput;
    if (this.locker()) {
      input = { template: this.template, weightGrams: null, lengthMm: null, widthMm: null, heightMm: null, sendingMethod: this.sendingMethod };
    } else {
      const w = Number(this.weightKg.replace(',', '.'));
      const dims = [this.lengthCm, this.widthCm, this.heightCm].map((v) => Number(v.replace(',', '.')));
      if (!(w > 0) || dims.some((d) => !(d > 0))) {
        this.error.set('Podaj wagę i wymiary paczki.');
        return;
      }
      input = { template: null, weightGrams: Math.round(w * 1000), lengthMm: Math.round(dims[0] * 10), widthMm: Math.round(dims[1] * 10),
        heightMm: Math.round(dims[2] * 10), sendingMethod: this.sendingMethod };
    }
    this.error.set(null);
    this.busy.set('create');
    try {
      const s = await firstValueFrom(this.api.createShipment(this.ctx.tenantId(), this.order().id, input));
      this.local.set([s, ...this.shipments()]);
      this.toast.success(s.trackingNumber ? `Utworzono przesyłkę ${s.trackingNumber}.` : 'Utworzono przesyłkę — numer pojawi się po przetworzeniu.');
      this.changed.emit();
    } catch (e) {
      this.error.set(ApiError.from(e).message);
      this.list.reload();
      this.local.set(null);
    } finally {
      this.busy.set(null);
    }
  }

  protected async refresh(s: Shipment): Promise<void> {
    this.busy.set(s.id + ':refresh');
    try {
      const updated = await firstValueFrom(this.api.refresh(this.ctx.tenantId(), s.id));
      this.local.set(this.shipments().map((x) => (x.id === s.id ? updated : x)));
      if (updated.trackingNumber !== s.trackingNumber || updated.status !== s.status) this.changed.emit();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  protected async label(s: Shipment): Promise<void> {
    this.busy.set(s.id + ':label');
    try {
      downloadBlob(await firstValueFrom(this.api.label(this.ctx.tenantId(), s.id)), `etykieta-${s.trackingNumber ?? this.order().number}.pdf`);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(null);
    }
  }
}
