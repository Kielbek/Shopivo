import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ContentEntry, ContentInput, ContentKind, ContentRevision, ContentSummary, LegalKey, LegalStatus, Page, Redirect,
} from '@shopivo/shared-models';
import { Observable } from 'rxjs';

/** Pages, blog posts and redirects of a store (merchant panel). */
@Injectable({ providedIn: 'root' })
export class ContentApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}`;
  }

  list(t: string, kind: ContentKind, q: string, page: number): Observable<Page<ContentSummary>> {
    let params = new HttpParams().set('kind', kind).set('page', page).set('size', 50);
    if (q) params = params.set('q', q);
    return this.http.get<Page<ContentSummary>>(`${this.base(t)}/content`, { params });
  }

  legal(t: string): Observable<LegalStatus[]> {
    return this.http.get<LegalStatus[]>(`${this.base(t)}/content/legal`);
  }

  createLegal(t: string, key: LegalKey): Observable<ContentEntry> {
    return this.http.post<ContentEntry>(`${this.base(t)}/content/legal/${key}`, null);
  }

  get(t: string, id: string): Observable<ContentEntry> {
    return this.http.get<ContentEntry>(`${this.base(t)}/content/${encodeURIComponent(id)}`);
  }

  create(t: string, input: ContentInput): Observable<ContentEntry> {
    return this.http.post<ContentEntry>(`${this.base(t)}/content`, input);
  }

  update(t: string, id: string, input: ContentInput): Observable<ContentEntry> {
    return this.http.put<ContentEntry>(`${this.base(t)}/content/${encodeURIComponent(id)}`, input);
  }

  delete(t: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/content/${encodeURIComponent(id)}`);
  }

  revision(t: string, revisionId: string): Observable<ContentRevision> {
    return this.http.get<ContentRevision>(`${this.base(t)}/content/revisions/${encodeURIComponent(revisionId)}`);
  }

  redirects(t: string): Observable<Redirect[]> {
    return this.http.get<Redirect[]>(`${this.base(t)}/redirects`);
  }

  addRedirect(t: string, fromPath: string, toPath: string): Observable<Redirect> {
    return this.http.post<Redirect>(`${this.base(t)}/redirects`, { fromPath, toPath });
  }

  deleteRedirect(t: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/redirects/${encodeURIComponent(id)}`);
  }
}
