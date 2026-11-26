import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

let nextId = 0;

/**
 * A small "?" button that explains a term (e.g. SEO). Opens on hover, keyboard focus or tap; Escape closes it.
 * The text is linked with aria-describedby, so screen readers announce it with the button.
 */
@Component({
  selector: 'sv-info-tip',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative inline-flex align-middle', '(mouseenter)': 'show()', '(mouseleave)': 'hide()', '(document:keydown.escape)': 'hide()' },
  template: `
    <button type="button" class="inline-flex size-5 items-center justify-center rounded-full text-ink-muted transition-colors hover:text-primary
      focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      [attr.aria-label]="label()" [attr.aria-describedby]="id" [attr.aria-expanded]="open()"
      (focus)="show()" (blur)="hide()" (click)="open() ? hide() : show()">
      <svg [lucideIcon]="icons.question" [size]="15" />
    </button>
    <span role="tooltip" [id]="id"
      class="absolute top-full z-50 mt-1.5 w-[min(300px,calc(100vw-32px))] rounded-[10px] bg-ink px-3 py-2.5 text-left text-[12px] font-normal leading-[18px]
        text-white shadow-lg transition-opacity"
      [class]="(alignRight() ? 'right-0' : 'left-0') + (open() ? ' visible opacity-100' : ' invisible opacity-0')">
      @if (title()) {<span class="mb-1 block font-semibold">{{ title() }}</span>}
      {{ text() }}
    </span>
  `,
})
export class InfoTipComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly icons = icons;
  protected readonly id = `sv-tip-${++nextId}`;
  readonly text = input.required<string>();
  readonly title = input<string>();
  readonly label = input('Wyjaśnienie');
  protected readonly open = signal(false);
  protected readonly alignRight = signal(false);

  protected show(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.alignRight.set(rect.left + 300 > window.innerWidth - 16);
    this.open.set(true);
  }

  protected hide(): void {
    this.open.set(false);
  }
}
