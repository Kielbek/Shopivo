import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SpinnerComponent } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'soft';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-strong text-white hover:bg-primary-deep focus-visible:outline-primary-strong',
  secondary: 'border border-line-strong bg-card text-ink hover:bg-hover hover:border-[#CDD3DD]',
  soft: 'bg-primary-soft text-primary-strong hover:bg-primary-ring',
  danger: 'bg-danger-ink text-white hover:bg-[#A82B3B] focus-visible:outline-danger-ink',
  ghost: 'text-ink-soft hover:bg-hover hover:text-ink',
};

const SIZES = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-11 px-5 text-[14px]',
  icon: 'size-9 p-0',
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
