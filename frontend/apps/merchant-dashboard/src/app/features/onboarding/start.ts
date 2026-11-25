import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StoresApi } from '@shopivo/api-client';
import { catchError, map, of } from 'rxjs';

/** Entry point "/": no store → onboarding, one store → its dashboard, several → picker. */
export const startRedirect: CanActivateFn = () => {
  const router = inject(Router);
  return inject(StoresApi).myStores().pipe(
    map((stores) => {
      if (stores.length === 0) return router.createUrlTree(['/nowy-sklep']);
      if (stores.length === 1) return router.createUrlTree(['/sklep', stores[0].tenantId]);
      return router.createUrlTree(['/sklepy']);
    }),
    catchError(() => of(router.createUrlTree(['/sklepy']))),
  );
};
