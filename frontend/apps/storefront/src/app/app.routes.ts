import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: 'produkty', data: { mode: 'all' }, loadComponent: () => import('./pages/catalog.page').then((m) => m.CatalogPage) },
  { path: 'kategoria/:slug', data: { mode: 'category' }, loadComponent: () => import('./pages/catalog.page').then((m) => m.CatalogPage) },
  { path: 'szukaj', data: { mode: 'search' }, loadComponent: () => import('./pages/catalog.page').then((m) => m.CatalogPage) },
  { path: 'produkt/:slug', loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage) },
  { path: 'strona/:slug', data: { kind: 'PAGE' }, loadComponent: () => import('./pages/content.page').then((m) => m.ContentPage) },
  { path: 'blog', loadComponent: () => import('./pages/blog.page').then((m) => m.BlogPage) },
  { path: 'blog/:slug', data: { kind: 'POST' }, loadComponent: () => import('./pages/content.page').then((m) => m.ContentPage) },
  { path: 'koszyk', loadComponent: () => import('./pages/cart.page').then((m) => m.CartPage) },
  { path: 'zamowienie', loadComponent: () => import('./pages/checkout.page').then((m) => m.CheckoutPage) },
  { path: 'zamowienie/potwierdzenie', loadComponent: () => import('./pages/confirmation.page').then((m) => m.ConfirmationPage) },
  { path: '**', loadComponent: () => import('./pages/not-found.page').then((m) => m.NotFoundPage) },
];
