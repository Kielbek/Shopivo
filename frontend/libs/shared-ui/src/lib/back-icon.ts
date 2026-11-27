import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { IconName, icons } from './icons';

/**
 * "Wróć" affordance for back/exit controls: shows the icon of the current place; when the parent (`group`) is hovered
 * or focused, it slides down and an arrow comes in from the top. With `label`/`hoverLabel` the text swaps the same way.
 * The parent element must carry the `group` class. Motion is skipped for `prefers-reduced-motion`.
 */
@Component({
  selector: 'sv-back-icon',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5' },
  template: `
    <span class="relative inline-flex shrink-0 overflow-hidden" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">
      <svg [lucideIcon]="icons[icon()]" [size]="size()" [strokeWidth]="strokeWidth()"
        class="transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] group-hover:translate-y-full group-focus-visible:translate-y-full motion-reduce:transition-none" />
      <svg [lucideIcon]="icons.arrowLeft" [size]="size()" [strokeWidth]="strokeWidth()"
        class="absolute inset-0 -translate-y-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] group-hover:translate-y-0 group-focus-visible:translate-y-0 motion-reduce:transition-none" />
    </span>
    @if (label()) {
      <span class="relative inline-grid overflow-hidden">
        <span class="col-start-1 row-start-1 transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none"
          [class.group-hover:translate-y-full]="!!hoverLabel()" [class.group-focus-visible:translate-y-full]="!!hoverLabel()">{{ label() }}</span>
        @if (hoverLabel()) {
          <span class="col-start-1 row-start-1 -translate-y-full transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.25,1)] group-hover:translate-y-0 group-focus-visible:translate-y-0 motion-reduce:transition-none"
            aria-hidden="true">{{ hoverLabel() }}</span>
        }
      </span>
    }
  `,
})
export class BackIconComponent {
  protected readonly icons = icons;
  /** Icon of the current place (shown until hover). */
  readonly icon = input<IconName>('arrowLeft');
  readonly size = input(16);
  readonly strokeWidth = input(1.75);
  readonly label = input<string>();
  /** Text shown on hover instead of `label` (e.g. „Wróć”). */
  readonly hoverLabel = input<string>();
}
