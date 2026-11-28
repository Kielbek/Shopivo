import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ProductImage, PublishReadiness, Store, TemplateResponse, TemplateState, TemplateStoreDoc, ThemeResponse, ThemeState, ThemeSection,
} from '@shopivo/shared-models';
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

  /** Template package (engine v2): schemas, defaults and the store's draft/published document. */
  template(t: string): Observable<TemplateResponse> {
    return this.http.get<TemplateResponse>(`${this.base(t)}/template`);
  }

  saveTemplateDraft(t: string, doc: TemplateStoreDoc, version: number): Observable<TemplateState> {
    return this.http.put<TemplateState>(`${this.base(t)}/template/draft`, { doc, version });
  }

  publishTemplate(t: string): Observable<TemplateState> {
    return this.http.post<TemplateState>(`${this.base(t)}/template/publish`, null);
  }

  restoreTemplateVersion(t: string, id: string, version: number): Observable<TemplateState> {
    return this.http.post<TemplateState>(`${this.base(t)}/template/versions/${encodeURIComponent(id)}/restore`, { version });
  }

  theme(t: string): Observable<ThemeResponse> {
    return this.http.get<ThemeResponse>(`${this.base(t)}/theme`);
  }

  themeImages(t: string): Observable<ProductImage[]> {
    return this.http.get<ProductImage[]>(`${this.base(t)}/theme/images`);
  }

  uploadThemeImage(t: string, file: File): Observable<ProductImage> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ProductImage>(`${this.base(t)}/theme/images`, form);
  }

  deleteThemeImage(t: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/theme/images/${encodeURIComponent(id)}`);
  }

  /** Adds the template's example products to the store as ordinary products; returns how many were created. */
  importSampleProducts(t: string, code: string): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`${this.base(t)}/theme/sample-products`, { code });
  }

  saveTheme(t: string, code: string, settings: Record<string, string>, version: number, sections: ThemeSection[] | null = null): Observable<ThemeState> {
    return this.http.put<ThemeState>(`${this.base(t)}/theme`, { code, settings, sections, version });
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
