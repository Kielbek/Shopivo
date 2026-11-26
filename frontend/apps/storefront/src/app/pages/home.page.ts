import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Seo } from '../core/seo';
import { StoreState } from '../core/store-state';
import { HomeSectionsComponent } from '../ui/sections';

@Component({
  selector: 'sf-home',
  imports: [HomeSectionsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sf-home-sections />
  `,
})
export class HomePage {
  protected readonly store = inject(StoreState);
  private readonly seo = inject(Seo);
  /** Search engines get the FAQ section as structured data too. */
  private readonly faq = computed(() => this.store.sections().filter((s) => s.type === 'faq').flatMap((s) => s.data['items'] ?? []));

  constructor() {
    effect(() => {
      const s = this.store.store();
      if (!s) return;
      this.seo.set({
        title: s.name, description: this.store.sections().find((x) => x.type === 'hero')?.data['subheading'] || `Sklep internetowy ${s.name}.`, path: '/',
        jsonLd: [{
          '@context': 'https://schema.org', '@type': 'Organization', name: s.seller?.companyName || s.name, url: this.seo.origin() + '/',
          ...(s.seller?.email ? { email: s.seller.email } : {}), ...(s.seller?.taxId ? { vatID: 'PL' + s.seller.taxId } : {}),
        }, { '@context': 'https://schema.org', '@type': 'WebSite', name: s.name, url: this.seo.origin() + '/',
          potentialAction: { '@type': 'SearchAction', target: this.seo.origin() + '/szukaj?q={q}', 'query-input': 'required name=q' } },
        ...(this.faq().length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: this.faq().map((f: { question: string; answer: string }) => ({
          '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }] : [])],
      }, s.name);
    });
  }
}
