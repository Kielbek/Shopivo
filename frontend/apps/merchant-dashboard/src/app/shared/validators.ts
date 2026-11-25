import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Group validator: `confirm` must equal `password`. Sets the error on the confirm control. */
export function matchingPasswords(password = 'password', confirm = 'confirmPassword'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const p = group.get(password);
    const c = group.get(confirm);
    if (!p || !c) return null;
    const mismatch = !!c.value && p.value !== c.value;
    const errors = { ...(c.errors ?? {}) };
    if (mismatch) {
      errors['mismatch'] = true;
    } else {
      delete errors['mismatch'];
    }
    c.setErrors(Object.keys(errors).length ? errors : null);
    return null;
  };
}

/** Mirrors the backend minimum (full policy is enforced server-side). */
export const PASSWORD_MIN_LENGTH = 10;
