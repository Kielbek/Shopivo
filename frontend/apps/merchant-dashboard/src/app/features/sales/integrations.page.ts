import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '@shopivo/shared-ui';
import { CarrierAccountsComponent } from './carrier-accounts';
import { OnlinePaymentsComponent } from './online-payments';
import { GoogleSignInComponent } from './google-sign-in';

/**
 * Connections to outside services on the merchant's own accounts: carriers (shipments, labels, tracking) and online
 * payment operators. Shipping options and payment methods themselves live on their own settings pages.
 */
@Component({
  selector: 'sv-integrations-page',
  imports: [PageHeaderComponent, CarrierAccountsComponent, OnlinePaymentsComponent, GoogleSignInComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-page-header title="Integracje" description="Połączenia z operatorami płatności, przewoźnikami i logowaniem przez Google. Dane dostępowe zapisujemy zaszyfrowane i nigdy ich nie pokazujemy." />
    <sv-online-payments />
    <sv-carrier-accounts />
    <sv-google-sign-in />
  `,
})
export class IntegrationsPage {}
