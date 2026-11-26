import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { parseRichText } from '@shopivo/shared-models';

/** Preview of a page body, rendered with the same parser as the storefront (no innerHTML). */
@Component({
  selector: 'sv-rich-preview',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #inl let-items>
      @for (i of $any(items); track $index) {
        @if (i.br) {<br />}
        @else if (i.route || i.href) {<span class="text-brand underline" [title]="i.route || i.href">{{ i.text }}</span>}
        @else if (i.bold) {<strong class="font-semibold">{{ i.text }}</strong>}
        @else if (i.italic) {<em>{{ i.text }}</em>}
        @else {{{ i.text }}}
      }
    </ng-template>
    <div class="space-y-3 text-[14px] leading-relaxed text-ink">
      @for (b of blocks(); track $index) {
        @switch (b.type) {
          @case ('h2') {<h2 class="pt-3 text-[18px] font-semibold"><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></h2>}
          @case ('h3') {<h3 class="pt-2 text-[15px] font-semibold"><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></h3>}
          @case ('p') {<p><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></p>}
          @case ('ul') {<ul class="list-disc space-y-1 pl-5">@for (item of $any(b).items; track $index) {<li><ng-container *ngTemplateOutlet="inl; context: { $implicit: item }" /></li>}</ul>}
          @case ('ol') {<ol class="list-decimal space-y-1 pl-5">@for (item of $any(b).items; track $index) {<li><ng-container *ngTemplateOutlet="inl; context: { $implicit: item }" /></li>}</ol>}
          @case ('hr') {<hr class="border-line" />}
        }
      } @empty {
        <p class="text-ink-muted">Treść jest pusta.</p>
      }
    </div>
  `,
})
export class RichPreviewComponent {
  readonly source = input<string>('');
  protected readonly blocks = computed(() => parseRichText(this.source()));
}
