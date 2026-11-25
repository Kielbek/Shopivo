import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/** Label + control + hint/error, with accessible ids. */
@Component({
  selector: 'sv-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="sv-label" [attr.for]="for()">{{ label() }}</label>
    <div class="mt-1.5"><ng-content /></div>
    @if (error()) {
      <p class="mt-1.5 text-[12px] text-danger-ink" [id]="for() + '-error'">{{ error() }}</p>
    } @else if (hint()) {
      <p class="mt-1.5 text-[12px] text-ink-muted" [id]="for() + '-hint'">{{ hint() }}</p>
    }
  `,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly for = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  readonly optional = input(false);
}

/**
 * Polish message for the first validation error of a control — shown only after the user touched it
 * (or after a submit attempt marked all as touched). Server-side field errors take precedence.
 */
export function controlError(control: AbstractControl | null, serverError?: string | null): string | null {
  if (serverError) return serverError;
  if (!control || !control.invalid || !(control.touched || control.dirty)) return null;
  const e = control.errors ?? {};
  if (e['required']) return 'To pole jest wymagane.';
  if (e['email']) return 'Podaj prawidłowy adres e-mail.';
  if (e['minlength']) return `Minimalna długość to ${e['minlength'].requiredLength} znaków.`;
  if (e['maxlength']) return `Maksymalna długość to ${e['maxlength'].requiredLength} znaków.`;
  if (e['pattern']) return 'Nieprawidłowy format.';
  if (e['mismatch']) return 'Hasła nie są identyczne.';
  if (e['requiredTrue']) return 'To pole jest wymagane.';
  const custom = Object.values(e).find((v) => typeof v === 'string');
  return typeof custom === 'string' ? custom : 'Nieprawidłowa wartość.';
}
