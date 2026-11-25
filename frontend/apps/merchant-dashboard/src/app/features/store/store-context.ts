import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, BillingApi, StoresApi, TenantApi } from '@shopivo/api-client';
import { MyStore, Store, StorePermission, Subscription } from '@shopivo/shared-models';
import { firstValueFrom } from 'rxjs';

/** State of the store currently opened in the dashboard. Provided by the store shell. */
@Injectable()
export class StoreContext {
  private readonly storesApi = inject(StoresApi);
  private readonly tenantApi = inject(TenantApi);
  private readonly billingApi = inject(BillingApi);

  private readonly _membership = signal<MyStore | null>(null);
  private readonly _store = signal<Store | null>(null);
  private readonly _allStores = signal<MyStore[]>([]);
  private readonly _subscription = signal<Subscription | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(true);

  readonly membership = this._membership.asReadonly();
  readonly store = this._store.asReadonly();
  readonly allStores = this._allStores.asReadonly();
  /** Subscription summary for status banners; null while loading or when it could not be read. */
  readonly subscription = this._subscription.asReadonly();
  readonly readOnly = computed(() => this._subscription()?.access === 'READ_ONLY');
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
      void this.refreshSubscription();
    } catch (e) {
      this._membership.set(null);
      this._store.set(null);
      this.error.set(ApiError.from(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads the subscription (after a payment or plan change). Failures only hide the banner. */
  async refreshSubscription(): Promise<Subscription | null> {
    const tenantId = this.tenantId();
    if (!tenantId) return null;
    try {
      const sub = await firstValueFrom(this.billingApi.subscription(tenantId));
      this._subscription.set(sub);
      return sub;
    } catch {
      this._subscription.set(null);
      return null;
    }
  }

  setSubscription(sub: Subscription): void {
    this._subscription.set(sub);
  }

  updateStore(store: Store): void {
    this._store.set(store);
    this._membership.update((m) => (m ? { ...m, name: store.name } : m));
  }
}
