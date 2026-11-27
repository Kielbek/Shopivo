import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';
import { NAV_ICON_PATHS } from './nav-icon-paths';

/**
 * Navigation icon (Phosphor): regular outline at rest, filled when the item is active — the modern admin look.
 * Falls back to the Lucide registry for names without a navigation glyph.
 */
@Component({
  selector: 'sv-nav-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (paths(); as ps) {
      <svg viewBox="0 0 256 256" fill="currentColor" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        @for (d of ps; track $index) {<path [attr.d]="d" />}
      </svg>
    } @else {
      <svg [lucideIcon]="lucide()" [size]="size()" [strokeWidth]="1.75" aria-hidden="true" />
    }
  `,
})
export class NavIconComponent {
  readonly name = input.required<IconName | string>();
  readonly active = input(false);
  readonly size = input(18);
  protected readonly paths = computed(() => {
    const set = NAV_ICON_PATHS[this.name()];
    return set ? (this.active() ? set.fill : set.regular) : null;
  });
  protected readonly lucide = computed(() => icons[this.name() as IconName] ?? icons.dashboard);
}
