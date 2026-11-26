import { ChangeDetectionStrategy, Component, RESPONSE_INIT, computed, effect, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { plainText } from '../core/rich-text';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { StorefrontApi } from '../storefront-api';
import { BreadcrumbsComponent, Crumb } from '../ui/breadcrumbs';
import { RichTextComponent } from '../ui/rich-text';

const DATE = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });

/** A CMS page (/strona/:slug) or a blog post (/blog/:slug), chosen by route data `kind`. */
@Component({
  selector: 'sf-content',
  imports: [RouterLink, BreadcrumbsComponent, RichTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sf-container py-8">
      @if (entry.error()) {
        <div class="py-16 text-center">
          <h1 class="text-[26px] font-semibold">{{ kind() === 'POST' ? 'Nie znaleziono wpisu' : 'Nie znaleziono strony' }}</h1>
          <a [routerLink]="kind() === 'POST' ? '/blog' : '/'" class="sf-btn mt-6">{{ kind() === 'POST' ? 'Wszystkie wpisy' : 'Strona główna' }}</a>
        </div>
      } @else if (loaded(); as e) {
        <sf-breadcrumbs [items]="crumbs()" />
        <article class="mx-auto mt-6 max-w-[720px]">
          @if (e.draft) {<p class="mb-4 inline-block rounded-full bg-sf-soft px-3 py-1 text-[12px] font-medium">Szkic — widoczny tylko w podglądzie</p>}
          <h1 class="text-[32px] font-semibold leading-tight tracking-tight">{{ e.title }}</h1>
          @if (kind() === 'POST' && e.publishedAt) {<p class="mt-2 text-[14px] text-sf-muted"><time [attr.datetime]="e.publishedAt">{{ date(e.publishedAt) }}</time></p>}
          @if (e.systemKey && e.updatedAt) {<p class="mt-2 text-[13px] text-sf-muted">Ostatnia aktualizacja: {{ date(e.updatedAt) }}</p>}
          <div class="mt-8"><sf-rich-text [source]="e.body" /></div>
          @if (kind() === 'POST') {<a routerLink="/blog" class="sf-link mt-10 inline-block">← Wszystkie wpisy</a>}
        </article>
      } @else {
        <div class="mx-auto mt-6 max-w-[720px] animate-pulse space-y-3" aria-busy="true">
          <div class="h-9 w-2/3 rounded bg-sf-soft"></div><div class="h-4 rounded bg-sf-soft"></div><div class="h-4 w-5/6 rounded bg-sf-soft"></div>
        </div>
      }
    </div>
  `,
})
export class ContentPage {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  private readonly response = inject(RESPONSE_INIT, { optional: true });

  readonly slug = input.required<string>();
  readonly kind = input<'PAGE' | 'POST'>('PAGE');
  protected readonly entry = rxResource({
    params: () => ({ slug: this.slug(), kind: this.kind() }),
    stream: ({ params }) => (params.kind === 'POST' ? this.api.post(params.slug) : this.api.page(params.slug)),
  });
  protected readonly loaded = computed(() => (this.entry.hasValue() ? this.entry.value() : undefined));
  protected readonly crumbs = computed<Crumb[]>(() => {
    const e = this.loaded();
    const base: Crumb[] = this.kind() === 'POST' ? [{ label: 'Blog', link: ['/blog'] }] : [];
    return e ? [...base, { label: e.title, link: null }] : base;
  });

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      const prefix = this.kind() === 'POST' ? '/blog/' : '/strona/';
      if (this.entry.error()) {
        if (this.response) this.response.status = 404;
        this.seo.set({ title: 'Nie znaleziono strony', path: prefix + this.slug(), noindex: true }, s.name);
        return;
      }
      const e = this.loaded();
      if (!e) return;
      const origin = this.seo.origin();
      this.seo.set({
        title: e.seoTitle || e.title, description: e.seoDescription || e.excerpt || plainText(e.body, 300), path: prefix + e.slug,
        noindex: e.draft,
        jsonLd: e.kind === 'POST' ? [{
          '@context': 'https://schema.org', '@type': 'BlogPosting', headline: e.title, datePublished: e.publishedAt, dateModified: e.updatedAt,
          mainEntityOfPage: origin + prefix + e.slug, publisher: { '@type': 'Organization', name: s.name },
        }] : [],
      }, s.name);
    });
  }

  protected date(iso: string): string {
    return DATE.format(new Date(iso));
  }
}
