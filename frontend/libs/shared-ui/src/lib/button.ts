import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SpinnerComponent } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-ui)] font-medium ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:outline-zinc-900',
  secondary: 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 hover:border-zinc-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
  ghost: 'text-zinc-700 hover:bg-zinc-100',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[14px]',
  lg: 'h-11 px-5 text-[15px]',
};

/** `<button sv-button variant="primary" [loading]="saving()">Zapisz</button>` */
@Component({
  selector: 'button[sv-button], a[sv-button]',
  imports: [SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.disabled]': 'loading() || disabled() ? "" : null',
  },
  template: `@if (loading()) {<sv-spinner size="sm" />}<ng-content />`,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<keyof typeof SIZES>('md');
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly block = input(false);

  protected readonly classes = computed(
    () => `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()]} ${this.block() ? 'w-full' : ''}`,
  );
}
