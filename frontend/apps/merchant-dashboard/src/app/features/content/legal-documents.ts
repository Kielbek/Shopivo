import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, ContentApi } from '@shopivo/api-client';
import { LegalKey, LegalStatus } from '@shopivo/shared-models';
import { AlertComponent, BadgeComponent, ButtonComponent, InfoTipComponent, LoadingComponent, ToastService, icons, plural } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';
import { StoreContext } from '../store/store-context';

/**
 * Legal documents as list rows (status and what is still missing). A row opens the document's own editor, where its
 * preview, data and template live; a document that does not exist yet is created from the template first.
 */
@Component({
  selector: 'sv-legal-documents',
  imports: [RouterLink, LucideDynamicIcon, AlertComponent, BadgeComponent, ButtonComponent, InfoTipComponent, LoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sv-card mt-5" aria-labelledby="legal-heading">
      <div class="flex flex-wrap items-start gap-3 px-5 pb-3 pt-5">
        <div class="min-w-0 flex-1">
          <h2 id="legal-heading" class="flex items-center gap-1 text-[15px] font-semibold text-ink">Dokumenty prawne
            <sv-info-tip title="Dlaczego to ważne?" label="Dlaczego dokumenty prawne są ważne?"
              text="Sklep internetowy w Polsce musi mieć regulamin i politykę prywatności (prawa konsumenta, RODO). Wzory wypełniamy Twoimi danymi — przeczytaj je i dostosuj, najlepiej z prawnikiem. Każda opublikowana wersja jest zapisywana, a zamówienie pamięta, którą wersję zaakceptował klient." /></h2>
          <p class="mt-0.5 text-[12px] text-ink-muted">Regulamin i polityka prywatności są wymagane do publikacji sklepu.</p>
        </div>
        @if (docs().length) {
          <div class="flex min-w-[180px] items-center gap-3">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas"><div class="h-full rounded-full bg-success transition-[width]" [style.width.%]="(ready() / docs().length) * 100"></div></div>
            <span class="whitespace-nowrap text-[12px] text-ink-muted">{{ ready() }} z {{ docs().length }} gotowe</span>
          </div>
        }
      </div>
      @if (legal.isLoading() && !legal.hasValue()) {
        <sv-loading variant="list" />
      } @else if (legal.error()) {
        <div class="px-5 pb-5"><sv-alert tone="error">Nie udało się wczytać dokumentów.</sv-alert></div>
      } @else {
        <ul class="border-t border-line">
          @for (l of docs(); track l.key) {
            <li class="group relative flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-hover">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-[10px]" [class]="tone(l)">
                <svg [lucideIcon]="l.entry?.status === 'PUBLISHED' && !l.missing.length ? icons.check : icons.legal" [size]="17" />
              </span>
              <div class="min-w-0 flex-1">
                @if (l.entry) {
                  <a [routerLink]="[l.entry.id]" class="font-medium text-ink after:absolute after:inset-0 hover:underline">{{ l.title }}</a>
                } @else {
                  <span class="font-medium text-ink">{{ l.title }}</span>
                }
                <p class="mt-0.5 truncate text-[12px] text-ink-muted">
                  @if (!l.entry) {Utwórz ze wzoru — wypełnimy go danymi Twojej firmy}
                  @else {{{ l.entry.path }}@if (l.missing.length) {<span class="text-warning-ink"> · brakuje: {{ plural(l.missing.length, 'informacja', 'informacje', 'informacji') }}</span>}}
                </p>
              </div>
              @if (l.requiredForPublish) {<sv-badge tone="warning">Wymagany</sv-badge>}
              @if (!l.entry) {
                @if (canWrite) {
                  <button sv-button variant="tonal" size="sm" class="relative z-[1]" [loading]="creating() === l.key" (click)="create(l.key)"><svg [lucideIcon]="icons.plus" />Utwórz ze wzoru</button>
                } @else {<sv-badge>Nie utworzono</sv-badge>}
              } @else {
                <sv-badge [tone]="l.entry.status === 'PUBLISHED' ? 'success' : 'neutral'">{{ l.entry.status === 'PUBLISHED' ? 'Opublikowany' : 'Szkic' }}</sv-badge>
                <svg [lucideIcon]="icons.chevronRight" [size]="16" class="text-ink-muted" aria-hidden="true" />
              }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class LegalDocumentsComponent {
  private readonly ctx = inject(StoreContext);
  private readonly api = inject(ContentApi);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  protected readonly icons = icons;
  protected readonly plural = plural;
  protected readonly canWrite = this.ctx.can('CONTENT_WRITE');
  protected readonly legal = rxResource({ params: () => this.ctx.tenantId(), stream: ({ params }) => this.api.legal(params) });
  protected readonly creating = signal<LegalKey | null>(null);
  protected readonly docs = computed<LegalStatus[]>(() => (this.legal.hasValue() ? this.legal.value() : []));
  protected readonly ready = computed(() => this.docs().filter((d) => d.entry?.status === 'PUBLISHED' && !d.missing.length).length);

  protected tone(l: LegalStatus): string {
    if (l.entry?.status === 'PUBLISHED' && !l.missing.length) return 'bg-success/15 text-success-ink';
    if (l.requiredForPublish || l.missing.length) return 'bg-warning/20 text-warning-ink';
    return 'bg-canvas text-ink-soft';
  }

  protected async create(key: LegalKey): Promise<void> {
    this.creating.set(key);
    try {
      const entry = await firstValueFrom(this.api.createLegal(this.ctx.tenantId(), key));
      await this.router.navigate(['/sklep', this.ctx.tenantId(), 'tresci', entry.id]);
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
      this.creating.set(null);
    }
  }
}
