import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { StoreIndustry } from '@shopivo/shared-models';
import { CardComponent, FieldComponent, InfoTipComponent, icons } from '@shopivo/shared-ui';
import { PACKAGE_PRESETS, PackagePreset, industryOf } from './industries';

/** "1,5" → 1.5; empty → null; invalid → NaN. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Grams shown as kilograms ("1,25"), millimetres as centimetres ("38"), both with a Polish decimal comma. */
export function toDisplay(value: number | null, divisor: number): string {
  if (value === null) return '';
  return String(Math.round((value / divisor) * 1000) / 1000).replace('.', ',');
}

/**
 * Parcel weight and size with ready-made sizes (envelope, small, medium…) and the one typical for the store's industry
 * marked. The merchant types kilograms and centimetres; the product stores grams and millimetres.
 */
@Component({
  selector: 'sv-parcel-fields',
  imports: [LucideDynamicIcon, CardComponent, FieldComponent, InfoTipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-card>
      <h2 class="flex items-center gap-1 text-[15px] font-semibold text-ink">Paczka
        <sv-info-tip title="Po co waga i wymiary?" label="Po co waga i wymiary paczki?"
          text="Przewoźnicy liczą cenę i dobierają gabaryt (np. paczkomat A, B lub C) na podstawie wagi i wymiarów. Podaj je dla produktu zapakowanego do wysyłki — razem z kartonem i wypełniaczem. Nie wiesz dokładnie? Wybierz najbliższy rozmiar poniżej i popraw później." />
      </h2>
      <p class="mt-0.5 text-[12px] text-ink-muted">Wybierz najbliższy rozmiar — wystarczy w przybliżeniu. Waga z opakowaniem.</p>

      <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="group" aria-label="Typowe rozmiary paczek">
        @for (p of presets; track p.id) {
          <button type="button" [disabled]="disabled()"
            class="relative rounded-[10px] border p-2.5 text-left transition-[border-color,background-color] disabled:opacity-60"
            [class]="isActive(p) ? 'border-primary bg-primary-soft' : 'border-line bg-card hover:border-line-strong hover:bg-hover'"
            [attr.aria-pressed]="isActive(p)" (click)="apply(p)">
            @if (p.id === suggested()) {<span class="absolute -top-2 right-2 rounded-full bg-primary px-1.5 text-[10px] font-medium leading-4 text-white">typowa</span>}
            <span class="flex items-center gap-1.5 text-[13px] font-medium text-ink"><svg [lucideIcon]="icons.box" [size]="14" class="text-ink-muted" />{{ p.label }}</span>
            <span class="mt-0.5 block text-[11px] leading-4 text-ink-muted">do {{ kg(p.weightGrams) }} kg · {{ cm(p.lengthMm) }}×{{ cm(p.widthMm) }}×{{ cm(p.heightMm) }} cm</span>
            <span class="mt-0.5 block text-[11px] leading-4 text-ink-muted">{{ p.hint }}</span>
          </button>
        }
      </div>

      <fieldset class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4" [disabled]="disabled()">
        <legend class="sr-only">Waga i wymiary</legend>
        <sv-field label="Waga z opakowaniem" for="parcel-w">
          <div class="relative"><input id="parcel-w" class="sv-input pr-9" inputmode="decimal" placeholder="np. 0,5" [value]="kgText()" (change)="setWeight($any($event.target).value)" />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">kg</span></div>
        </sv-field>
        <sv-field label="Długość" for="parcel-l">
          <div class="relative"><input id="parcel-l" class="sv-input pr-9" inputmode="decimal" placeholder="np. 30" [value]="cmText(length())" (change)="setDim(length, $any($event.target).value)" />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">cm</span></div>
        </sv-field>
        <sv-field label="Szerokość" for="parcel-wd">
          <div class="relative"><input id="parcel-wd" class="sv-input pr-9" inputmode="decimal" placeholder="np. 20" [value]="cmText(width())" (change)="setDim(width, $any($event.target).value)" />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">cm</span></div>
        </sv-field>
        <sv-field label="Wysokość" for="parcel-h">
          <div class="relative"><input id="parcel-h" class="sv-input pr-9" inputmode="decimal" placeholder="np. 10" [value]="cmText(height())" (change)="setDim(height, $any($event.target).value)" />
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ink-muted">cm</span></div>
        </sv-field>
      </fieldset>
      @if (error()) {<p class="mt-2 text-[12px] text-danger-ink" role="alert">{{ error() }}</p>}
      @if (lockerFit(); as fit) {<p class="mt-2 text-[12px] text-ink-muted">{{ fit }}</p>}
      @if (variantsNote()) {<p class="mt-2 text-[12px] text-ink-muted">Wartości dotyczą wszystkich wariantów.</p>}
    </sv-card>
  `,
})
export class ParcelFieldsComponent {
  protected readonly icons = icons;
  protected readonly presets = PACKAGE_PRESETS;
  /** Grams / millimetres. */
  readonly weight = model<number | null>(null);
  readonly length = model<number | null>(null);
  readonly width = model<number | null>(null);
  readonly height = model<number | null>(null);
  readonly industry = input<StoreIndustry | null>(null);
  readonly disabled = input(false);
  readonly variantsNote = input(false);
  protected readonly error = signal<string | null>(null);

  protected readonly suggested = computed(() => industryOf(this.industry())?.parcel ?? null);
  protected readonly kgText = computed(() => toDisplay(this.weight(), 1000));

  /** Which InPost locker size fits (A 8×38×64, B 19×38×64, C 41×38×64 cm, up to 25 kg). */
  protected readonly lockerFit = computed(() => {
    const dims = [this.length(), this.width(), this.height()];
    if (dims.some((d) => d === null) || this.weight() === null) return null;
    const [a, b, c] = (dims as number[]).map((d) => d / 10).sort((x, y) => x - y);
    if (this.weight()! > 25000 || b > 38 || c > 64) return 'Za duża do paczkomatu — tylko kurier.';
    const size = a <= 8 ? 'A (mała)' : a <= 19 ? 'B (średnia)' : a <= 41 ? 'C (duża)' : null;
    return size ? `Zmieści się w paczkomacie — gabaryt ${size}.` : 'Za duża do paczkomatu — tylko kurier.';
  });

  protected kg(g: number): string {
    return toDisplay(g, 1000);
  }

  protected cm(mm: number): string {
    return toDisplay(mm, 10);
  }

  protected cmText(mm: number | null): string {
    return toDisplay(mm, 10);
  }

  protected isActive(p: PackagePreset): boolean {
    return this.weight() === p.weightGrams && this.length() === p.lengthMm && this.width() === p.widthMm && this.height() === p.heightMm;
  }

  protected apply(p: PackagePreset): void {
    this.error.set(null);
    this.weight.set(p.weightGrams);
    this.length.set(p.lengthMm);
    this.width.set(p.widthMm);
    this.height.set(p.heightMm);
  }

  protected setWeight(text: string): void {
    const v = parseDecimal(text);
    if (Number.isNaN(v)) return this.error.set('Podaj wagę jako liczbę, np. 0,5 (kg).');
    this.error.set(null);
    this.weight.set(v === null ? null : Math.round(v * 1000));
  }

  protected setDim(target: { set(v: number | null): void }, text: string): void {
    const v = parseDecimal(text);
    if (Number.isNaN(v)) return this.error.set('Podaj wymiar w centymetrach, np. 30.');
    this.error.set(null);
    target.set(v === null ? null : Math.round(v * 10));
  }
}
