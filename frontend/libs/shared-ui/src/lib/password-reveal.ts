import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

/**
 * Eye button that shows / hides a password input. Place it next to the input inside a `relative` wrapper and give the
 * input right padding (e.g. `pr-11`). Works with any forms API because it only switches the input's `type`.
 */
@Component({
  selector: 'sv-password-reveal',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-y-0 right-1 flex items-center' },
  template: `
    <button type="button" class="flex size-9 items-center justify-center rounded-[8px] text-ink-muted transition-colors hover:bg-hover hover:text-ink
      focus-visible:outline-2 focus-visible:outline-primary"
      [attr.aria-label]="shown() ? 'Ukryj hasło' : 'Pokaż hasło'" [attr.aria-pressed]="shown()" [attr.aria-controls]="input().id || null" (click)="toggle()">
      <svg [lucideIcon]="shown() ? icons.eyeOff : icons.eye" [size]="18" />
    </button>
  `,
})
export class PasswordRevealComponent {
  protected readonly icons = icons;
  readonly input = input.required<HTMLInputElement>();
  protected readonly shown = signal(false);

  protected toggle(): void {
    const el = this.input();
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    this.shown.set(show);
    el.focus();
  }
}
