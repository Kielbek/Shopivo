import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, StoresApi, TenantApi } from '@shopivo/api-client';
import { MyStore, Store, StorePermission } from '@shopivo/shared-models';
import { firstValueFrom } from 'rxjs';

/** State of the store currently opened in the dashboard. Provided by the store shell. */
@Injectable()
export class StoreContext {
  private readonly storesApi = inject(StoresApi);
  private readonly tenantApi = inject(TenantApi);

  private readonly _membership = signal<MyStore | null>(null);
  private readonly _store = signal<Store | null>(null);
  private readonly _allStores = signal<MyStore[]>([]);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(true);

  readonly membership = this._membership.asReadonly();
  readonly store = this._store.asReadonly();
  readonly allStores = this._allStores.asReadonly();
  readonly tenantId = computed(() => this._membership()?.tenantId ?? '');

  can(permission: StorePermission): boolean {
    return this._membership()?.permissions.includes(permission) ?? false;
  }

  async load(tenantId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const stores = await firstValueFrom(this.storesApi.myStores());
      this._allStores.set(stores);
      const membership = stores.find((s) => s.tenantId === tenantId && s.tenantStatus === 'ACTIVE');
      if (!membership) {
        throw new ApiError(404, 'NOT_FOUND', 'Nie znaleziono sklepu lub nie masz do niego dostępu.');
      }
      this._membership.set(membership);
      this._store.set(await firstValueFrom(this.tenantApi.store(tenantId)));
    } catch (e) {
      this._membership.set(null);
      this._store.set(null);
      this.error.set(ApiError.from(e));
    } finally {
      this.loading.set(false);
    }
  }

  updateStore(store: Store): void {
    this._store.set(store);
    this._membership.update((m) => (m ? { ...m, name: store.name } : m));
  }
}
