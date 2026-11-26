import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { plainText } from '../core/rich-text';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';

const DATE = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

@Component({
  selector: 'sf-blog',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      <h1 class="text-[30px] font-semibold tracking-tight">Blog</h1>
      @if (posts.error()) {
        <p class="mt-6 text-sf-muted">Nie udało się wczytać wpisów. Odśwież stronę.</p>
      } @else if (page(); as p) {
        @if (p.items.length) {
          <ul class="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            @for (post of p.items; track post.slug) {
              <li class="sf-panel flex flex-col p-5">
                <time class="text-[13px] text-sf-muted" [attr.datetime]="post.publishedAt">{{ date(post.publishedAt) }}</time>
                <h2 class="mt-2 text-[19px] font-semibold leading-snug"><a [routerLink]="['/blog', post.slug]" class="hover:underline">{{ post.title }}</a></h2>
                @if (post.excerpt) {<p class="mt-2 flex-1 text-[15px] text-sf-muted">{{ excerpt(post.excerpt) }}</p>}
                <a [routerLink]="['/blog', post.slug]" class="sf-link mt-4 text-[14px]" [attr.aria-label]="'Czytaj: ' + post.title">Czytaj dalej</a>
              </li>
            }
          </ul>
        } @else {
          <p class="mt-6 text-sf-muted">Nie ma jeszcze wpisów.</p>
        }
        @if (p.totalPages > 1) {
          <nav class="mt-10 flex items-center justify-center gap-2" aria-label="Strony">
            @if (p.page > 0) {<a class="sf-btn-outline !h-10" [routerLink]="[]" [queryParams]="{ strona: p.page }" rel="prev">Nowsze</a>}
            <span class="px-3 text-[14px] text-sf-muted">Strona {{ p.page + 1 }} z {{ p.totalPages }}</span>
            @if (p.page + 1 < p.totalPages) {<a class="sf-btn-outline !h-10" [routerLink]="[]" [queryParams]="{ strona: p.page + 2 }" rel="next">Starsze</a>}
          </nav>
        }
      }
    </div>
  `,
})
export class BlogPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  readonly strona = input<string>();
  private readonly pageIndex = computed(() => Math.max(0, (parseInt(this.strona() ?? '1', 10) || 1) - 1));
  protected readonly posts = rxResource({ params: () => this.pageIndex(), stream: ({ params }) => this.api.posts(params) });
  protected readonly page = computed(() => (this.posts.hasValue() ? this.posts.value() : undefined));

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (s) this.seo.set({ title: 'Blog', description: `Wpisy na blogu sklepu ${s.name}.`, path: '/blog' + (this.pageIndex() ? `?strona=${this.pageIndex() + 1}` : '') }, s.name);
    });
  }

  protected date(iso: string): string {
    return DATE.format(new Date(iso));
  }

  protected excerpt(text: string): string {
    return plainText(text, 220);
  }
}
