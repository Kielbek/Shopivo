import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi, TenantApi } from '@shopivo/api-client';
import { StoreSettings } from '@shopivo/shared-models';
import { IconName, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

interface Facts { store: string; company: string; email: string; phone: string; address: string }

interface Starter { slug: string; title: string; icon: IconName; hint: string; body: (f: Facts) => string }

const line = (label: string, value: string) => (value ? `- ${label}: ${value}\n` : '');

/** Starter pages most stores need. Bodies use the store's own data where it exists; the merchant edits the rest. */
export const STARTERS: Starter[] = [
  {
    slug: 'o-nas', title: 'O nas', icon: 'users', hint: 'historia i wartości marki',
    body: (f) => `## Kim jesteśmy\n\n${f.store} to sklep prowadzony przez ${f.company || 'nasz zespół'}. Opisz tu, jak zaczęła się Wasza historia i co Was wyróżnia.\n\n` +
      `## Co oferujemy\n\nNapisz, jakie produkty znajdą u Was klienci i skąd je bierzecie — własna produkcja, rękodzieło, starannie wybrani dostawcy.\n\n` +
      `## Dlaczego warto u nas kupować\n\n- Szybka wysyłka\n- 14 dni na zwrot bez podania przyczyny\n- Pomoc przed i po zakupie\n`,
  },
  {
    slug: 'kontakt', title: 'Kontakt', icon: 'mail', hint: 'dane kontaktowe i godziny',
    body: (f) => `## Napisz lub zadzwoń\n\nChętnie odpowiemy na pytania o produkty, zamówienia i zwroty.\n\n` +
      line('E-mail', f.email) + line('Telefon', f.phone) + line('Adres', f.address) +
      `\n## Godziny pracy\n\nOdpowiadamy od poniedziałku do piątku. Wiadomości wysłane w weekend obsłużymy w pierwszy dzień roboczy.\n\n` +
      (f.company ? `## Dane firmy\n\n${f.company}${f.address ? ', ' + f.address : ''}\n` : ''),
  },
  {
    slug: 'faq', title: 'Najczęstsze pytania', icon: 'help', hint: 'dostawa, płatności, zwroty',
    body: (f) => `## Jak długo czeka się na przesyłkę?\n\nCzas wysyłki podajemy przy każdym produkcie i w podsumowaniu zamówienia. O nadaniu paczki poinformujemy e-mailem z numerem przesyłki.\n\n` +
      `## Jakie są formy płatności?\n\nDostępne metody płatności zobaczysz w ostatnim kroku zamówienia.\n\n` +
      `## Czy mogę zwrócić towar?\n\nTak — jako konsument masz 14 dni na odstąpienie od umowy bez podania przyczyny. Szczegóły znajdziesz w regulaminie.\n\n` +
      `## Jak się z Wami skontaktować?\n\n${f.email ? `Napisz na ${f.email}` : 'Skorzystaj ze strony Kontakt'}${f.phone ? ` lub zadzwoń: ${f.phone}` : ''}.\n`,
  },
];

/** Suggests the starter pages the store does not have yet; one click creates a draft and opens it in the editor. */
@Component({
  selector: 'sv-starter-pages',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (missing().length) {
      <div class="border-b border-line px-5 py-4">
        <p class="text-[12px] font-medium text-ink-soft">Gotowe wzory — dodaj jednym kliknięciem i dopasuj treść</p>
        <ul class="mt-2.5 grid gap-2 sm:grid-cols-3">
          @for (s of missing(); track s.slug) {
            <li>
              <button type="button" class="flex w-full items-center gap-3 rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-left transition-colors hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60"
                [disabled]="!!busy()" (click)="create(s)" [attr.aria-label]="'Dodaj stronę ' + s.title">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-canvas text-ink-soft"
                  [class.sv-shimmer]="busy() === s.slug"><svg [lucideIcon]="icons[s.icon]" [size]="15" /></span>
                <span class="min-w-0"><span class="block truncate text-[13px] font-medium text-ink">{{ s.title }}</span>
                  <span class="block truncate text-[12px] text-ink-muted">{{ s.hint }}</span></span>
                <svg [lucideIcon]="icons.plus" [size]="15" class="ml-auto shrink-0 text-ink-muted" />
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class StarterPagesComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly tenant = inject(TenantApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly busy = signal<string | null>(null);

  private readonly pages = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.list(params, 'PAGE', '', 0) });
  protected readonly missing = computed(() => {
    if (!this.pages.hasValue()) return [];
    const slugs = new Set(this.pages.value().items.map((p) => p.slug));
    return STARTERS.filter((s) => !slugs.has(s.slug));
  });

  protected async create(s: Starter): Promise<void> {
    this.busy.set(s.slug);
    const t = this.ctx.tenantId();
    try {
      const settings: StoreSettings | null = await firstValueFrom(this.tenant.settings(t)).catch(() => null);
      const facts: Facts = {
        store: this.ctx.store()?.name ?? 'Nasz sklep',
        company: settings?.legalCompanyName?.trim() ?? '',
        email: settings?.orderEmail?.trim() ?? '',
        phone: settings?.phone?.trim() ?? '',
        address: [settings?.addressLine1, settings?.addressLine2, [settings?.postalCode, settings?.city].filter(Boolean).join(' ')]
          .map((x) => x?.trim()).filter(Boolean).join(', '),
      };
      const entry = await firstValueFrom(this.api.create(t, {
        kind: 'PAGE', title: s.title, slug: s.slug, excerpt: null, body: s.body(facts), status: 'DRAFT', showInFooter: true,
        seoTitle: null, seoDescription: null, version: 0,
      }));
      this.toast.success(`Dodano szkic strony „${s.title}”. Dopasuj treść i opublikuj.`);
      void this.router.navigate(['/sklep', t, 'tresci', entry.id]);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
      this.pages.reload();
    } finally {
      this.busy.set(null);
    }
  }
}
