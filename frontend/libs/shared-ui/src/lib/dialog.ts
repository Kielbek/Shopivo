import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/**
 * Modal built on the native <dialog> element (focus trap, Esc, inert background handled by the browser).
 * Controlled through the `open` input; emits `closed` when dismissed.
 */
@Component({
  selector: 'sv-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog (close)="closed.emit()" (cancel)="closed.emit()"
      class="m-auto w-[calc(100%-2rem)] max-w-md rounded-[var(--radius-ui)] border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40"
      [attr.aria-labelledby]="titleId">
      <div class="px-6 pt-5">
        <h2 [id]="titleId" class="text-[16px] font-semibold">{{ heading() }}</h2>
        <div class="mt-2 text-[13px] leading-5 text-zinc-600"><ng-content /></div>
      </div>
      <div class="mt-6 flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-3">
        <ng-content select="[dialog-actions]" />
      </div>
    </dialog>
  `,
})
export class DialogComponent {
  private static counter = 0;
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
