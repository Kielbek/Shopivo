import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, SessionStore, StoresApi, TenantApi } from '@shopivo/api-client';
import { SlugAvailability, StoreIndustry } from '@shopivo/shared-models';
import { ButtonComponent, InfoTipComponent, LogoComponent, ToastOutletComponent, ToastService, icons, slugify } from '@shopivo/shared-ui';
import { catchError, debounceTime, distinctUntilChanged, filter, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { IndustryPickerComponent } from '../store/industry-picker';
import { industryOf } from '../catalog/industries';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const POSTAL = /^\d{2}-\d{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_REASONS: Record<string, string> = {
  INVALID: 'Użyj 3–40 znaków: małe litery, cyfry i myślniki (nie na początku i końcu).',
  RESERVED: 'Ten adres jest zarezerwowany. Wybierz inny.',
  TAKEN: 'Ten adres jest już zajęty. Wybierz inny.',
};

/** Polish NIP checksum (same rule as the server). */
export function isValidNip(value: string): boolean {
  const nip = value.replace(/[\s-]/g, '');
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, x, i) => s + x * Number(nip[i]), 0);
  return sum % 11 !== 10 && sum % 11 === Number(nip[9]);
}

type Step = 'name' | 'industry' | 'company' | 'orders';
const STEPS: Step[] = ['name', 'industry', 'company', 'orders'];

/**
 * First-run store wizard: one question per screen on a quiet background — name and address, industry, company details
 * (needed by law before publishing; can be skipped) and where order notifications go. The store is created at the end.
 */
@Component({
  selector: 'sv-create-store-page',
  imports: [RouterLink, LucideDynamicIcon, ButtonComponent, LogoComponent, ToastOutletComponent, InfoTipComponent, IndustryPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-dvh flex-col bg-canvas' },
  styles: `
    .step-in { animation: step-in 260ms cubic-bezier(.2,.7,.2,1) both; }
    @keyframes step-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .step-in { animation: none; } }
    .big { height: 3rem; font-size: 15px; background: var(--color-card); border-color: var(--color-line-strong); }
    .big:focus { background: var(--color-card); }
  `,
  template: `
    <sv-toast-outlet />
    <header class="sticky top-0 z-10 bg-canvas/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <sv-logo />
        @if (!creating()) {
          <span class="text-[13px] text-ink-muted">Krok {{ index() + 1 }} z {{ steps.length }}</span>
          @if (hasStores()) {
            <a routerLink="/sklepy" class="text-[13px] text-ink-soft hover:text-ink">Anuluj</a>
          } @else {
            <button type="button" class="text-[13px] text-ink-soft hover:text-ink" (click)="logout()">Wyloguj</button>
          }
        }
      </div>
      <div class="h-1 bg-line/60" role="progressbar" aria-label="Postęp" [attr.aria-valuenow]="index() + 1" aria-valuemin="1" [attr.aria-valuemax]="steps.length">
        <div class="h-full bg-primary transition-[width] duration-300" [style.width.%]="creating() ? 100 : ((index() + 1) / steps.length) * 100"></div>
      </div>
    </header>

    <main class="flex flex-1 justify-center px-4 pb-16 pt-[8vh] sm:px-6">
      @if (creating()) {
        <section class="step-in w-full max-w-md text-center" aria-live="polite">
          <span class="mx-auto flex size-14 items-center justify-center rounded-full bg-card text-primary shadow-sm"><svg [lucideIcon]="icons.store" [size]="26" /></span>
          <h1 class="mt-5 text-[26px] font-semibold tracking-[-0.02em] text-ink">Tworzymy Twój sklep…</h1>
          <ul class="mx-auto mt-6 w-fit space-y-2 text-left text-[14px]">
            @for (p of progress(); track p.label) {
              <li class="flex items-center gap-2.5" [class]="p.done ? 'text-ink' : 'text-ink-muted'">
                <span class="flex size-5 items-center justify-center rounded-full" [class]="p.done ? 'bg-success text-white' : 'border border-line-strong'">
                  @if (p.done) {<svg [lucideIcon]="icons.check" [size]="12" />}</span>{{ p.label }}
              </li>
            }
          </ul>
        </section>
      } @else {
        <form class="step-in w-full" [class]="step() === 'industry' ? 'max-w-3xl' : 'max-w-xl'" (submit)="$event.preventDefault(); next()" novalidate>
          @switch (step()) {
            @case ('name') {
              <p class="text-[13px] font-medium text-primary-strong">Witaj{{ firstName() ? ', ' + firstName() : '' }}! Zacznijmy od podstaw</p>
              <h1 class="mt-2 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-ink">Jak nazywa się Twój sklep?</h1>
              <p class="mt-2 text-[15px] text-ink-soft">Tę nazwę zobaczą klienci. Możesz ją później zmienić.</p>
              <label class="sr-only" for="name">Nazwa sklepu</label>
              <input #first id="name" class="sv-input big mt-8" maxlength="150" autocomplete="organization" placeholder="np. Pracownia Ceramiki Glina"
                [value]="name()" (input)="setName($any($event.target).value)" [attr.aria-invalid]="!!errors()['name']" aria-describedby="name-err" />
              @if (errors()['name']; as e) {<p id="name-err" class="mt-2 text-[13px] text-danger-ink">{{ e }}</p>}
              <div class="mt-5">
                <label class="text-[13px] font-medium text-ink" for="slug">Adres sklepu w internecie</label>
                <div class="mt-1.5 flex rounded-[var(--radius-control)]">
                  <input id="slug" class="sv-input big rounded-r-none pr-1" maxlength="40" spellcheck="false" autocapitalize="off" [value]="slug()"
                    (input)="setSlug($any($event.target).value)" [attr.aria-invalid]="!!slugError()" aria-describedby="slug-hint" />
                  <span class="inline-flex h-12 items-center whitespace-nowrap rounded-r-[var(--radius-control)] bg-line/70 px-3 text-[14px] text-ink-muted">.{{ domain() }}</span>
                </div>
                <p id="slug-hint" class="mt-2 flex items-center gap-1.5 text-[13px]" [class]="slugError() ? 'text-danger-ink' : available() ? 'text-success-ink' : 'text-ink-muted'">
                  @if (available() && !slugError()) {<svg [lucideIcon]="icons.check" [size]="14" />}
                  {{ slugError() ?? (checking() ? 'Sprawdzamy dostępność…' : available() ? 'Adres jest wolny.' : 'Własną domenę podłączysz później.') }}
                </p>
              </div>
            }
            @case ('industry') {
              <h1 class="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-ink">Co będziesz sprzedawać?</h1>
              <p class="mt-2 text-[15px] text-ink-soft">Dopasujemy podpowiedzi: kategorie, rozmiary i kolory wariantów, typowe paczki. Nie ogranicza to, co sprzedajesz.</p>
              <sv-industry-picker class="mt-8 block" [wide]="true" [(value)]="industry" />
            }
            @case ('company') {
              <h1 class="flex items-center gap-1.5 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-ink">Dane Twojej firmy
                <sv-info-tip label="Po co te dane?" title="Po co te dane?"
                  text="Prawo wymaga, by sklep internetowy pokazywał dane sprzedawcy: nazwę, NIP i adres. Wstawimy je do stopki, regulaminu i e-maili. Bez nich sklepu nie da się opublikować — ale możesz je uzupełnić później w Ustawieniach." /></h1>
              <p class="mt-2 text-[15px] text-ink-soft">Potrzebne do publikacji sklepu. Możesz je też uzupełnić później.</p>
              <div class="mt-8 grid gap-4 sm:grid-cols-2">
                <div class="sm:col-span-2">
                  <label class="text-[13px] font-medium text-ink" for="legal">Pełna nazwa firmy</label>
                  <input #first id="legal" class="sv-input big mt-1.5" maxlength="255" autocomplete="organization" placeholder="np. Pracownia Glina Anna Nowak"
                    [value]="company().legalCompanyName" (input)="patch('legalCompanyName', $any($event.target).value)" />
                </div>
                <div>
                  <label class="text-[13px] font-medium text-ink" for="nip">NIP</label>
                  <input id="nip" class="sv-input big mt-1.5" maxlength="13" inputmode="numeric" placeholder="000-000-00-00" [attr.aria-invalid]="!!errors()['taxId']"
                    [value]="company().taxId" (input)="patch('taxId', $any($event.target).value)" />
                  @if (errors()['taxId']; as e) {<p class="mt-1.5 text-[13px] text-danger-ink">{{ e }}</p>}
                </div>
                <div>
                  <label class="text-[13px] font-medium text-ink" for="phone">Telefon <span class="font-normal text-ink-muted">(opcjonalnie)</span></label>
                  <input id="phone" type="tel" class="sv-input big mt-1.5" maxlength="30" autocomplete="tel" placeholder="+48 600 000 000"
                    [value]="company().phone" (input)="patch('phone', $any($event.target).value)" />
                  @if (errors()['phone']; as e) {<p class="mt-1.5 text-[13px] text-danger-ink">{{ e }}</p>}
                </div>
                <div class="sm:col-span-2">
                  <label class="text-[13px] font-medium text-ink" for="street">Ulica i numer</label>
                  <input id="street" class="sv-input big mt-1.5" maxlength="200" autocomplete="address-line1" placeholder="np. ul. Długa 5/2"
                    [value]="company().addressLine1" (input)="patch('addressLine1', $any($event.target).value)" />
                </div>
                <div>
                  <label class="text-[13px] font-medium text-ink" for="postal">Kod pocztowy</label>
                  <input id="postal" class="sv-input big mt-1.5" maxlength="6" inputmode="numeric" autocomplete="postal-code" placeholder="00-000" [attr.aria-invalid]="!!errors()['postalCode']"
                    [value]="company().postalCode" (input)="setPostal($any($event.target))" />
                  @if (errors()['postalCode']; as e) {<p class="mt-1.5 text-[13px] text-danger-ink">{{ e }}</p>}
                </div>
                <div>
                  <label class="text-[13px] font-medium text-ink" for="city">Miejscowość</label>
                  <input id="city" class="sv-input big mt-1.5" maxlength="100" autocomplete="address-level2"
                    [value]="company().city" (input)="patch('city', $any($event.target).value)" />
                </div>
              </div>
              @if (errors()['company']; as e) {<p class="mt-3 text-[13px] text-danger-ink" role="alert">{{ e }}</p>}
            }
            @case ('orders') {
              <h1 class="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-ink">Ostatni krok — zamówienia</h1>
              <p class="mt-2 text-[15px] text-ink-soft">Gdzie mamy wysyłać powiadomienia o nowych zamówieniach?</p>
              <label class="sr-only" for="orderEmail">E-mail do powiadomień o zamówieniach</label>
              <input #first id="orderEmail" type="email" class="sv-input big mt-8" maxlength="320" autocomplete="email"
                [value]="orderEmail()" (input)="orderEmail.set($any($event.target).value); clearErrors('orderEmail')" [attr.aria-invalid]="!!errors()['orderEmail']" />
              @if (errors()['orderEmail']; as e) {<p class="mt-2 text-[13px] text-danger-ink">{{ e }}</p>}
              <label class="mt-6 flex cursor-pointer items-center justify-between gap-4 rounded-[12px] bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                <span>
                  <span class="block text-[14px] font-medium text-ink">Ceny w sklepie podaję z VAT (brutto)</span>
                  <span class="block text-[13px] text-ink-muted">Tak robi większość sklepów dla klientów indywidualnych. Wyłącz, jeśli wpisujesz ceny netto.</span>
                </span>
                <input type="checkbox" role="switch" class="sv-switch shrink-0" [checked]="pricesIncludeTax()" (change)="pricesIncludeTax.set($any($event.target).checked)" />
              </label>
              <div class="mt-8 rounded-[12px] border border-line bg-card/60 p-4 text-[13px]">
                <p class="font-medium text-ink">Podsumowanie</p>
                <dl class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-ink-soft">
                  <dt>Sklep</dt><dd class="truncate text-ink">{{ name().trim() }} · {{ slug() }}.{{ domain() }}</dd>
                  <dt>Branża</dt><dd class="text-ink">{{ industryLabel() ?? 'nie wybrano' }}</dd>
                  <dt>Firma</dt><dd class="truncate text-ink">{{ companyFilled() ? company().legalCompanyName : 'uzupełnisz później' }}</dd>
                </dl>
              </div>
            }
          }

          @if (error(); as e) {<p class="mt-5 rounded-[10px] bg-danger-soft px-4 py-3 text-[13px] text-danger-ink" role="alert">{{ e }}</p>}

          <div class="sticky bottom-0 -mx-4 mt-10 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur
            sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <button sv-button type="submit" size="lg" class="min-w-36">
              {{ step() === 'orders' ? 'Utwórz sklep' : 'Dalej' }}<svg [lucideIcon]="icons.arrowRight" />
            </button>
            @if (step() === 'industry' && !industry()) {
              <button type="button" class="text-[14px] text-ink-soft hover:text-ink" (click)="go(1)">Pomiń</button>
            }
            @if (step() === 'company') {
              <button type="button" class="text-[14px] text-ink-soft hover:text-ink" (click)="skipCompany()">Uzupełnię później</button>
            }
            <span class="flex-1"></span>
            @if (index() > 0) {
              <button type="button" class="inline-flex items-center gap-1.5 text-[14px] text-ink-soft hover:text-ink" (click)="go(-1)">
                <svg [lucideIcon]="icons.arrowLeft" [size]="16" />Wstecz</button>
            }
          </div>
          <p class="mt-4 hidden text-[12px] text-ink-muted sm:block">Wskazówka: naciśnij Enter, aby przejść dalej.</p>
        </form>
      }
    </main>
  `,
})
export class CreateStorePage {
  private readonly api = inject(StoresApi);
  private readonly tenantApi = inject(TenantApi);
  private readonly session = inject(SessionStore);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly steps = STEPS;
  private readonly firstInput = viewChild<ElementRef<HTMLInputElement>>('first');

  protected readonly config = toSignal(this.api.config().pipe(catchError(() => of(null))), { initialValue: null });
  protected readonly domain = computed(() => this.config()?.platformDomain ?? 'shopivo.pl');
  protected readonly hasStores = toSignal(this.api.myStores().pipe(map((s) => s.length > 0), catchError(() => of(false))), { initialValue: false });

  protected readonly index = signal(0);
  protected readonly step = computed(() => STEPS[this.index()]);
  protected readonly name = signal('');
  protected readonly slug = signal('');
  protected slugEdited = false;
  protected readonly industry = signal<StoreIndustry | null>(null);
  protected readonly company = signal({ legalCompanyName: '', taxId: '', phone: '', addressLine1: '', postalCode: '', city: '' });
  protected readonly orderEmail = signal(this.session.user()?.email ?? '');
  protected readonly pricesIncludeTax = signal(true);
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly availability = signal<SlugAvailability | null>(null);
  protected readonly checking = signal(false);
  protected readonly creating = signal(false);
  protected readonly progress = signal<{ label: string; done: boolean }[]>([]);

  protected readonly firstName = computed(() => this.session.user()?.firstName ?? '');
  protected readonly industryLabel = computed(() => industryOf(this.industry())?.label ?? null);
  protected readonly available = computed(() => {
    const a = this.availability();
    return !!a && a.available && a.slug === this.slug();
  });
  protected readonly slugError = computed(() => {
    const a = this.availability();
    if (a && !a.available && a.slug === this.slug()) return SLUG_REASONS[a.reason ?? 'INVALID'];
    if (this.slug() && !SLUG_PATTERN.test(this.slug()) && this.errors()['slug']) return SLUG_REASONS['INVALID'];
    return this.errors()['slug'] || null;
  });
  protected readonly companyFilled = computed(() => Object.entries(this.company()).some(([k, v]) => k !== 'phone' && v.trim()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    toObservable(this.slug).pipe(
      tap(() => this.availability.set(null)),
      debounceTime(350),
      distinctUntilChanged(),
      filter((slug) => SLUG_PATTERN.test(slug)),
      tap(() => this.checking.set(true)),
      switchMap((slug) => this.api.slugAvailability(slug).pipe(catchError(() => of(null)))),
      takeUntilDestroyed(destroyRef),
    ).subscribe((result) => {
      this.checking.set(false);
      this.availability.set(result);
    });
    // Focus the main field of each step.
    effect(() => {
      this.index();
      const el = this.firstInput();
      queueMicrotask(() => el?.nativeElement.focus());
    });
  }

  protected clearErrors(...keys: string[]): void {
    if (keys.some((k) => this.errors()[k])) this.errors.update((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, ''])) }));
  }

  protected setSlug(value: string): void {
    this.slugEdited = true;
    this.slug.set(value.toLowerCase());
    this.clearErrors('slug');
  }

  protected setName(value: string): void {
    this.name.set(value);
    this.clearErrors('name', 'slug');
    if (!this.slugEdited) this.slug.set(slugify(value).slice(0, 40).replace(/-+$/, ''));
  }

  protected patch(key: keyof ReturnType<typeof this.company>, value: string): void {
    this.company.update((c) => ({ ...c, [key]: value }));
    this.clearErrors(key, 'company');
  }

  /** Formats "31001" as "31-001" while typing. */
  protected setPostal(el: HTMLInputElement): void {
    const digits = el.value.replace(/\D/g, '').slice(0, 5);
    const value = digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
    el.value = value;
    this.patch('postalCode', value);
  }

  protected go(delta: number): void {
    this.error.set(null);
    this.index.update((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)));
  }

  protected skipCompany(): void {
    this.company.set({ legalCompanyName: '', taxId: '', phone: '', addressLine1: '', postalCode: '', city: '' });
    this.errors.set({});
    this.go(1);
  }

  protected next(): void {
    const errs = this.validate(this.step());
    this.errors.set(errs);
    if (Object.values(errs).some(Boolean)) return;
    if (this.step() === 'orders') void this.create();
    else this.go(1);
  }

  private validate(step: Step): Record<string, string> {
    const e: Record<string, string> = {};
    if (step === 'name') {
      const n = this.name().trim();
      if (n.length < 2) e['name'] = 'Podaj nazwę sklepu (co najmniej 2 znaki).';
      if (!SLUG_PATTERN.test(this.slug())) e['slug'] = SLUG_REASONS['INVALID'];
      else if (this.availability() && !this.availability()!.available && this.availability()!.slug === this.slug()) {
        e['slug'] = SLUG_REASONS[this.availability()!.reason ?? 'INVALID'];
      }
    } else if (step === 'company' && this.companyFilled()) {
      const c = this.company();
      if (c.taxId.trim() && !isValidNip(c.taxId)) e['taxId'] = 'Nieprawidłowy NIP — sprawdź cyfry.';
      if (c.postalCode.trim() && !POSTAL.test(c.postalCode.trim())) e['postalCode'] = 'Kod pocztowy w formacie 00-000.';
      if (c.phone.trim() && !/^\+?[0-9 ()-]{6,30}$/.test(c.phone.trim())) e['phone'] = 'Nieprawidłowy numer telefonu.';
      const missing = !c.legalCompanyName.trim() || !c.taxId.trim() || !c.addressLine1.trim() || !c.postalCode.trim() || !c.city.trim();
      if (missing && !Object.keys(e).length) e['company'] = 'Uzupełnij wszystkie pola (telefon jest opcjonalny) albo kliknij „Uzupełnię później”.';
    } else if (step === 'orders') {
      if (!EMAIL.test(this.orderEmail().trim())) e['orderEmail'] = 'Podaj prawidłowy adres e-mail.';
    }
    return e;
  }

  private async create(): Promise<void> {
    this.creating.set(true);
    this.error.set(null);
    const steps = ['Zakładamy sklep i adres', 'Zapisujemy dane firmy', 'Przygotowujemy panel'];
    this.progress.set(steps.map((label) => ({ label, done: false })));
    const done = (i: number) => this.progress.update((p) => p.map((x, j) => (j <= i ? { ...x, done: true } : x)));
    let tenantId: string;
    try {
      tenantId = (await firstValueFrom(this.api.create(this.name().trim(), this.slug(), this.industry()))).tenantId;
      done(0);
    } catch (e) {
      const err = ApiError.from(e);
      this.creating.set(false);
      if (err.code === 'SLUG_TAKEN') {
        this.availability.set({ slug: this.slug(), available: false, reason: 'TAKEN' });
        this.index.set(0);
      } else {
        this.error.set(err.message);
      }
      return;
    }
    // The store exists now; settings are best-effort — any problem is fixed later in Settings, not by re-creating.
    try {
      const current = await firstValueFrom(this.tenantApi.settings(tenantId));
      const c = this.company();
      const blank = (s: string) => (s.trim() ? s.trim() : null);
      await firstValueFrom(this.tenantApi.updateSettings(tenantId, {
        ...current, legalCompanyName: blank(c.legalCompanyName), taxId: blank(c.taxId), addressLine1: blank(c.addressLine1),
        postalCode: blank(c.postalCode), city: blank(c.city), phone: blank(c.phone), countryCode: 'PL',
        orderEmail: blank(this.orderEmail()), pricesIncludeTax: this.pricesIncludeTax(),
      }));
    } catch (e) {
      this.toast.error(`Sklep utworzony, ale nie zapisaliśmy danych firmy: ${ApiError.from(e).message} Uzupełnij je w Ustawieniach.`);
    }
    done(1);
    done(2);
    await this.router.navigate(['/sklep', tenantId]);
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/logowanie']);
  }
}
