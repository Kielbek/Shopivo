import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session-store';

/** Requires a fully authenticated session (password + MFA if enabled). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const user = await session.ensureLoaded();
  if (!user) {
    return router.createUrlTree(['/logowanie'], { queryParams: { powrot: state.url } });
  }
  if (user.mfaPending) {
    return router.createUrlTree(['/logowanie/weryfikacja'], { queryParams: { powrot: state.url } });
  }
  return true;
};

/** Only for anonymous visitors (login, register). Logged-in users go to the start page. */
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const user = await session.ensureLoaded();
  if (user && !user.mfaPending) {
    return router.createUrlTree(['/']);
  }
  return true;
};

/** Second login step: only reachable with a session waiting for MFA. */
export const mfaPendingGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const user = await session.ensureLoaded();
  if (!user) return router.createUrlTree(['/logowanie']);
  if (!user.mfaPending) return router.createUrlTree(['/']);
  return true;
};

/** Platform staff only (super-admin app). */
export const platformStaffGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const user = await session.ensureLoaded();
  if (!user) return router.createUrlTree(['/logowanie'], { queryParams: { powrot: state.url } });
  if (user.mfaPending) return router.createUrlTree(['/logowanie/weryfikacja']);
  if (!user.platformRole) return router.createUrlTree(['/brak-dostepu']);
  return true;
};

/** Accepts only same-app relative paths for post-login redirects (prevents open redirects). */
export function safeReturnUrl(value: string | null | undefined, fallback = '/'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return fallback;
  }
  return value;
}
