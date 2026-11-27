import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, afterNextRender, computed, inject, input, signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { LucideDynamicIcon } from '@lucide/angular';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LogoComponent } from './brand';
import { attachSwipeToDismiss } from './gestures';
import { IconName, icons } from './icons';
import { ToastOutletComponent } from './toast';
import { NavIconComponent } from './nav-icon';
import { TooltipDirective } from './tooltip';

export interface NavItem {
  label: string;
  icon: IconName;
  /** Absolute router link. Omit together with `soon: true` for modules that are not available yet. */
  link?: string | readonly unknown[];
  exact?: boolean;
  /** Planned module: shown for orientation, not navigable. */
  soon?: boolean;
  /** Forces the active look (e.g. "Ustawienia" while on any settings sub-page). */
  active?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Application frame shared by the merchant dashboard and the platform admin: a deep-green navigation column fading into
 * black (white text; neon marks the active item), the work surface flush next to it; an off-canvas drawer on phones. In `rail` mode the navigation collapses to icons and an optional section navigation
 * ([shell-subnav], e.g. settings) opens next to it.
 */
@Component({
  selector: 'sv-app-shell',
  imports: [NavIconComponent, TooltipDirective, NgTemplateOutlet, RouterLink, RouterLinkActive, LucideDynamicIcon, LogoComponent, ToastOutletComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a href="#sv-main" class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[8px] focus:bg-card focus:px-4 focus:py-2 focus:shadow">Przejdź do treści</a>
    <div class="flex min-h-dvh bg-card lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:[background:var(--nav-bg)]">

      <!-- Overlay fades with the drawer and follows the swipe. -->
      <div class="fixed inset-0 z-40 bg-night/50 transition-opacity duration-300 motion-reduce:transition-none lg:hidden"
        [class.pointer-events-none]="!drawerOpen()" [class.opacity-0]="!drawerOpen()" [class.!transition-none]="drawerDrag() !== null"
        [style.opacity]="drawerDrag() !== null ? overlayOpacity() : null" (click)="drawerOpen.set(false)" aria-hidden="true"></div>
      <!-- One sidebar element: off-canvas drawer below lg, sticky column (full or icon rail) from lg. -->
      <aside #drawer class="fixed inset-y-0 left-0 z-50 flex touch-pan-y w-[280px] max-w-[85vw] shrink-0 flex-col [background:var(--nav-bg)] text-nav-text transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:max-w-none lg:translate-x-0"
        [class.lg:w-[252px]]="!rail()" [class.lg:w-[68px]]="rail()"
        [class.-translate-x-full]="!drawerOpen()" [class.!transition-none]="drawerDrag() !== null"
        [style.transform]="drawerDrag() !== null ? 'translateX(' + -drawerDrag()! + 'px)' : null" [attr.aria-label]="navLabel()"
        [attr.inert]="drawerHidden() ? '' : null">
        <ng-container *ngTemplateOutlet="sidebar" />
      </aside>

      @if (hasSubnav()) {
        <!-- Section navigation (settings…) next to the icon rail; on phones the page shows it inline instead. -->
        <aside class="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-l border-nav-line [background:var(--nav-bg)] text-nav-text lg:flex" [attr.aria-label]="subnavLabel()">
          <div class="min-h-0 flex-1 overflow-y-auto pr-2"><ng-content select="[shell-subnav]" /></div>
          <div class="relative shrink-0 pr-2"><ng-content select="[shell-subnav-bottom]" /></div>
        </aside>
      }

      <div #panel class="flex min-w-0 flex-1 flex-col bg-card lg:my-2.5 lg:mr-2.5 lg:overflow-y-auto lg:rounded-[18px]">
        <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-card/95 px-4 backdrop-blur sm:px-6 lg:hidden">
          <button type="button" class="-ml-1 rounded-[8px] p-2 text-ink-soft hover:bg-hover lg:hidden" (click)="drawerOpen.set(true)"
            aria-label="Otwórz menu">
            <svg [lucideIcon]="icons.menu" [size]="20" />
          </button>
          <a [routerLink]="homeLink()" class="lg:hidden" aria-label="Strona główna panelu"><sv-logo [suffix]="logoSuffix()" /></a>
                    <div class="ml-auto flex items-center gap-1 sm:gap-2"><ng-content select="[shell-header-end]" /></div>
        </header>

        <main id="sv-main" class="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <div class="mx-auto w-full" [class]="narrow() ? 'max-w-[840px]' : 'max-w-[1600px]'"><ng-content /></div>
        </main>
      </div>
    </div>
    <sv-toast-outlet />

    <ng-template #sidebar>
      <div class="relative flex h-16 shrink-0 items-center" [class]="rail() ? 'justify-between px-5 lg:justify-center lg:px-0' : 'justify-between px-5'">
        <a [routerLink]="homeLink()" aria-label="Strona główna panelu" class="flex items-center">
          @if (rail()) {
            <span class="hidden lg:inline-flex"><sv-logo [mark]="true" tone="light" /></span>
            <span class="lg:hidden"><sv-logo [suffix]="logoSuffix()" tone="light" /></span>
          } @else {
            <sv-logo [suffix]="logoSuffix()" tone="light" />
          }
        </a>
        <button type="button" class="rounded-[8px] p-1.5 text-nav-muted hover:bg-nav-hover hover:text-nav-strong lg:hidden" (click)="drawerOpen.set(false)" aria-label="Zamknij menu">
          <svg [lucideIcon]="icons.close" [size]="18" />
        </button>
      </div>

      <div class="relative px-3" [class.lg:hidden]="rail()">
        <svg [lucideIcon]="icons.search" [size]="15" class="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-nav-muted" />
        <label for="sv-nav-search" class="sr-only">Szukaj w panelu</label>
        <input #search id="sv-nav-search" type="search" autocomplete="off" placeholder="Szukaj"
          class="h-9 w-full rounded-full border border-nav-line bg-nav-field pl-9 pr-10 text-[13px] text-nav-strong placeholder:text-nav-muted hover:bg-nav-hover focus:border-neon/70 focus:outline-none focus:ring-2 focus:ring-neon/25"
          [value]="query()" (input)="query.set($any($event.target).value); activeResult.set(0)"
          (keydown)="onSearchKey($event)" (blur)="closeSearchSoon()" role="combobox" aria-autocomplete="list"
          [attr.aria-expanded]="showResults()" aria-controls="sv-nav-results" />
        <kbd class="pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 rounded-[5px] border border-nav-line px-1.5 text-[10px] font-medium text-nav-muted sm:block">/</kbd>
        @if (showResults()) {
          <ul id="sv-nav-results" role="listbox" class="absolute left-3 right-3 top-11 z-40 max-h-80 overflow-auto rounded-[12px] border border-line bg-card p-1.5 text-ink shadow-[var(--shadow-pop)]">
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
      <div class="relative px-3 pt-3" [class.lg:hidden]="rail()"><ng-content select="[shell-sidebar-top]" /></div>

      <nav class="relative flex min-h-0 flex-1 flex-col" [attr.aria-label]="navLabel()">
        <div class="min-h-0 flex-1 overflow-y-auto pb-3 pt-2 [scrollbar-width:thin]" [class]="rail() ? 'px-3 lg:px-2.5' : 'px-3'">
          @for (section of sections(); track $index) {
            @if (section.title) {
              <p class="mb-1 mt-5 px-3 text-[11.5px] font-medium uppercase tracking-[0.06em] text-nav-muted" [class.lg:hidden]="rail()">{{ section.title }}</p>
              @if (rail()) {<div class="mx-2 my-3 hidden h-px bg-nav-line lg:block" aria-hidden="true"></div>}
            }
            <ul class="space-y-0.5">
              @for (item of section.items; track item.label) {
                @if (!(rail() && item.soon)) {
                  <li><ng-container *ngTemplateOutlet="navItem; context: { $implicit: item }" /></li>
                }
              }
            </ul>
          }
        </div>
        <!-- Pinned items (settings, help) at the foot, where the green has faded into black. -->
        <div class="shrink-0 border-t border-nav-line pb-3 pt-3" [class]="rail() ? 'px-3 lg:px-2.5' : 'px-3'">
          @for (section of bottomSections(); track $index) {
            <ul class="space-y-0.5">
              @for (item of section.items; track item.label) {
                @if (!(rail() && item.soon)) {
                  <li><ng-container *ngTemplateOutlet="navItem; context: { $implicit: item }" /></li>
                }
              }
            </ul>
          }
          <ng-content select="[shell-sidebar-bottom]" />
        </div>
      </nav>
    </ng-template>

    <ng-template #navItem let-item>
      @if (asNav(item); as it) {
        @if (it.link && !it.soon) {
          <a [routerLink]="it.link" routerLinkActive #rla="routerLinkActive"
            [routerLinkActiveOptions]="{ exact: !!it.exact }" [attr.aria-current]="rla.isActive || it.active ? 'page' : null"
            [svTooltip]="rail() ? it.label : null"
            class="group flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13.5px] transition-colors"
            [class.lg:justify-center]="rail()" [class.lg:px-0]="rail()"
            [class]="(rla.isActive || it.active) ? 'bg-nav-active font-medium text-nav-active-text shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.4)]' : 'text-nav-text hover:bg-nav-hover hover:text-nav-strong'">
            <sv-nav-icon [name]="it.icon" [active]="rla.isActive || !!it.active" [size]="19"
              [class]="(rla.isActive || it.active) ? 'text-nav-active-text' : 'text-nav-muted group-hover:text-nav-strong'" />
            <span class="min-w-0 flex-1 truncate" [class.lg:sr-only]="rail()">{{ it.label }}</span>
          </a>
        } @else {
          <span class="flex h-9 cursor-default items-center gap-3 rounded-[10px] px-3 text-[13.5px]"
            [class]="'text-nav-muted/60'"
            aria-disabled="true" [attr.title]="it.label + ' — moduł w przygotowaniu'">
            <sv-nav-icon [name]="it.icon" [size]="19" class="text-nav-muted/50" />
            <span class="min-w-0 flex-1 truncate whitespace-nowrap">{{ it.label }}<span class="sr-only"> (wkrótce)</span></span>
            <span class="rounded-full border px-1.5 text-[10px]" class="border-nav-line text-nav-muted" aria-hidden="true">wkrótce</span>
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
  /** Desktop: collapse the main navigation to an icon rail (settings, focused tools). */
  readonly rail = input(false);
  /** Desktop: a section navigation column next to the rail (projected as [shell-subnav]). */
  readonly hasSubnav = input(false);
  readonly subnavLabel = input('Nawigacja sekcji');
  /** Narrower reading column (forms, settings). */
  readonly narrow = input(false);

  protected readonly drawerOpen = signal(false);
  /** Current swipe offset of the mobile drawer (null when not dragging). */
  protected readonly drawerDrag = signal<number | null>(null);
  protected readonly overlayOpacity = computed(() => {
    const width = this.drawerEl()?.nativeElement.getBoundingClientRect().width || 280;
    return Math.max(0, 1 - (this.drawerDrag() ?? 0) / width);
  });
  private readonly drawerEl = viewChild<ElementRef<HTMLElement>>('drawer');
  /** Desktop: the work surface scrolls by itself (inside the frame), so a new page starts at its top. */
  private readonly panelEl = viewChild<ElementRef<HTMLElement>>('panel');
  private lastPath = '';
  /** Below lg the closed drawer must not be reachable by keyboard / screen readers. */
  protected readonly isDesktop = signal(typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  protected readonly drawerHidden = computed(() => !this.isDesktop() && !this.drawerOpen());
  protected readonly query = signal('');
  protected readonly activeResult = signal(0);
  protected readonly searchFocused = signal(false);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
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
    afterNextRender(() => {
      const el = this.drawerEl()?.nativeElement;
      if (!el) return;
      const detach = attachSwipeToDismiss(el, {
        direction: 'left',
        size: () => el.getBoundingClientRect().width,
        canStart: () => this.drawerOpen() && !this.isDesktop(),
        onMove: (offset) => this.drawerDrag.set(Math.min(offset, el.getBoundingClientRect().width)),
        onRelease: (dismiss) => {
          this.drawerDrag.set(null);
          if (dismiss) this.drawerOpen.set(false);
        },
      });
      this.destroyRef.onDestroy(detach);
    });
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(min-width: 1024px)');
      mq.addEventListener('change', (e) => this.isDesktop.set(e.matches));
    }
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        this.drawerOpen.set(false);
        // Only a different page starts at the top; filters and tabs (query parameters) keep the position.
        const path = this.router.url.split(/[?#]/)[0];
        const panel = this.panelEl()?.nativeElement;
        if (panel && path !== this.lastPath) panel.scrollTop = 0;
        this.lastPath = path;
      });
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
