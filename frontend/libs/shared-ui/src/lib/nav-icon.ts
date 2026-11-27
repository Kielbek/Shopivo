import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';
import { NAV_ICON_PATHS } from './nav-icon-paths';

/**
 * Navigation icon (Hugeicons, stroke-rounded): soft, rounded glyphs like the reference admin; the active item is marked
 * by its neon background, the glyph stays the same.
 * Falls back to the Lucide registry for names without a navigation glyph.
 */
@Component({
  selector: 'sv-nav-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    @if (paths(); as ps) {
      <svg viewBox="0 0 24 24" fill="currentColor" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        @for (p of ps; track $index) {<path [attr.d]="p.d" [attr.fill-rule]="p.r ?? null" [attr.clip-rule]="p.r ?? null" />}
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
  protected readonly paths = computed(() => NAV_ICON_PATHS[this.name()] ?? null);
  protected readonly lucide = computed(() => icons[this.name() as IconName] ?? icons.dashboard);
}
