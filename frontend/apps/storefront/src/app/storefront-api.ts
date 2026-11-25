import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface PublicStore {
  name: string;
  status: 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';
  locale: string;
  currency: string;
  hostname: string;
}

@Injectable({ providedIn: 'root' })
export class StorefrontApi {
  private readonly http = inject(HttpClient);

  store(): Observable<PublicStore> {
    return this.http.get<PublicStore>('/api/v1/storefront/store');
  }
}
