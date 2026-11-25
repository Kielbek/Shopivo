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
      { path: 'dziennik', title: 'Dziennik · Shopivo Admin', loadComponent: () => import('./pages/audit.page').then((m) => m.AdminAuditPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
