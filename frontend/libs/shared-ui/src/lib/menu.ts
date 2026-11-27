import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';

/**
 * Dropdown menu. Project the trigger content into `[menu-trigger]` and items as
 * `<a sv-menu-item>` / `<button sv-menu-item>`. Closes on outside click, Escape and item activation;
 * arrow keys move focus between items.
 */
@Component({
  selector: 'sv-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-block' },
  template: `
    <button type="button" class="flex items-center rounded-[var(--radius-control)] focus-visible:outline-2 focus-visible:outline-primary"
      [class]="triggerClass()" [attr.aria-expanded]="open()" aria-haspopup="menu" [attr.aria-label]="label()"
      (click)="toggle()" (keydown.arrowdown)="openAndFocus($event)">
      <ng-content select="[menu-trigger]" />
    </button>
    @if (open()) {
      <div role="menu" [attr.aria-label]="label()" (click)="onPanelClick($event)" (keydown)="onKey($event)"
        class="absolute z-40 min-w-[220px] rounded-[12px] border border-line bg-card p-1.5 text-ink shadow-[var(--shadow-pop)]"
        [class.mt-2]="side() === 'bottom'" [class.bottom-full]="side() === 'top'" [class.mb-2]="side() === 'top'"
        [class.right-0]="align() === 'end'" [class.left-0]="align() === 'start'">
        <ng-content />
      </div>
    }
  `,
})
export class MenuComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly label = input.required<string>();
  readonly align = input<'start' | 'end'>('end');
  /** Where the panel opens (`top` for menus at the foot of the navigation). */
  readonly side = input<'top' | 'bottom'>('bottom');
  readonly triggerClass = input('');
  protected readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  protected openAndFocus(event: Event): void {
    event.preventDefault();
    this.open.set(true);
    queueMicrotask(() => this.items()[0]?.focus());
  }

  protected onPanelClick(event: Event): void {
    if ((event.target as HTMLElement).closest('[sv-menu-item]')) {
      this.close();
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const items = this.items();
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  private items(): HTMLElement[] {
    return Array.from((this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[sv-menu-item]'));
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !(this.host.nativeElement as HTMLElement).contains(event.target as Node)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open()) {
      this.close();
      ((this.host.nativeElement as HTMLElement).querySelector('button') as HTMLElement | null)?.focus();
    }
  }
}

@Component({
  selector: 'a[sv-menu-item], button[sv-menu-item]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'menuitem',
    class: 'flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-ink-soft ' +
      'hover:bg-hover hover:text-ink focus:bg-hover focus:text-ink focus:outline-none [&_svg]:size-4 [&_svg]:text-ink-muted',
    '[class.font-medium]': 'active()',
    '[class.text-ink]': 'active()',
  },
  template: `<ng-content />`,
})
export class MenuItemComponent {
  readonly active = input(false);
}

