import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subscription, formatEntitlement } from '@shopivo/shared-models';
import { formatMoney } from '@shopivo/shared-ui';
import { beforeEach, describe, expect, it } from 'vitest';
import { SubscriptionBanner } from './subscription-banner';

const DAY = 86_400_000;

function sub(overrides: Partial<Subscription>): Subscription {
  return {
    id: 's', status: 'ACTIVE', access: 'FULL', plan: { id: 'p', code: 'STARTER', name: 'Starter' }, price: null, interval: 'MONTH',
    trialEndsAt: null, currentPeriodStart: null, currentPeriodEnd: new Date(Date.now() + 20 * DAY).toISOString(),
    cancelAtPeriodEnd: false, graceUntil: null, pendingPlan: null, pendingInterval: null, coupon: null, unpaidCharges: [],
    entitlements: [], usage: [], paymentsAvailable: true, vatRateBps: 2300, ...overrides,
  };
}

describe('SubscriptionBanner', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
  });

  async function render(s: Subscription | null): Promise<string> {
    const fixture = TestBed.createComponent(SubscriptionBanner);
    fixture.componentRef.setInput('subscription', s);
    fixture.componentRef.setInput('link', ['/sklep', 't', 'subskrypcja']);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('stays hidden for a healthy subscription', async () => {
    expect(await render(sub({}))).toBe('');
    expect(await render(null)).toBe('');
  });

  it('warns about read-only mode and past-due payments', async () => {
    expect(await render(sub({ status: 'EXPIRED', access: 'READ_ONLY' }))).toContain('trybie tylko do odczytu');
    expect(await render(sub({ status: 'PAST_DUE', graceUntil: new Date(Date.now() + 3 * DAY).toISOString() })))
      .toContain('Brak płatności');
  });

  it('reminds about a trial ending within a week, but not earlier or after cancelling', async () => {
    expect(await render(sub({ status: 'TRIALING', trialEndsAt: new Date(Date.now() + 3 * DAY).toISOString() })))
      .toContain('Okres próbny kończy się za 3 dni');
    expect(await render(sub({ status: 'TRIALING', trialEndsAt: new Date(Date.now() + 12 * DAY).toISOString() }))).toBe('');
    expect(await render(sub({ status: 'TRIALING', cancelAtPeriodEnd: true, trialEndsAt: new Date(Date.now() + 2 * DAY).toISOString() })))
      .toBe('');
  });
});

describe('billing formatting', () => {
  it('formats grosze as Polish money', () => {
    expect(formatMoney(9717).replace(/\s/g, ' ')).toBe('97,17 zł');
    expect(formatMoney(null)).toBe('—');
  });

  it('formats entitlement values', () => {
    expect(formatEntitlement('LIMIT', '-1')).toBe('Bez limitu');
    expect(formatEntitlement('FEATURE', 'true')).toBe('Tak');
    expect(formatEntitlement('LIMIT', '10240', 'storage.max_mb')).toBe('10 GB');
    expect(formatEntitlement('LIMIT', '25000').replace(/\s/g, ' ')).toBe('25 000');
  });
});
