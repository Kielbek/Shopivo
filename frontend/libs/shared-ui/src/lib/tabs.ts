import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model } from '@angular/core';

export interface TabOption {
  id: string;
  label: string;
}

/**
 * Segmented control used as page tabs (WAI-ARIA tabs pattern: roving focus with arrow keys).
 * Panels should use `role="tabpanel"` with `id="panel-<id>"` and `aria-labelledby="tab-<id>"`.
 */
@Component({
  selector: 'sv-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex max-w-full overflow-x-auto rounded-full bg-[#E9EBE6] p-1', role: 'tablist', '[attr.aria-label]': 'label()' },
  template: `
    @for (t of tabs(); track t.id) {
      <button type="button" role="tab" [id]="'tab-' + t.id" [attr.aria-selected]="active() === t.id"
        [attr.aria-controls]="'panel-' + t.id" [tabIndex]="active() === t.id ? 0 : -1"
        (click)="active.set(t.id)" (keydown)="onKey($event)"
        class="h-8 whitespace-nowrap rounded-full px-4 text-[13px] font-medium transition-colors"
        [class]="active() === t.id ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,18,16,0.1)]' : 'text-ink-muted hover:text-ink'">
        {{ t.label }}
      </button>
    }
  `,
})
export class TabsComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly tabs = input.required<TabOption[]>();
  readonly label = input.required<string>();
  readonly active = model.required<string>();

  protected onKey(event: KeyboardEvent): void {
    const ids = this.tabs().map((t) => t.id);
    const i = ids.indexOf(this.active());
    const next = event.key === 'ArrowRight' ? ids[(i + 1) % ids.length]
      : event.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length] : null;
    if (next) {
      event.preventDefault();
      this.active.set(next);
      queueMicrotask(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('#tab-' + next)?.focus());
    }
  }
}
