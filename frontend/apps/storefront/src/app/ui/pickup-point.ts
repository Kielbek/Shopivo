import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { PickupPointOption, StorefrontApi } from '../storefront-api';

/** Parcel locker choice for a shipping method: search by postal code or city, or type the locker code. */
@Component({
  selector: 'sf-pickup-point',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt-3 rounded-[10px] border border-sf-line p-4">
      <p class="text-[14px] font-medium">Wybierz paczkomat</p>
      @if (code()) {
        <p class="mt-2 text-[14px]" role="status">Wybrano: <strong class="font-semibold">{{ code() }}</strong>@if (chosenAddress()) { — {{ chosenAddress() }}}
          <button type="button" class="sf-link ml-2 text-[13px]" (click)="code.set(''); chosenAddress.set(null)">zmień</button></p>
      } @else {
        <form class="mt-2 flex gap-2" (submit)="$event.preventDefault(); search()">
          <label class="sr-only" for="pp-q">Kod pocztowy lub miasto</label>
          <input id="pp-q" name="pp-q" class="sf-input !h-10" placeholder="Kod pocztowy lub miasto, np. 30-001" maxlength="60" [(ngModel)]="query" />
          <button type="submit" class="sf-btn-outline !h-10 shrink-0" [disabled]="busy()">Szukaj</button>
        </form>
        @if (error(); as e) {<p class="mt-2 text-[13px] text-sf-danger" role="alert">{{ e }}</p>}
        @if (results().length) {
          <ul class="mt-3 max-h-64 space-y-1.5 overflow-y-auto" aria-label="Paczkomaty">
            @for (p of results(); track p.code) {
              <li>
                <button type="button" class="w-full rounded-[8px] border border-sf-line px-3 py-2 text-left text-[14px] hover:border-sf-text" (click)="choose(p)">
                  <span class="font-semibold">{{ p.code }}</span> · {{ p.address }}
                  @if (p.description) {<span class="block text-[12px] text-sf-muted">{{ p.description }}</span>}
                </button>
              </li>
            }
          </ul>
        } @else if (searched() && !busy() && !error()) {
          <p class="mt-2 text-[13px] text-sf-muted">Nie znaleźliśmy paczkomatów — spróbuj innej frazy albo wpisz kod paczkomatu.</p>
        }
        <div class="mt-3 flex items-end gap-2">
          <div class="flex-1"><label class="sf-label" for="pp-code">…albo wpisz kod paczkomatu</label>
            <input id="pp-code" name="pp-code" class="sf-input !h-10 uppercase" placeholder="np. KRA010" maxlength="12" [(ngModel)]="manual" /></div>
          <button type="button" class="sf-btn-outline !h-10" [disabled]="!manual.trim()" (click)="code.set(manual.trim().toUpperCase())">Wybierz</button>
        </div>
      }
    </div>
  `,
})
export class PickupPointComponent {
  private readonly api = inject(StorefrontApi);
  readonly methodId = input.required<string>();
  /** Chosen locker code (validated by the server at checkout). */
  readonly code = model('');
  protected readonly chosenAddress = signal<string | null>(null);
  protected query = '';
  protected manual = '';
  protected readonly results = signal<PickupPointOption[]>([]);
  protected readonly busy = signal(false);
  protected readonly searched = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async search(): Promise<void> {
    const q = this.query.trim();
    if (q.length < 2) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.results.set(await firstValueFrom(this.api.pickupPoints(this.methodId(), q)));
    } catch (e) {
      this.results.set([]);
      this.error.set((e as { error?: { detail?: string } }).error?.detail ?? 'Nie udało się wyszukać paczkomatów. Wpisz kod paczkomatu.');
    } finally {
      this.busy.set(false);
      this.searched.set(true);
    }
  }

  protected choose(p: PickupPointOption): void {
    this.code.set(p.code);
    this.chosenAddress.set(p.address);
  }
}
