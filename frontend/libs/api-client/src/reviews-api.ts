import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Page, Review, ReviewStatus } from '@shopivo/shared-models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ReviewsApi {
  private readonly http = inject(HttpClient);

  private base(t: string): string {
    return `/api/v1/tenants/${encodeURIComponent(t)}/reviews`;
  }

  list(t: string, status: ReviewStatus | null, page: number): Observable<Page<Review>> {
    let params = new HttpParams().set('page', page).set('size', 25);
    if (status) params = params.set('status', status);
    return this.http.get<Page<Review>>(this.base(t), { params });
  }

  pendingCount(t: string): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.base(t)}/pending-count`);
  }

  moderate(t: string, id: string, status: 'APPROVED' | 'REJECTED'): Observable<Review> {
    return this.http.post<Review>(`${this.base(t)}/${encodeURIComponent(id)}/moderation`, { status });
  }

  reply(t: string, id: string, reply: string | null): Observable<Review> {
    return this.http.put<Review>(`${this.base(t)}/${encodeURIComponent(id)}/reply`, { reply });
  }
}
