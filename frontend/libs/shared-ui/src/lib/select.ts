import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, booleanAttribute, computed, forwardRef, inject, input,
  model, signal, viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { attachSwipeToDismiss, prefersReducedMotion } from './gestures';
import { icons } from './icons';

export interface SelectOption {
  value: string;
  label: string;
  /** Secondary line, e.g. what a role is allowed to do. */
  description?: string;
}

const SHEET_QUERY = '(max-width: 639px)';
const PANEL_GAP = 6;
const PANEL_MAX_HEIGHT = 320;
let selectCounter = 0;

/**
 * Custom select replacing the native dropdown list.
 * - Desktop: anchored panel below (or above) the field.
 * - Mobile (< 640 px): bottom sheet with larger touch targets.
 * Rendered with the Popover API (top layer), so it is never clipped by scroll containers, tables or modal dialogs.
 * Works with Reactive Forms / ngModel (ControlValueAccessor) and standalone via `[(value)]`.
 * Keyboard and ARIA follow the WAI-ARIA "select-only combobox" pattern.
 */
@Component({
  selector: 'sv-select',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
  host: { class: 'block' },
  template: `
    <button #trigger type="button" [id]="inputId() || triggerId" role="combobox"
      class="sv-input flex items-center gap-2 text-left"
      [class]="size() === 'sm' ? '!h-8 !rounded-[8px] !px-2.5 !text-[13px]' : ''"
      [attr.aria-label]="ariaLabel() || null" aria-haspopup="listbox" [attr.aria-expanded]="open()" [attr.aria-controls]="listId"
      [attr.aria-invalid]="invalid() || null" [disabled]="isDisabled()"
      (click)="toggle()" (keydown)="onTriggerKey($event)" (blur)="onTouched()">
      @if (leadingIcon()) {
        <svg [lucideIcon]="ICONS[leadingIcon()!]" [size]="16" class="shrink-0 text-ink-muted" />
      }
      <span class="min-w-0 flex-1 truncate" [class.text-[#A3AABA]]="!selected()">{{ selected()?.label ?? placeholder() }}</span>
      <svg [lucideIcon]="ICONS.chevronDown" [size]="16" class="shrink-0 text-ink-muted transition-transform duration-150"
        [class.rotate-180]="open()" />
    </button>

    <div #panel popover="manual" class="sv-select-panel" [class.is-sheet]="sheet()" [class.is-dragging]="dragging()"
      [class.is-closing]="closing()" [style.transform]="sheetTransform()"
      [style.top.px]="sheet() ? null : pos().top" [style.bottom.px]="sheet() ? 0 : pos().bottom"
      [style.left.px]="sheet() ? 0 : pos().left" [style.width.px]="sheet() ? null : pos().width"
      (keydown)="onPanelKey($event)">
      <div #content class="flex max-h-[inherit] flex-col">
        @if (sheet()) {
          <!-- Grab area: drag down to dismiss (touch-action none so the page does not scroll instead). -->
          <div class="relative flex shrink-0 touch-none items-center justify-between px-5 pb-2 pt-3" data-sheet-handle>
            <span class="absolute left-1/2 top-2 block h-1 w-10 -translate-x-1/2 rounded-full bg-[#D9DCD5]" aria-hidden="true"></span>
            <p class="pt-2 text-[15px] font-semibold text-ink">{{ ariaLabel() || placeholder() || 'Wybierz' }}</p>
            <button type="button" class="mt-1 rounded-[8px] p-1.5 text-ink-muted hover:bg-hover" (click)="close(true)" aria-label="Zamknij">
              <svg [lucideIcon]="ICONS.close" [size]="18" />
            </button>
          </div>
        }
        @if (isSearchable()) {
          <div class="shrink-0 p-2" [class]="sheet() ? 'border-b border-line px-4 pb-3' : ''">
            <div class="relative">
              <svg [lucideIcon]="ICONS.search" [size]="15" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input #search type="text" class="sv-input !h-9 pl-9 !text-[13px]" placeholder="Szukaj…" autocomplete="off"
                [attr.aria-controls]="listId" [attr.aria-activedescendant]="activeDescendant()" aria-autocomplete="list"
                [value]="query()" (input)="onSearch($any($event.target).value)" />
            </div>
          </div>
        }
        <ul #list role="listbox" [id]="listId" tabindex="-1" [attr.aria-label]="ariaLabel() || placeholder() || null"
          [attr.aria-activedescendant]="activeDescendant()"
          class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none" [class]="sheet() ? 'px-3 pb-4' : ''">
          @for (o of filtered(); track o.value; let i = $index) {
            <li role="option" [id]="listId + '-' + i" [attr.aria-selected]="o.value === value()"
              (click)="choose(o)" (pointermove)="active.set(i)"
              class="flex cursor-pointer items-start gap-3 rounded-[8px] px-2.5 text-[13.5px]"
              [class]="(sheet() ? 'min-h-12 py-3' : 'py-2') + (i === active() ? ' bg-hover' : '')">
              <span class="min-w-0 flex-1">
                <span class="block truncate" [class]="o.value === value() ? 'font-medium text-ink' : 'text-ink'">{{ o.label }}</span>
                @if (o.description) {<span class="mt-0.5 block text-[12px] leading-[1.4] text-ink-muted">{{ o.description }}</span>}
              </span>
              @if (o.value === value()) {
                <svg [lucideIcon]="ICONS.check" [size]="16" [strokeWidth]="2.5" class="mt-0.5 shrink-0 text-primary-strong" />
              }
            </li>
          } @empty {
            <li class="px-3 py-6 text-center text-[13px] text-ink-muted" role="presentation">Brak wyników</li>
          }
        </ul>
      </div>
    </div>
  `,
})
export class SelectComponent implements ControlValueAccessor {
  protected readonly ICONS = icons;
  private readonly destroyRef = inject(DestroyRef);

  readonly options = input.required<SelectOption[]>();
  readonly value = model<string | null>(null);
  readonly placeholder = input('Wybierz…');
  /** Accessible name when there is no <label for> (also the sheet title on mobile). */
  readonly ariaLabel = input<string>();
  /** Id of the trigger, so `<label for="…">` (sv-field) names the control. */
  readonly inputId = input<string>();
  readonly size = input<'md' | 'sm'>('md');
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Search box; by default shown for lists longer than 8 options. */
  readonly searchable = input<boolean | undefined>(undefined);
  readonly leadingIcon = input<keyof typeof icons>();

  protected readonly triggerId = `sv-select-${++selectCounter}`;
  protected readonly listId = `${this.triggerId}-list`;
  protected readonly open = signal(false);
  protected readonly sheet = signal(false);
  protected readonly active = signal(0);
  protected readonly query = signal('');
  protected readonly pos = signal({ top: null as number | null, bottom: null as number | null, left: 0, width: 240 });
  private readonly formDisabled = signal(false);
  /** Bottom sheet gesture/animation state. */
  protected readonly dragOffset = signal<number | null>(null);
  protected readonly dragging = signal(false);
  protected readonly closing = signal(false);
  protected readonly sheetTransform = computed(() => {
    if (!this.sheet()) return null;
    if (this.closing()) return 'translateY(100%)';
    const offset = this.dragOffset();
    return offset === null ? null : `translateY(${offset}px)`;
  });
  private closeTimer?: ReturnType<typeof setTimeout>;

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled());
  protected readonly isSearchable = computed(() => this.searchable() ?? this.options().length > 8);
  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly filtered = computed(() => {
    const q = fold(this.query());
    return q ? this.options().filter((o) => fold(`${o.label} ${o.description ?? ''}`).includes(q)) : this.options();
  });
  protected readonly activeDescendant = computed(() =>
    this.open() && this.filtered().length ? `${this.listId}-${this.active()}` : null);

  private onChange: (value: string | null) => void = () => {};
  protected onTouched: () => void = () => {};
  private typeahead = '';
  private typeaheadTimer?: ReturnType<typeof setTimeout>;
  private readonly cleanup: (() => void)[] = [];

  constructor() {
    this.destroyRef.onDestroy(() => this.detachListeners());
  }

  // ---------------------------------------------------------------- ControlValueAccessor

  writeValue(value: string | null): void {
    this.value.set(value ?? null);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.formDisabled.set(disabled);
  }

  // ---------------------------------------------------------------- open / close

  protected toggle(): void {
    if (this.open()) {
      this.close(false);
    } else {
      this.openPanel();
    }
  }

  private openPanel(): void {
    if (this.isDisabled() || this.open()) return;
    this.finishClose();
    this.dragOffset.set(null);
    this.sheet.set(typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches);
    this.query.set('');
    const index = this.options().findIndex((o) => o.value === this.value());
    this.active.set(Math.max(0, index));
    this.position();
    const panel = this.panel().nativeElement as HTMLElement & { showPopover?: () => void };
    panel.showPopover?.();
    this.open.set(true);
    this.attachListeners();
    queueMicrotask(() => {
      const search = this.searchInput()?.nativeElement;
      if (search && !this.sheet()) {
        search.focus();
      } else {
        (this.list().nativeElement as HTMLElement).focus({ preventScroll: true });
      }
      this.scrollActiveIntoView();
    });
  }

  close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    this.detachListeners();
    if (restoreFocus) {
      (this.trigger().nativeElement as HTMLElement).focus({ preventScroll: true });
    }
    if (this.sheet() && !prefersReducedMotion()) {
      // Slide the sheet out (from wherever the finger left it), then remove it from the top layer.
      this.dragging.set(false);
      this.closing.set(true);
      this.closeTimer = setTimeout(() => this.finishClose(), 220);
    } else {
      this.finishClose();
    }
  }

  private finishClose(): void {
    clearTimeout(this.closeTimer);
    const panel = this.panel().nativeElement as HTMLElement & { hidePopover?: () => void; matches(s: string): boolean };
    if (!this.open()) {
      try {
        panel.hidePopover?.();
      } catch {
        // already hidden
      }
    }
    this.closing.set(false);
    this.dragging.set(false);
    this.dragOffset.set(null);
  }

  protected choose(option: SelectOption): void {
    if (option.value !== this.value()) {
      this.value.set(option.value);
      this.onChange(option.value);
    }
    this.onTouched();
    this.close(true);
  }

  /** Anchors the panel to the trigger; flips above when there is not enough space below. */
  private position(): void {
    if (this.sheet()) return;
    const rect = (this.trigger().nativeElement as HTMLElement).getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 220), vw - 16);
    const left = Math.min(Math.max(8, rect.left), vw - width - 8);
    const below = vh - rect.bottom - PANEL_GAP;
    const above = rect.top - PANEL_GAP;
    const openUp = below < Math.min(PANEL_MAX_HEIGHT, 200) && above > below;
    this.pos.set(openUp
      ? { top: null, bottom: vh - rect.top + PANEL_GAP, left, width }
      : { top: rect.bottom + PANEL_GAP, bottom: null, left, width });
  }

  private attachListeners(): void {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      const insideContent = (this.content().nativeElement as HTMLElement).contains(target);
      const onTrigger = (this.trigger().nativeElement as HTMLElement).contains(target);
      if (!insideContent && !onTrigger) this.close(false);
    };
    const onScroll = (e: Event) => {
      if (!(this.panel().nativeElement as HTMLElement).contains(e.target as Node)) this.position();
    };
    const onResize = () => (this.sheet() ? undefined : this.position());
    document.addEventListener('pointerdown', onPointer, true);
    if (this.sheet()) {
      const content = this.content().nativeElement as HTMLElement;
      const list = this.list().nativeElement as HTMLElement;
      this.cleanup.push(attachSwipeToDismiss(content, {
        direction: 'down',
        size: () => content.getBoundingClientRect().height,
        // From the list only when it is scrolled to the top — otherwise the gesture scrolls the list.
        canStart: (target) => !(target instanceof Node && list.contains(target)) || list.scrollTop <= 0,
        onMove: (offset) => {
          this.dragging.set(true);
          this.dragOffset.set(offset);
        },
        onRelease: (dismiss) => {
          this.dragging.set(false);
          if (dismiss) {
            this.close(false);
          } else {
            this.dragOffset.set(0); // snaps back with the CSS transition
          }
        },
      }));
    }
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    this.cleanup.push(
      () => document.removeEventListener('pointerdown', onPointer, true),
      () => window.removeEventListener('scroll', onScroll, true),
      () => window.removeEventListener('resize', onResize),
    );
  }

  private detachListeners(): void {
    while (this.cleanup.length) this.cleanup.pop()!();
  }

  // ---------------------------------------------------------------- keyboard

  protected onTriggerKey(event: KeyboardEvent): void {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      this.openPanel();
      return;
    }
    // Native-like: typing on a closed select jumps to the matching option.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = this.typeaheadMatch(event.key);
      if (match) {
        this.value.set(match.value);
        this.onChange(match.value);
      }
    }
  }

  protected onPanelKey(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.set(Math.min(count - 1, this.active() + 1));
        this.scrollActiveIntoView();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.set(Math.max(0, this.active() - 1));
        this.scrollActiveIntoView();
        break;
      case 'Home':
        if (event.target === this.searchInput()?.nativeElement) return;
        event.preventDefault();
        this.active.set(0);
        this.scrollActiveIntoView();
        break;
      case 'End':
        if (event.target === this.searchInput()?.nativeElement) return;
        event.preventDefault();
        this.active.set(Math.max(0, count - 1));
        this.scrollActiveIntoView();
        break;
      case 'Enter':
        event.preventDefault();
        if (this.filtered()[this.active()]) this.choose(this.filtered()[this.active()]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation(); // do not close a surrounding modal dialog
        this.close(true);
        break;
      case 'Tab':
        this.close(false);
        break;
      default:
        if (!this.isSearchable() && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          const match = this.typeaheadMatch(event.key);
          if (match) {
            this.active.set(this.filtered().indexOf(match));
            this.scrollActiveIntoView();
          }
        }
    }
  }

  protected onSearch(text: string): void {
    this.query.set(text);
    this.active.set(0);
  }

  private typeaheadMatch(key: string): SelectOption | undefined {
    clearTimeout(this.typeaheadTimer);
    this.typeahead += fold(key);
    this.typeaheadTimer = setTimeout(() => (this.typeahead = ''), 600);
    return this.options().find((o) => fold(o.label).startsWith(this.typeahead));
  }

  private scrollActiveIntoView(): void {
    queueMicrotask(() => {
      const el = document.getElementById(`${this.listId}-${this.active()}`);
      el?.scrollIntoView?.({ block: 'nearest' });
    });
  }
}

function fold(value: string): string {
  return value.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/\p{M}/gu, '').trim();
}
