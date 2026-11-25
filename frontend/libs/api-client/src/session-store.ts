import { Injectable, computed, inject, signal } from '@angular/core';
import { Me } from '@shopivo/shared-models';
import { firstValueFrom } from 'rxjs';
import { ApiError } from './api-error';
import { AuthApi } from './auth-api';

/** Current authenticated user, shared by guards and layouts. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AuthApi);
  private readonly _user = signal<Me | null>(null);
  private readonly _loaded = signal(false);
  private loading: Promise<Me | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly isAuthenticated = computed(() => !!this._user() && !this._user()!.mfaPending);
  readonly isMfaPending = computed(() => !!this._user()?.mfaPending);
  readonly isPlatformStaff = computed(() => !!this._user()?.platformRole && !this._user()!.mfaPending);
  readonly isPlatformAdmin = computed(() => this._user()?.platformRole === 'PLATFORM_ADMIN' && !this._user()!.mfaPending);

  /** Loads the user once; concurrent callers share the request. */
  ensureLoaded(): Promise<Me | null> {
    if (this._loaded()) {
      return Promise.resolve(this._user());
    }
    return (this.loading ??= this.refresh());
  }

  async refresh(): Promise<Me | null> {
    try {
      const me = await firstValueFrom(this.api.me());
      this._user.set(me);
      return me;
    } catch (e) {
      if (ApiError.from(e).status !== 401) {
        console.error('Could not load session', e);
      }
      this._user.set(null);
      return null;
    } finally {
      this._loaded.set(true);
      this.loading = null;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.api.logout());
    } finally {
      this._user.set(null);
    }
  }

  clear(): void {
    this._user.set(null);
  }
}
