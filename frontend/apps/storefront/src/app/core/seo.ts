import { DOCUMENT } from '@angular/common';
import { Injectable, REQUEST, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { StorePreview } from './preview';
import { TemplateDemo } from './demo';

export interface PageSeo {
  title: string;
  description?: string | null;
  path: string;
  image?: string | null;
  type?: 'website' | 'product';
  noindex?: boolean;
  jsonLd?: object[];
}

/** Title, description, canonical URL, Open Graph and JSON-LD for the current page (rendered on the server). */
@Injectable({ providedIn: 'root' })
export class Seo {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly preview = inject(StorePreview);
  private readonly demo = inject(TemplateDemo);

  origin(): string {
    if (this.request) {
      const url = new URL(this.request.url);
      return `${url.protocol}//${url.host}`;
    }
    return this.document.location?.origin ?? '';
  }

  set(page: PageSeo, storeName: string): void {
    // Preview pages show draft content: never indexed, never canonical.
    if (this.preview.token() || this.demo.code()) page = { ...page, noindex: true };
    const fullTitle = page.title === storeName ? storeName : `${page.title} – ${storeName}`;
    this.title.setTitle(fullTitle);
    const description = (page.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    this.tag('name', 'description', description);
    this.tag('name', 'robots', page.noindex ? 'noindex, nofollow' : 'index, follow');
    const url = this.origin() + page.path;
    this.tag('property', 'og:title', fullTitle);
    this.tag('property', 'og:description', description);
    this.tag('property', 'og:type', page.type ?? 'website');
    this.tag('property', 'og:url', url);
    this.tag('property', 'og:site_name', storeName);
    this.tag('property', 'og:image', page.image ? this.origin() + page.image : '');
    this.canonical(page.noindex ? null : url);
    this.jsonLd(page.jsonLd ?? []);
  }

  private tag(attr: 'name' | 'property', key: string, content: string): void {
    const selector = `${attr}="${key}"`;
    if (content) this.meta.updateTag({ [attr]: key, content } as never, selector);
    else this.meta.removeTag(selector);
  }

  private canonical(url: string | null): void {
    let link = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!url) {
      link?.remove();
      return;
    }
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /** Structured data. `<` is escaped so merchant-entered text can never close the script element. */
  private jsonLd(blocks: object[]): void {
    this.document.head.querySelectorAll('script[data-sf-jsonld]').forEach((s) => s.remove());
    for (const block of blocks) {
      const script = this.document.createElement('script');
      script.setAttribute('type', 'application/ld+json');
      script.setAttribute('data-sf-jsonld', '');
      script.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
      this.document.head.appendChild(script);
    }
  }
}
