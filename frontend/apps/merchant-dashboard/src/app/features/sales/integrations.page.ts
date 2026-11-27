import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '@shopivo/shared-ui';
import { CarrierAccountsComponent } from './carrier-accounts';
import { OnlinePaymentsComponent } from './online-payments';

/**
 * Connections to outside services on the merchant's own accounts: carriers (shipments, labels, tracking) and online
 * payment operators. Shipping options and payment methods themselves live on their own settings pages.
 */
@Component({
  selector: 'sv-integrations-page',
  imports: [PageHeaderComponent, CarrierAccountsComponent, OnlinePaymentsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Integracje" description="Konta u przewoźników i operatorów płatności. Dane dostępowe zapisujemy zaszyfrowane i nigdy ich nie pokazujemy." />
    <sv-carrier-accounts />
    <sv-online-payments />
  `,
})
export class IntegrationsPage {}
