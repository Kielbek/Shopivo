import { Routes } from '@angular/router';
import { guestGuard, mfaPendingGuard, platformStaffGuard } from '@shopivo/api-client';

export const routes: Routes = [
  { path: 'logowanie', title: 'Logowanie · Shopivo Admin', canActivate: [guestGuard], loadComponent: () => import('./pages/login.page').then((m) => m.AdminLoginPage) },
  { path: 'logowanie/weryfikacja', title: 'Weryfikacja · Shopivo Admin', canActivate: [mfaPendingGuard], loadComponent: () => import('./pages/login.page').then((m) => m.AdminMfaPage) },
  { path: 'brak-dostepu', title: 'Brak dostępu · Shopivo Admin', loadComponent: () => import('./pages/login.page').then((m) => m.NoAccessPage) },
  {
    path: '',
    canActivate: [platformStaffGuard],
    loadComponent: () => import('./pages/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', title: 'Przegląd · Shopivo Admin', loadComponent: () => import('./pages/overview.page').then((m) => m.OverviewPage) },
      { path: 'sklepy', title: 'Sklepy · Shopivo Admin', loadComponent: () => import('./pages/tenants.page').then((m) => m.TenantsPage) },
      { path: 'uzytkownicy', title: 'Użytkownicy · Shopivo Admin', loadComponent: () => import('./pages/users.page').then((m) => m.UsersPage) },
      { path: 'subskrypcje', title: 'Subskrypcje · Shopivo Admin', loadComponent: () => import('./pages/subscriptions.page').then((m) => m.SubscriptionsPage) },
      { path: 'plany', title: 'Plany i limity · Shopivo Admin', loadComponent: () => import('./pages/plans.page').then((m) => m.PlansPage) },
      { path: 'kupony', title: 'Kupony · Shopivo Admin', loadComponent: () => import('./pages/coupons.page').then((m) => m.CouponsPage) },
      { path: 'zuzycie', title: 'Zużycie i rentowność · Shopivo Admin', loadComponent: () => import('./pages/usage.page').then((m) => m.UsagePage) },
      { path: 'operatorzy-platnosci', title: 'Operatorzy płatności · Shopivo Admin', loadComponent: () => import('./pages/payment-providers.page').then((m) => m.PaymentProvidersPage) },
      { path: 'dziennik', title: 'Dziennik · Shopivo Admin', loadComponent: () => import('./pages/audit.page').then((m) => m.AdminAuditPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
