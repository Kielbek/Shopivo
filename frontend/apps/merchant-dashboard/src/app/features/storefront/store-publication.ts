import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi, StoresApi } from '@shopivo/api-client';
import { AlertComponent, BadgeComponent, ButtonComponent, DialogComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

/** Store status card: publish (with a checklist of what is missing), preview, open or take the store offline. */
@Component({
  selector: 'sv-store-publication',
  imports: [RouterLink, LucideDynamicIcon, BadgeComponent, ButtonComponent, AlertComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ctx.store(); as store) {
      <section class="sv-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="pub-title">
        <div class="flex min-w-0 items-center gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-full" [class]="published() ? 'bg-success/15 text-success-ink' : 'bg-warning/20 text-warning-ink'">
            <svg [lucideIcon]="icons.domains" [size]="18" />
          </span>
          <div class="min-w-0">
            <h2 id="pub-title" class="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-ink">
              {{ published() ? 'Sklep jest otwarty dla klientów' : 'Sklep nie jest jeszcze opublikowany' }}
              <sv-badge [tone]="published() ? 'success' : 'warning'">{{ published() ? 'Opublikowany' : 'Szkic' }}</sv-badge>
            </h2>
            <p class="truncate text-[13px] text-ink-muted">{{ storeUrl() }}</p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          @if (published()) {
            <a sv-button variant="secondary" [href]="storeUrl()" target="_blank" rel="noopener">Otwórz sklep</a>
            @if (canWrite) {<button sv-button variant="ghost" (click)="confirmOffline.set(true)">Wyłącz sklep</button>}
          } @else {
            @if (canPreview) {<button sv-button variant="secondary" [loading]="previewing()" (click)="preview()">Podgląd</button>}
            @if (canWrite) {<button sv-button (click)="openPublish()">Opublikuj sklep</button>}
          }
        </div>
      </section>

      <sv-dialog heading="Publikacja sklepu" [open]="publishOpen()" (closed)="publishOpen.set(false)">
        @if (readiness.isLoading()) {
          <p>Sprawdzamy gotowość sklepu…</p>
        } @else if (readiness.value(); as r) {
          @if (r.ready) {
            <p>Wszystko gotowe. Po publikacji sklep będzie widoczny pod adresem <strong class="font-medium text-ink">{{ storeUrl() }}</strong>,
              klienci będą mogli składać zamówienia, a wyszukiwarki indeksować strony.</p>
          } @else {
            <p>Zanim otworzysz sklep, uzupełnij:</p>
            <ul class="mt-3 space-y-2">
              @for (m of r.missing; track m) {
                <li class="flex items-start gap-2 text-[13px] text-ink"><svg [lucideIcon]="icons.alert" [size]="16" class="mt-0.5 shrink-0 text-warning-ink" />{{ m }}</li>
              }
            </ul>
            <p class="mt-4 text-[13px] text-ink-muted">
              <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'ustawienia']">Dane firmy</a> ·
              <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'produkty']">Produkty</a> ·
              <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'wysylka']">Wysyłka</a> ·
              <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'platnosci']">Płatności</a> ·
              <a class="sv-link" [routerLink]="['/sklep', ctx.tenantId(), 'tresci']">Strony i blog</a>
            </p>
          }
        }
        @if (error(); as e) {<sv-alert tone="error" class="mt-4">{{ e }}</sv-alert>}
        <ng-container dialog-actions>
          <button sv-button variant="secondary" type="button" (click)="publishOpen.set(false)">Zamknij</button>
          @if (readiness.value()?.ready) {<button sv-button type="button" [loading]="busy()" (click)="publish()">Opublikuj</button>}
        </ng-container>
      </sv-dialog>

      <sv-dialog heading="Wyłączyć sklep?" [open]="confirmOffline()" (closed)="confirmOffline.set(false)">
        Klienci zobaczą informację, że sklep jest w przygotowaniu, i nie będą mogli składać zamówień. Złożone zamówienia
        nadal obsłużysz w panelu.
        <ng-container dialog-actions>
          <button sv-button variant="secondary" type="button" (click)="confirmOffline.set(false)">Anuluj</button>
          <button sv-button variant="danger" type="button" [loading]="busy()" (click)="unpublish()">Wyłącz sklep</button>
        </ng-container>
      </sv-dialog>
    }
  `,
})
export class StorePublicationComponent {
  protected readonly ctx = inject(StoreContext);
  private readonly api = inject(StorefrontAdminApi);
  private readonly storesApi = inject(StoresApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly canWrite = this.ctx.can('STORE_SETTINGS_WRITE');
  protected readonly canPreview = this.ctx.can('THEMES_WRITE');

  protected readonly publishOpen = signal(false);
  protected readonly confirmOffline = signal(false);
  protected readonly busy = signal(false);
  protected readonly previewing = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly config = rxResource({ stream: () => this.storesApi.config() });
  protected readonly readiness = rxResource({
    params: () => (this.publishOpen() ? this.ctx.tenantId() : undefined),
    stream: ({ params }) => this.api.readiness(params),
  });
  protected readonly published = computed(() => this.ctx.store()?.status === 'PUBLISHED');
  protected readonly storeUrl = computed(() => {
    const host = this.ctx.store()?.primaryHostname ?? '';
    return (this.config.value()?.storefrontUrlTemplate ?? 'https://{host}').replace('{host}', host);
  });

  protected openPublish(): void {
    this.error.set(null);
    this.publishOpen.set(true);
  }

  protected async publish(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.ctx.updateStore(await firstValueFrom(this.api.publish(this.ctx.tenantId())));
      this.publishOpen.set(false);
      this.toast.success('Sklep jest otwarty dla klientów.');
    } catch (e) {
      this.error.set(ApiError.from(e).message);
      this.readiness.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected async unpublish(): Promise<void> {
    this.busy.set(true);
    try {
      this.ctx.updateStore(await firstValueFrom(this.api.unpublish(this.ctx.tenantId())));
      this.confirmOffline.set(false);
      this.toast.success('Sklep został wyłączony.');
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async preview(): Promise<void> {
    const tab = window.open('', '_blank');
    this.previewing.set(true);
    try {
      const link = await firstValueFrom(this.api.previewLink(this.ctx.tenantId()));
      if (tab) {
        tab.opener = null;
        tab.location.href = link.url;
      } else {
        window.location.assign(link.url);
      }
    } catch (e) {
      tab?.close();
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.previewing.set(false);
    }
  }
}
