import {
  ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LogoComponent } from './brand';
import { IconName, icons } from './icons';
import { ToastOutletComponent } from './toast';

export interface NavItem {
  label: string;
  icon: IconName;
  /** Absolute router link. Omit together with `soon: true` for modules that are not available yet. */
  link?: string | readonly unknown[];
  exact?: boolean;
  /** Planned module: shown for orientation, not navigable. */
  soon?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Application frame shared by the merchant dashboard and the platform admin:
 * white rounded app surface on the page background (desktop), sidebar with sections, compact header with
 * navigation search and slots for context switchers / user menu, mobile drawer.
 */
@Component({
  selector: 'sv-app-shell',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon, LogoComponent, ToastOutletComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#sv-main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[8px] focus:bg-card focus:px-4 focus:py-2 focus:shadow">Przejdź do treści</a>
    <div class="min-h-dvh bg-page 2xl:p-4">
      <div class="flex min-h-dvh bg-card 2xl:min-h-[calc(100dvh-2rem)] 2xl:overflow-clip 2xl:rounded-[20px] 2xl:shadow-[0_1px_3px_rgba(37,43,59,0.06)]">

        @if (drawerOpen()) {
          <div class="fixed inset-0 z-40 bg-[#252B3B]/30 lg:hidden" (click)="drawerOpen.set(false)" aria-hidden="true"></div>
        }
        <!-- One sidebar element: off-canvas drawer below lg, sticky column from lg. -->
        <aside class="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] shrink-0 flex-col bg-card shadow-[var(--shadow-pop)] transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-[264px] lg:max-w-none lg:translate-x-0 lg:shadow-none 2xl:top-4 2xl:h-[calc(100dvh-2rem)]"
          [class.-translate-x-full]="!drawerOpen()" [attr.aria-label]="navLabel()"
          [attr.inert]="drawerHidden() ? '' : null">
          <ng-container *ngTemplateOutlet="sidebar" />
        </aside>

        <div class="flex min-w-0 flex-1 flex-col bg-canvas">
          <header class="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-card/95 px-4 backdrop-blur sm:px-6 2xl:top-4">
            <button type="button" class="-ml-1 rounded-[8px] p-2 text-ink-soft hover:bg-hover lg:hidden" (click)="drawerOpen.set(true)"
              aria-label="Otwórz menu">
              <svg [lucideIcon]="icons.menu" [size]="20" />
            </button>
            <div class="relative w-full max-w-[300px]">
              <svg [lucideIcon]="icons.search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <label for="sv-nav-search" class="sr-only">Szukaj w panelu</label>
              <input #search id="sv-nav-search" type="search" autocomplete="off" placeholder="Szukaj…"
                class="h-9 w-full rounded-[var(--radius-control)] border border-transparent bg-canvas pl-9 pr-12 text-[13px] text-ink placeholder:text-ink-muted focus:border-primary focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary-soft"
                [value]="query()" (input)="query.set($any($event.target).value); activeResult.set(0)"
                (keydown)="onSearchKey($event)" (blur)="closeSearchSoon()" role="combobox" aria-autocomplete="list"
                [attr.aria-expanded]="showResults()" aria-controls="sv-nav-results" />
              <kbd class="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[5px] border border-line-strong bg-card px-1.5 text-[10px] font-medium text-ink-muted sm:block">/</kbd>
              @if (showResults()) {
                <ul id="sv-nav-results" role="listbox" class="absolute left-0 right-0 top-11 z-40 max-h-80 overflow-auto rounded-[12px] border border-line bg-card p-1.5 shadow-[var(--shadow-pop)]">
                  @for (r of results(); track r.label; let i = $index) {
                    <li role="option" [attr.aria-selected]="i === activeResult()">
                      <button type="button" (mousedown)="go(r)"
                        class="flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left text-[13px]"
                        [class.bg-hover]="i === activeResult()">
                        <svg [lucideIcon]="icons[r.icon]" [size]="16" class="text-ink-muted" />
                        <span class="flex-1 text-ink">{{ r.label }}</span>
                        @if (r.section) {<span class="text-[11px] text-ink-muted">{{ r.section }}</span>}
                      </button>
                    </li>
                  } @empty {
                    <li class="px-3 py-3 text-[13px] text-ink-muted">Brak wyników dla „{{ query() }}”.</li>
                  }
                </ul>
              }
            </div>
            <div class="ml-auto flex items-center gap-1 sm:gap-2"><ng-content select="[shell-header-end]" /></div>
          </header>

          <main id="sv-main" class="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
            <div class="mx-auto w-full max-w-[1320px]"><ng-content /></div>
          </main>
        </div>
      </div>
    </div>
    <sv-toast-outlet />

    <ng-template #sidebar>
      <div class="flex h-[72px] shrink-0 items-center justify-between px-6">
        <a [routerLink]="homeLink()" aria-label="Strona główna panelu"><sv-logo [suffix]="logoSuffix()" /></a>
        <button type="button" class="rounded-[8px] p-1.5 text-ink-muted hover:bg-hover lg:hidden" (click)="drawerOpen.set(false)" aria-label="Zamknij menu">
          <svg [lucideIcon]="icons.close" [size]="18" />
        </button>
      </div>
      <div class="px-4"><ng-content select="[shell-sidebar-top]" /></div>
      <nav class="flex min-h-0 flex-1 flex-col" [attr.aria-label]="navLabel()">
        <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
          @for (section of sections(); track $index) {
            @if (section.title) {
              <p class="mb-1 mt-5 px-3 text-[12px] font-medium text-ink-muted">{{ section.title }}</p>
            }
            <ul class="space-y-0.5">
              @for (item of section.items; track item.label) {
                <li><ng-container *ngTemplateOutlet="navItem; context: { $implicit: item }" /></li>
              }
            </ul>
          }
        </div>
        @if (bottomSections().length) {
          <div class="shrink-0 border-t border-line px-4 py-3">
            @for (section of bottomSections(); track $index) {
              <ul class="space-y-0.5">
                @for (item of section.items; track item.label) {
                  <li><ng-container *ngTemplateOutlet="navItem; context: { $implicit: item }" /></li>
                }
              </ul>
            }
          </div>
        }
      </nav>
      <ng-content select="[shell-sidebar-bottom]" />
    </ng-template>

    <ng-template #navItem let-item>
      @if (asNav(item); as it) {
        @if (it.link && !it.soon) {
          <a [routerLink]="it.link" routerLinkActive #rla="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: !!it.exact }" [attr.aria-current]="rla.isActive ? 'page' : null"
            class="group flex h-9 items-center gap-3 rounded-[10px] px-3 text-[14px] transition-colors"
            [class]="rla.isActive ? 'bg-primary-soft font-medium text-ink' : 'text-ink-soft hover:bg-hover hover:text-ink'">
            <svg [lucideIcon]="icons[it.icon]" [size]="18" [strokeWidth]="1.75"
              [class]="rla.isActive ? 'text-primary-strong' : 'text-ink-muted group-hover:text-ink-soft'" />
            {{ it.label }}
          </a>
        } @else {
          <span class="flex h-9 cursor-default items-center gap-3 rounded-[10px] px-3 text-[14px] text-[#B3BAC6]"
            aria-disabled="true" [attr.title]="it.label + ' — moduł w przygotowaniu'">
            <svg [lucideIcon]="icons[it.icon]" [size]="18" [strokeWidth]="1.75" class="text-[#CDD2DB]" />
            <span class="min-w-0 flex-1 truncate whitespace-nowrap">{{ it.label }}<span class="sr-only"> (wkrótce)</span></span>
          </span>
        }
      }
    </ng-template>
  `,
})
export class AppShellComponent {
  protected readonly icons = icons;
  readonly sections = input.required<NavSection[]>();
  /** Pinned below the scrollable navigation (e.g. settings, help), always visible. */
  readonly bottomSections = input<NavSection[]>([]);
  readonly homeLink = input<string | readonly unknown[]>('/');
  readonly logoSuffix = input<string>();
  readonly navLabel = input('Nawigacja główna');

  protected readonly drawerOpen = signal(false);
  /** Below lg the closed drawer must not be reachable by keyboard / screen readers. */
  protected readonly isDesktop = signal(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  protected readonly drawerHidden = computed(() => !this.isDesktop() && !this.drawerOpen());
  protected readonly query = signal('');
  protected readonly activeResult = signal(0);
  protected readonly searchFocused = signal(false);
  private readonly router = inject(Router);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly results = computed(() => {
    const q = normalize(this.query());
    if (!q) return [];
    return [...this.sections(), ...this.bottomSections()]
      .flatMap((s) => s.items.filter((i) => i.link && !i.soon).map((i) => ({ ...i, section: s.title })))
      .filter((i) => normalize(i.label).includes(q) || normalize(i.section ?? '').includes(q))
      .slice(0, 8);
  });
  protected readonly showResults = computed(() => this.query().trim().length > 0);

  constructor() {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(min-width: 1024px)');
      mq.addEventListener('change', (e) => this.isDesktop.set(e.matches));
    }
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => this.drawerOpen.set(false));
  }

  protected asNav(item: unknown): NavItem {
    return item as NavItem;
  }

  protected go(item: NavItem): void {
    this.query.set('');
    if (item.link) {
      void this.router.navigate(Array.isArray(item.link) ? [...item.link] : [item.link]);
    }
  }

  protected onSearchKey(event: KeyboardEvent): void {
    const results = this.results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeResult.set(Math.min(results.length - 1, this.activeResult() + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeResult.set(Math.max(0, this.activeResult() - 1));
    } else if (event.key === 'Enter' && results[this.activeResult()]) {
      event.preventDefault();
      this.go(results[this.activeResult()]);
      (event.target as HTMLInputElement).blur();
    } else if (event.key === 'Escape') {
      this.query.set('');
    }
  }

  protected closeSearchSoon(): void {
    setTimeout(() => this.query.set(''), 150);
  }

  /** "/" focuses the navigation search (unless typing in a field). */
  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
    }
    if (event.key === 'Escape' && this.drawerOpen()) {
      this.drawerOpen.set(false);
    }
  }
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').trim();
}
