import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routeOf } from '../core/link-token';
import { StoreState } from '../core/store-state';
import { StorefrontApi, ThemeSection } from '../storefront-api';
import { ProductCardComponent } from './product-card';
import { RichTextComponent } from './rich-text';
import { StarsComponent } from './stars';

/** Internal path (router link) or external https URL (new tab). */
function linkOf(value: string | undefined): { route: string; query: Record<string, string> | null } | { href: string } | null {
  if (!value) return null;
  if (value.startsWith('https://')) return { href: value };
  if (value.startsWith('/')) {
    const r = routeOf(value);
    return { route: r.path, query: r.query };
  }
  return null;
}

/** Small action link/button used by several sections. */
@Component({
  selector: 'sf-section-link',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = link();
    @if (l && text()) {
      @if ('href' in l) {
        <a [class]="cls()" [href]="l.href" target="_blank" rel="noopener">{{ text() }}</a>
      } @else {
        <a [class]="cls()" [routerLink]="l.route" [queryParams]="l.query">{{ text() }}</a>
      }
    }
  `,
})
export class SectionLinkComponent {
  readonly to = input<string>('');
  readonly text = input<string>('');
  readonly cls = input('sf-btn');
  protected readonly link = computed(() => linkOf(this.to()));
}

const ICONS: Record<string, string> = {
  truck: 'M3 7h11v8H3zM14 10h4l3 3v2h-7zM7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  return: 'M4 8h11a5 5 0 0 1 0 10H8M4 8l4-4M4 8l4 4',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3ZM9 12l2 2 4-4',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  gift: 'M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-1-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-4-2-5 1Z',
  leaf: 'M5 19c8 0 14-6 14-14-8 0-14 6-14 14ZM5 19l7-7',
  star: 'm12 3 2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.6 6.7 19.5l1.1-6L3.4 9.3l6-.8L12 3Z',
  chat: 'M4 5h16v11H9l-5 4V5Z',
};

@Component({
  selector: 'sf-section-products',
  imports: [RouterLink, ProductCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    @if (items().length) {
      <section class="sf-container" [attr.aria-label]="d['heading'] || 'Produkty'">
        <div class="flex items-end justify-between gap-4">
          @if (d['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
          @if (d['buttonText']) {<a [routerLink]="moreLink()" [queryParams]="moreQuery()" class="shrink-0 text-[14px] font-medium hover:underline">{{ d['buttonText'] }} →</a>}
        </div>
        <ul class="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          @for (p of items(); track p.id) {<li><sf-product-card [product]="p" /></li>}
        </ul>
      </section>
    }
  `,
})
export class SectionProductsComponent {
  private readonly api = inject(StorefrontApi);
  private readonly store = inject(StoreState);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly slug = computed(() => {
    const id = this.data()['category'];
    return this.data()['source'] === 'category' && id ? this.store.store()?.categories.find((c) => c.id === id)?.slug ?? null : null;
  });
  private readonly res = rxResource({
    params: () => ({ source: this.data()['source'], slug: this.slug(), size: Number(this.data()['count'] ?? 8) }),
    stream: ({ params }) => this.api.products({ size: params.size, sort: 'NEWEST', kategoria: params.slug ?? undefined, promocje: params.source === 'sale' }),
  });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().items : []));
  protected readonly moreLink = computed(() => (this.slug() ? ['/kategoria', this.slug()!] : ['/produkty']));
  protected readonly moreQuery = computed(() => (this.data()['source'] === 'sale' ? { promocje: 'tak' } : null));
}

@Component({
  selector: 'sf-section-reviews',
  imports: [RouterLink, StarsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="sf-container" [attr.aria-label]="data()['heading'] || 'Opinie klientów'">
        @if (data()['heading']) {<h2 class="text-center text-[26px] font-semibold tracking-tight">{{ data()['heading'] }}</h2>}
        <ul class="mt-6 grid gap-4 md:grid-cols-3">
          @for (r of items(); track $index) {
            <li class="sf-panel flex flex-col p-5">
              <sf-stars [value]="r.rating" />
              <p class="mt-3 line-clamp-5 flex-1 text-[15px] leading-6">„{{ r.body }}”</p>
              <p class="mt-4 text-[13px] font-medium">{{ r.authorName }}</p>
              <a [routerLink]="['/produkt', r.productSlug]" class="text-[13px] text-sf-muted hover:underline">{{ r.productName }}</a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class SectionReviewsComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly res = rxResource({ stream: () => this.api.latestReviews() });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().slice(0, 3) : []));
}

@Component({
  selector: 'sf-section-blog',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <section class="sf-container" [attr.aria-label]="data()['heading'] || 'Blog'">
        <div class="flex items-end justify-between gap-4">
          @if (data()['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ data()['heading'] }}</h2>}
          <a routerLink="/blog" class="shrink-0 text-[14px] font-medium hover:underline">Wszystkie wpisy →</a>
        </div>
        <ul class="mt-5 grid gap-4 md:grid-cols-3">
          @for (p of items(); track p.slug) {
            <li><a [routerLink]="['/blog', p.slug]" class="sf-panel block h-full p-5 hover:border-sf-text">
              <p class="text-[17px] font-semibold">{{ p.title }}</p>
              @if (p.excerpt) {<p class="mt-2 line-clamp-3 text-[14px] text-sf-muted">{{ p.excerpt }}</p>}
            </a></li>
          }
        </ul>
      </section>
    }
  `,
})
export class SectionBlogComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  private readonly res = rxResource({ stream: () => this.api.posts(0) });
  protected readonly items = computed(() => (this.res.hasValue() ? this.res.value().items.slice(0, Number(this.data()['count'] ?? 3)) : []));
}

@Component({
  selector: 'sf-section-newsletter',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <section class="bg-sf-soft">
      <div class="sf-container max-w-2xl py-14 text-center">
        <h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] || 'Newsletter' }}</h2>
        @if (d['text']) {<p class="mt-2 text-sf-muted">{{ d['text'] }}</p>}
        @if (state() === 'sent') {
          <p class="mt-6 font-medium" role="status">Dziękujemy! Sprawdź skrzynkę i potwierdź zapis, klikając link w wiadomości.</p>
        } @else {
          <form class="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row" (ngSubmit)="submit()">
            <label class="sr-only" for="nl-{{ uid }}">Adres e-mail</label>
            <input id="nl-{{ uid }}" name="email" type="email" required autocomplete="email" class="sf-input flex-1" placeholder="Twój adres e-mail" [(ngModel)]="email" />
            <button type="submit" class="sf-btn shrink-0" [disabled]="state() === 'busy'">{{ d['button'] || 'Zapisz się' }}</button>
          </form>
          @if (error(); as e) {<p class="mt-2 text-[14px] text-red-700" role="alert">{{ e }}</p>}
          <p class="mx-auto mt-3 max-w-md text-[12px] text-sf-muted">Zapisując się, zgadzasz się na otrzymywanie informacji handlowych e-mailem.
            Szczegóły w <a routerLink="/strona/polityka-prywatnosci" class="underline">polityce prywatności</a>.</p>
        }
      </div>
    </section>
  `,
})
export class SectionNewsletterComponent {
  private readonly api = inject(StorefrontApi);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly data = input.required<Record<string, any>>();
  protected readonly uid = Math.random().toString(36).slice(2, 8);
  protected email = '';
  protected readonly state = signal<'idle' | 'busy' | 'sent'>('idle');
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Podaj prawidłowy adres e-mail.');
      return;
    }
    this.state.set('busy');
    this.error.set(null);
    try {
      await firstValueFrom(this.api.subscribeNewsletter(this.email.trim(), null));
      this.state.set('sent');
    } catch {
      this.error.set('Nie udało się zapisać. Spróbuj ponownie za chwilę.');
      this.state.set('idle');
    }
  }
}

/** One-line newsletter form for the footer (same double opt-in flow). */
@Component({
  selector: 'sf-section-newsletter-compact',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state() === 'sent') {
      <p class="text-[14px] font-medium" role="status">Sprawdź skrzynkę i potwierdź zapis.</p>
    } @else {
      <form class="flex w-full max-w-md gap-2" (ngSubmit)="submit()">
        <label class="sr-only" for="nl-footer">Adres e-mail do newslettera</label>
        <input id="nl-footer" name="email" type="email" required autocomplete="email" class="sf-input !h-11 flex-1" placeholder="Twój e-mail" [(ngModel)]="email" />
        <button type="submit" class="sf-btn !h-11 shrink-0" [disabled]="state() === 'busy'">Zapisz</button>
      </form>
      @if (error(); as e) {<p class="mt-1 text-[13px] text-red-700" role="alert">{{ e }}</p>}
    }
  `,
})
export class SectionNewsletterCompactComponent {
  private readonly api = inject(StorefrontApi);
  protected email = '';
  protected readonly state = signal<'idle' | 'busy' | 'sent'>('idle');
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
      this.error.set('Podaj prawidłowy adres e-mail.');
      return;
    }
    this.state.set('busy');
    this.error.set(null);
    try {
      await firstValueFrom(this.api.subscribeNewsletter(this.email.trim(), null));
      this.state.set('sent');
    } catch {
      this.error.set('Nie udało się zapisać. Spróbuj ponownie.');
      this.state.set('idle');
    }
  }
}

/**
 * Renders the store's home-page sections in order. Each section is self-contained and fetches its own data (products,
 * reviews, posts) so a merchant can combine them freely; every image comes from the store's own library.
 */
@Component({
  selector: 'sf-home-sections',
  imports: [RouterLink, RichTextComponent, SectionLinkComponent, SectionProductsComponent,
    SectionReviewsComponent, SectionBlogComponent, SectionNewsletterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (s of store.sections(); track s.id; let first = $first) {
      @let d = s.data;
      @switch (s.type) {
        @case ('hero') {
          @let img = store.image(d['image']);
          @let pad = d['height'] === 'large' ? 'py-24 sm:py-36' : d['height'] === 'small' ? 'py-10 sm:py-14' : 'py-16 sm:py-24';
          @if (d['layout'] === 'image' && img) {
            <section class="relative isolate overflow-hidden text-white" [attr.aria-label]="d['heading'] || store.store()?.name">
              <img [src]="img" alt="" class="absolute inset-0 -z-10 size-full object-cover" [attr.fetchpriority]="first ? 'high' : null" />
              <div class="absolute inset-0 -z-10 bg-black/45"></div>
              <div class="sf-container {{ pad }}">
                <div class="max-w-2xl">
                  <h1 class="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[52px]">{{ d['heading'] || store.store()?.name }}</h1>
                  @if (d['subheading']) {<p class="mt-4 whitespace-pre-line text-[17px] opacity-90">{{ d['subheading'] }}</p>}
                  <sf-section-link class="mt-8 inline-block" [to]="d['link'] || '/produkty'" [text]="d['cta']" cls="sf-btn !bg-white !text-black" />
                </div>
              </div>
            </section>
          } @else {
            <section [class]="d['layout'] === 'banner' ? 'bg-sf-primary text-sf-on-primary' : d['layout'] === 'split' ? 'bg-sf-surface' : 'bg-sf-soft'">
              <div [class]="'sf-container ' + pad + (d['layout'] === 'split' && img ? ' grid items-center gap-8 md:grid-cols-2' : ' text-center')">
                <div [class.mx-auto]="d['layout'] !== 'split' || !img" [class.max-w-2xl]="d['layout'] !== 'split' || !img">
                  <h1 class="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[48px]">{{ d['heading'] || store.store()?.name }}</h1>
                  @if (d['subheading']) {<p class="mt-4 whitespace-pre-line text-[17px] opacity-80">{{ d['subheading'] }}</p>}
                  <sf-section-link class="mt-8 inline-block" [to]="d['link'] || '/produkty'" [text]="d['cta']"
                    [cls]="d['layout'] === 'banner' ? 'sf-btn !bg-sf-bg !text-sf-text' : 'sf-btn'" />
                </div>
                @if (d['layout'] === 'split' && img) {
                  <div class="sf-media aspect-[4/3]"><img [src]="img" alt="" class="size-full object-cover" /></div>
                }
              </div>
            </section>
          }
        }
        @case ('usp') {
          <section class="sf-container mt-12" aria-label="Dlaczego warto">
            <ul class="grid gap-4 sm:grid-cols-2" [class.lg:grid-cols-3]="(d['items']?.length ?? 3) === 3" [class.lg:grid-cols-4]="d['items']?.length === 4">
              @for (u of d['items']; track $index) {
                <li class="sf-panel flex items-start gap-3 p-5">
                  <svg viewBox="0 0 24 24" class="size-7 shrink-0 text-sf-primary" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="icon(u.icon)" /></svg>
                  <div><p class="font-semibold">{{ u.title }}</p>@if (u.text) {<p class="mt-0.5 text-[14px] text-sf-muted">{{ u.text }}</p>}</div>
                </li>
              }
            </ul>
          </section>
        }
        @case ('categories') {
          @let cats = categoriesFor(s);
          @if (cats.length) {
            <section class="sf-container mt-14" [attr.aria-label]="d['heading'] || 'Kategorie'">
              @if (d['heading']) {<h2 class="text-[24px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
              @if (d['style'] === 'chips') {
                <ul class="mt-5 flex flex-wrap gap-2">
                  @for (c of cats; track c.id) {<li><a [routerLink]="['/kategoria', c.slug]" class="sf-btn-outline !h-10">{{ c.name }}</a></li>}
                </ul>
              } @else {
                <ul class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  @for (c of cats; track c.id) {
                    <li><a [routerLink]="['/kategoria', c.slug]" class="group relative block overflow-hidden" style="border-radius: var(--sf-radius)">
                      @if (c.image) {
                        <img [src]="c.image['w400']" alt="" class="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" width="400" height="500" />
                      } @else {
                        <span class="flex aspect-[4/5] w-full items-center justify-center bg-sf-soft text-[42px] font-semibold opacity-60" aria-hidden="true">{{ c.name[0] }}</span>
                      }
                      <span class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 pb-3 pt-10 text-[16px] font-semibold text-white">{{ c.name }}</span>
                    </a></li>
                  }
                </ul>
              }
            </section>
          }
        }
        @case ('products') {<sf-section-products class="mt-14 block" [data]="d" />}
        @case ('image_text') {
          @let img = store.image(d['image']);
          <section class="sf-container mt-16">
            <div class="grid items-center gap-8 md:grid-cols-2">
              <div class="sf-media aspect-[4/3]" [class.md:order-2]="d['imageSide'] === 'right'">
                @if (img) {<img [src]="img" alt="" class="size-full object-cover" loading="lazy" />}
              </div>
              <div>
                @if (d['heading']) {<h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
                @if (d['text']) {<p class="mt-3 whitespace-pre-line text-[16px] leading-7 text-sf-muted">{{ d['text'] }}</p>}
                <sf-section-link class="mt-6 inline-block" [to]="d['link']" [text]="d['cta']" cls="sf-btn-outline" />
              </div>
            </div>
          </section>
        }
        @case ('faq') {
          @if (d['items']?.length) {
            <section class="sf-container mt-16 max-w-3xl" [attr.aria-label]="d['heading'] || 'Najczęstsze pytania'">
              @if (d['heading']) {<h2 class="text-center text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
              <div class="mt-6 divide-y divide-sf-line border-y border-sf-line">
                @for (f of d['items']; track $index) {
                  <details class="group py-4">
                    <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">{{ f.question }}
                      <span class="text-[22px] leading-none transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary>
                    <p class="mt-3 whitespace-pre-line text-sf-muted">{{ f.answer }}</p>
                  </details>
                }
              </div>
            </section>
          }
        }
        @case ('newsletter') {<sf-section-newsletter class="mt-16 block" [data]="d" />}
        @case ('reviews') {<sf-section-reviews class="mt-16 block" [data]="d" />}
        @case ('rich_text') {
          <section class="sf-container mt-16 max-w-3xl" [class.text-center]="d['align'] === 'center'">
            @if (d['heading']) {<h2 class="text-[26px] font-semibold tracking-tight">{{ d['heading'] }}</h2>}
            @if (d['text']) {<div class="mt-4 text-[16px] leading-7"><sf-rich-text [source]="d['text']" /></div>}
          </section>
        }
        @case ('blog') {<sf-section-blog class="mt-16 block" [data]="d" />}
      }
    }
  `,
})
export class HomeSectionsComponent {
  protected readonly store = inject(StoreState);

  protected icon(key: string): string {
    return ICONS[key] ?? ICONS['star'];
  }

  protected categoriesFor(s: ThemeSection) {
    const ids: string[] = s.data['categories'] ?? [];
    const all = this.store.store()?.categories ?? [];
    return ids.length ? ids.map((id) => all.find((c) => c.id === id)).filter((c) => !!c) : this.store.topCategories().slice(0, 8);
  }
}
