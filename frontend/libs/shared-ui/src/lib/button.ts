import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'danger' | 'ghost' | 'soft';

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium ' +
  'transition-[background-color,border-color,color,box-shadow] duration-150 focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0';

const VARIANTS: Record<ButtonVariant, string> = {
  /** Default action: night fill. */
  primary: 'bg-night text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-night-3 focus-visible:outline-night',
  /** The one key action of a screen (publish, create): neon fill, night text. */
  accent: 'bg-neon text-night shadow-[inset_0_-1px_0_rgba(15,18,16,0.12)] hover:bg-neon-deep focus-visible:outline-night',
  secondary: 'border border-line-strong bg-card text-ink shadow-[0_1px_0_rgba(15,18,16,0.04)] hover:bg-hover hover:border-[#C6CAC2]',
  soft: 'bg-primary-soft text-primary-strong hover:bg-primary-ring',
  danger: 'bg-danger-ink text-white hover:bg-[#9E262B] focus-visible:outline-danger-ink',
  ghost: 'text-ink-soft hover:bg-hover hover:text-ink',
};

const SIZES = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-5 text-[14px]',
  lg: 'h-11 px-6 text-[14px]',
  icon: 'size-9 p-0',
};

/** `<button sv-button variant="primary" [loading]="saving()">Zapisz</button>` */
@Component({
  selector: 'button[sv-button], a[sv-button]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() || null',
    '[class.sv-btn-busy]': 'loading()',
    '[attr.disabled]': 'loading() || disabled() ? "" : null',
  },
  template: `<ng-content />@if (loading()) {<span class="sr-only">Proszę czekać…</span>}`,
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
