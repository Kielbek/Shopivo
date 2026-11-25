import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError, StoresApi } from '@shopivo/api-client';
import { SlugAvailability } from '@shopivo/shared-models';
import { AlertComponent, ButtonComponent, FieldComponent, controlError, slugify } from '@shopivo/shared-ui';
import { catchError, debounceTime, distinctUntilChanged, filter, firstValueFrom, of, switchMap, tap } from 'rxjs';
import { TopBar } from './top-bar';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const REASONS: Record<string, string> = {
  INVALID: 'Użyj 3–40 znaków: małe litery, cyfry i myślniki (nie na początku i końcu).',
  RESERVED: 'Ten adres jest zarezerwowany. Wybierz inny.',
  TAKEN: 'Ten adres jest już zajęty.',
};

@Component({
  selector: 'sv-create-store-page',
  imports: [ReactiveFormsModule, RouterLink, AlertComponent, ButtonComponent, FieldComponent, TopBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-top-bar />
    <main class="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <p class="text-[12px] font-medium uppercase tracking-wide text-brand-700">Nowy sklep</p>
      <h1 class="mt-1 text-[24px] font-semibold tracking-[-0.01em]">Jak nazywa się Twój sklep?</h1>
      <p class="mt-2 text-[14px] text-zinc-600">
        Nazwę możesz później zmienić. Adres w domenie Shopivo jest stały — własną domenę podłączysz w ustawieniach.
      </p>
      @if (error(); as e) {<sv-alert tone="error" class="mt-6">{{ e.message }}</sv-alert>}
      <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-5" novalidate>
        <sv-field label="Nazwa sklepu" for="name" [error]="nameError()">
          <input id="name" class="sv-input" formControlName="name" maxlength="150" autocomplete="organization"
            [attr.aria-invalid]="!!nameError()" />
        </sv-field>
        <sv-field label="Adres sklepu" for="slug" [error]="slugError()" [hint]="slugHint()">
          <div class="flex rounded-[var(--radius-ui)]">
            <input id="slug" class="sv-input rounded-r-none" formControlName="slug" maxlength="40" spellcheck="false"
              autocapitalize="off" [attr.aria-invalid]="!!slugError()" (input)="slugEdited = true" />
            <span class="inline-flex items-center rounded-r-[var(--radius-ui)] border border-l-0 border-zinc-300 bg-zinc-50 px-3 text-[13px] text-zinc-600">
              .{{ config()?.platformDomain ?? '…' }}
            </span>
          </div>
        </sv-field>
        <div class="flex items-center gap-3 pt-2">
          <button sv-button type="submit" size="lg" [loading]="submitting()">Utwórz sklep</button>
          <a routerLink="/sklepy" class="text-[13px] text-zinc-600 hover:text-zinc-900">Anuluj</a>
        </div>
      </form>
    </main>
  `,
})
export class CreateStorePage {
  private readonly api = inject(StoresApi);
  private readonly router = inject(Router);
  protected readonly config = toSignal(this.api.config().pipe(catchError(() => of(null))), { initialValue: null });
  protected slugEdited = false;

  protected readonly submitting = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly availability = signal<SlugAvailability | null>(null);
  protected readonly checking = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(150)]],
    slug: ['', [Validators.required, Validators.pattern(SLUG_PATTERN)]],
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.form.controls.name.valueChanges.pipe(takeUntilDestroyed(destroyRef)).subscribe((name) => {
      if (!this.slugEdited) {
        this.form.controls.slug.setValue(slugify(name));
      }
    });
    this.form.controls.slug.valueChanges
      .pipe(
        tap(() => this.availability.set(null)),
        debounceTime(350),
        distinctUntilChanged(),
        filter((slug) => SLUG_PATTERN.test(slug)),
        tap(() => this.checking.set(true)),
        switchMap((slug) => this.api.slugAvailability(slug).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(destroyRef),
      )
      .subscribe((result) => {
        this.checking.set(false);
        this.availability.set(result);
      });
  }

  protected nameError(): string | null {
    return controlError(this.form.controls.name);
  }

  protected slugError(): string | null {
    const a = this.availability();
    if (a && !a.available && a.slug === this.form.controls.slug.value) {
      return REASONS[a.reason ?? 'INVALID'];
    }
    const c = this.form.controls.slug;
    if (c.errors?.['pattern'] && (c.touched || c.dirty)) return REASONS['INVALID'];
    return controlError(c);
  }

  protected slugHint(): string {
    if (this.checking()) return 'Sprawdzamy dostępność…';
    const a = this.availability();
    if (a?.available) return `Adres ${a.slug}.${this.config()?.platformDomain ?? ''} jest dostępny.`;
    return 'Małe litery, cyfry i myślniki.';
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const { name, slug } = this.form.getRawValue();
      const store = await firstValueFrom(this.api.create(name.trim(), slug));
      await this.router.navigate(['/sklep', store.tenantId]);
    } catch (e) {
      const error = ApiError.from(e);
      if (error.code === 'SLUG_TAKEN') {
        this.availability.set({ slug: this.form.controls.slug.value, available: false, reason: 'TAKEN' });
      } else {
        this.error.set(error);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
