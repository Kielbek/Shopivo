import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ProductImage, PublishReadiness, Store, ThemeResponse, ThemeState } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

/** Store publication, theme and product images (merchant panel). */
@Injectable({ providedIn: 'root' })
export class StorefrontAdminApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}`;
  }

  readiness(t: string): Observable<PublishReadiness> {
    return this.http.get<PublishReadiness>(`${this.base(t)}/store/publish-readiness`);
  }

  publish(t: string): Observable<Store> {
    return this.http.post<Store>(`${this.base(t)}/store/publish`, null);
  }

  unpublish(t: string): Observable<Store> {
    return this.http.post<Store>(`${this.base(t)}/store/unpublish`, null);
  }

  previewLink(t: string): Observable<{ token: string; url: string }> {
    return this.http.post<{ token: string; url: string }>(`${this.base(t)}/store/preview-token`, null);
  }

  theme(t: string): Observable<ThemeResponse> {
    return this.http.get<ThemeResponse>(`${this.base(t)}/theme`);
  }

  saveTheme(t: string, code: string, settings: Record<string, string>, version: number): Observable<ThemeState> {
    return this.http.put<ThemeState>(`${this.base(t)}/theme`, { code, settings, version });
  }

  publishTheme(t: string): Observable<ThemeState> {
    return this.http.post<ThemeState>(`${this.base(t)}/theme/publish`, null);
  }

  uploadImage(t: string, productId: string, file: File, alt: string | null): Observable<ProductImage> {
    const form = new FormData();
    form.append('file', file);
    if (alt) form.append('alt', alt);
    return this.http.post<ProductImage>(`${this.base(t)}/products/${encodeURIComponent(productId)}/images`, form);
  }

  updateImages(t: string, productId: string, order: string[] | null, alts: Record<string, string> | null): Observable<ProductImage[]> {
    return this.http.put<ProductImage[]>(`${this.base(t)}/products/${encodeURIComponent(productId)}/images`, { order, alts });
  }

  deleteImage(t: string, productId: string, imageId: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`);
  }
}
