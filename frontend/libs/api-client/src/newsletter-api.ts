import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NewsletterStatus, NewsletterSubscriber, Page } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NewsletterApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}/newsletter`;
  }

  list(t: string, status: NewsletterStatus | null, q: string, page: number): Observable<Page<NewsletterSubscriber>> {
    let params = new HttpParams().set('page', page).set('size', 25);
    if (status) params = params.set('status', status);
    if (q.trim()) params = params.set('q', q.trim());
    return this.http.get<Page<NewsletterSubscriber>>(this.base(t), { params });
  }

  summary(t: string): Observable<{ counts: Partial<Record<NewsletterStatus, number>> }> {
    return this.http.get<{ counts: Partial<Record<NewsletterStatus, number>> }>(`${this.base(t)}/summary`);
  }

  exportCsv(t: string): Observable<Blob> {
    return this.http.get(`${this.base(t)}/export.csv`, { responseType: 'blob' });
  }

  delete(t: string, id: string): Observable<void> {
    return this.http.delete<void>(`${this.base(t)}/${encodeURIComponent(id)}`);
  }
}
