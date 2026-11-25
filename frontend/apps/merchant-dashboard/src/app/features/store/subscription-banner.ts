import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from '@shopivo/shared-models';
import { AlertComponent, AlertTone, ButtonComponent } from '@shopivo/shared-ui';

const DATE = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long' });
const DAY = 86_400_000;

/** Subscription state that needs the merchant's attention, shown above every store page. */
@Component({
  selector: 'sv-subscription-banner',
  imports: [AlertComponent, ButtonComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (notice(); as n) {
      <sv-alert [tone]="n.tone" [heading]="n.heading" class="mb-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{{ n.text }}</span>
          <a sv-button size="sm" [variant]="n.tone === 'error' ? 'primary' : 'secondary'" [routerLink]="link()" class="shrink-0">{{ n.action }}</a>
        </div>
      </sv-alert>
    }
  `,
})
export class SubscriptionBanner {
  readonly subscription = input<Subscription | null>(null);
  readonly link = input.required<unknown[]>();

  protected readonly notice = computed<{ tone: AlertTone; heading: string; text: string; action: string } | null>(() => {
    const s = this.subscription();
    if (!s) return null;
    if (s.access === 'READ_ONLY') {
      return {
        tone: 'error',
        heading: 'Sklep działa w trybie tylko do odczytu',
        text: s.status === 'CANCELED'
          ? 'Subskrypcja została zakończona, a sklep jest niedostępny dla klientów. Dane są bezpieczne.'
          : 'Subskrypcja wygasła, a sklep jest niedostępny dla klientów. Dane są bezpieczne — po opłaceniu wszystko wróci od razu.',
        action: 'Wybierz plan',
      };
    }
    if (s.status === 'PAST_DUE') {
      return {
        tone: 'warning',
        heading: 'Brak płatności za subskrypcję',
        text: `Sklep działa normalnie do ${fmt(s.graceUntil)}. Później przejdzie w tryb tylko do odczytu.`,
        action: 'Opłać subskrypcję',
      };
    }
    if (s.status === 'TRIALING' && s.trialEndsAt && !s.cancelAtPeriodEnd) {
      const days = Math.ceil((new Date(s.trialEndsAt).getTime() - Date.now()) / DAY);
      if (days <= 7) {
        return {
          tone: 'info',
          heading: days <= 1 ? 'Okres próbny kończy się jutro' : `Okres próbny kończy się za ${days} dni`,
          text: `Wybierz plan przed ${fmt(s.trialEndsAt)}, aby sklep działał bez przerwy. Pozostałe dni okresu próbnego zachowasz.`,
          action: 'Wybierz plan',
        };
      }
    }
    if (s.unpaidCharges.some((c) => c.kind === 'RENEWAL')) {
      return {
        tone: 'info',
        heading: 'Płatność za kolejny okres',
        text: `Opłać odnowienie przed ${fmt(s.currentPeriodEnd)}.`,
        action: 'Zapłać',
      };
    }
    return null;
  });
}

function fmt(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '—';
}
