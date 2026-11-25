import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Brand, CatalogStats, Category, InventoryRow, MovementReason, Page, Product, ProductRow, ProductStatus, ProductType, StockMovement,
} from '@shopivo/shared-models';
import { Observable } from 'rxjs';

export interface VariantInput {
  id?: string | null; optionValues: Record<string, string>; sku: string | null; ean: string | null; priceMinor: number;
  compareAtMinor: number | null; costMinor: number | null; weightGrams: number | null; lengthMm: number | null;
  widthMm: number | null; heightMm: number | null; trackInventory: boolean; allowBackorder: boolean; initialStock: number | null;
}

export interface ProductInput {
  name: string; slug: string | null; description: string | null; status: ProductStatus; type: ProductType; brandId: string | null;
  vatRateBps: number; categoryIds: string[]; seoTitle: string | null; seoDescription: string | null;
  options: { name: string; values: string[] }[]; variants: VariantInput[]; version: number;
}

export interface CategoryInput {
  name: string; slug: string | null; description: string | null; parentId: string | null; position: number | null;
  visible: boolean; seoTitle: string | null; seoDescription: string | null; version: number;
}

export interface ProductQuery {
  q?: string; status?: ProductStatus | null; categoryId?: string | null; lowStock?: boolean; sort?: string; page: number; size?: number;
}

/** Catalogue of one store. The backend checks membership and permissions on every call. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly http = inject(HttpClient);

  private base(tenantId: string): string {
    return `/api/v1/tenants/${encodeURIComponent(tenantId)}`;
  }

  products(tenantId: string, query: ProductQuery): Observable<Page<ProductRow>> {
    let params = new HttpParams().set('page', query.page).set('size', query.size ?? 25);
    if (query.q?.trim()) params = params.set('q', query.q.trim());
    if (query.status) params = params.set('status', query.status);
    if (query.categoryId) params = params.set('categoryId', query.categoryId);
    if (query.lowStock) params = params.set('lowStock', true);
    if (query.sort) params = params.set('sort', query.sort);
    return this.http.get<Page<ProductRow>>(`${this.base(tenantId)}/products`, { params });
  }

  stats(tenantId: string): Observable<CatalogStats> {
    return this.http.get<CatalogStats>(`${this.base(tenantId)}/products/stats`);
  }

  product(tenantId: string, id: string): Observable<Product> {
    return this.http.get<Product>(`${this.base(tenantId)}/products/${encodeURIComponent(id)}`);
  }

  createProduct(tenantId: string, input: ProductInput): Observable<Product> {
    return this.http.post<Product>(`${this.base(tenantId)}/products`, input);
  }

  updateProduct(tenantId: string, id: string, input: ProductInput): Observable<Product> {
    return this.http.put<Product>(`${this.base(tenantId)}/products/${encodeURIComponent(id)}`, input);
  }

  duplicateProduct(tenantId: string, id: string): Observable<Product> {
    return this.http.post<Product>(`${this.base(tenantId)}/products/${encodeURIComponent(id)}/duplicate`, null);
  }

  deleteProduct(tenantId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(tenantId)}/products/${encodeURIComponent(id)}`);
  }

  bulk(tenantId: string, ids: string[], action: 'ACTIVATE' | 'DRAFT' | 'ARCHIVE' | 'DELETE'): Observable<{ affected: number }> {
    return this.http.post<{ affected: number }>(`${this.base(tenantId)}/products/bulk`, { ids, action });
  }

  exportCsv(tenantId: string): Observable<Blob> {
    return this.http.get(`${this.base(tenantId)}/products/export.csv`, { responseType: 'blob' });
  }

  categories(tenantId: string): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.base(tenantId)}/categories`);
  }

  createCategory(tenantId: string, input: CategoryInput): Observable<Category> {
    return this.http.post<Category>(`${this.base(tenantId)}/categories`, input);
  }

  updateCategory(tenantId: string, id: string, input: CategoryInput): Observable<Category> {
    return this.http.put<Category>(`${this.base(tenantId)}/categories/${encodeURIComponent(id)}`, input);
  }

  deleteCategory(tenantId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(tenantId)}/categories/${encodeURIComponent(id)}`);
  }

  brands(tenantId: string): Observable<Brand[]> {
    return this.http.get<Brand[]>(`${this.base(tenantId)}/brands`);
  }

  createBrand(tenantId: string, name: string): Observable<Brand> {
    return this.http.post<Brand>(`${this.base(tenantId)}/brands`, { name });
  }

  deleteBrand(tenantId: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(tenantId)}/brands/${encodeURIComponent(id)}`);
  }

  inventory(tenantId: string, q: string, lowStock: boolean, page: number, size = 50): Observable<Page<InventoryRow>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (q.trim()) params = params.set('q', q.trim());
    if (lowStock) params = params.set('lowStock', true);
    return this.http.get<Page<InventoryRow>>(`${this.base(tenantId)}/inventory`, { params });
  }

  adjust(tenantId: string, variantId: string, mode: 'DELTA' | 'SET', quantity: number, reason: MovementReason, note: string | null)
    : Observable<{ onHand: number; reserved: number }> {
    return this.http.post<{ onHand: number; reserved: number }>(`${this.base(tenantId)}/inventory/${encodeURIComponent(variantId)}/adjust`,
      { mode, quantity, reason, note });
  }

  setThreshold(tenantId: string, variantId: string, threshold: number): Observable<void> {
    return this.http.put<void>(`${this.base(tenantId)}/inventory/${encodeURIComponent(variantId)}/threshold`, { threshold });
  }

  movements(tenantId: string, variantId: string): Observable<StockMovement[]> {
    return this.http.get<StockMovement[]>(`${this.base(tenantId)}/inventory/${encodeURIComponent(variantId)}/movements`);
  }
}
