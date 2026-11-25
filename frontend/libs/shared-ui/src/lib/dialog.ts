import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

/**
 * Modal on the native <dialog> element (focus trap, Esc and inert background handled by the browser).
 * Controlled through `open`; emits `closed` when dismissed.
 */
@Component({
  selector: 'sv-dialog',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog (close)="closed.emit()" (cancel)="closed.emit()"
      class="m-auto w-[calc(100%-2rem)] max-w-[440px] rounded-[var(--radius-card)] border border-line bg-card p-0 text-ink shadow-[var(--shadow-pop)] backdrop:bg-[#252B3B]/30 backdrop:backdrop-blur-[1px]"
      [attr.aria-labelledby]="titleId">
      <div class="flex items-start justify-between gap-4 px-6 pt-5">
        <h2 [id]="titleId" class="text-[16px] font-semibold">{{ heading() }}</h2>
        <button type="button" class="-mr-2 -mt-1 rounded-[8px] p-1.5 text-ink-muted hover:bg-hover hover:text-ink"
          (click)="dialog.close()" aria-label="Zamknij">
          <svg [lucideIcon]="close" [size]="18" />
        </button>
      </div>
      <div class="px-6 pt-2 text-[13px] leading-5 text-ink-soft"><ng-content /></div>
      <div class="mt-6 flex justify-end gap-2 border-t border-line px-6 py-4">
        <ng-content select="[dialog-actions]" />
      </div>
    </dialog>
  `,
})
export class DialogComponent {
  private static counter = 0;
  protected readonly close = icons.close;
  readonly heading = input.required<string>();
  readonly open = input(false);
  readonly closed = output<void>();
  protected readonly titleId = `sv-dialog-${++DialogComponent.counter}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialog().nativeElement;
      if (this.open() && !el.open) {
        el.showModal();
      } else if (!this.open() && el.open) {
        el.close();
      }
    });
  }
}
