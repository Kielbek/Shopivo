import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { parseRichText } from '../core/rich-text';

/** Renders page/post bodies from parsed data (no innerHTML). */
@Component({
  selector: 'sf-rich-text',
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #inl let-items>
      @for (i of $any(items); track $index) {
        @if (i.br) {<br />}
        @else if (i.route) {<a class="sf-link" [routerLink]="i.route">{{ i.text }}</a>}
        @else if (i.href) {<a class="sf-link" [href]="i.href" target="_blank" rel="noopener nofollow">{{ i.text }}</a>}
        @else if (i.bold) {<strong class="font-semibold">{{ i.text }}</strong>}
        @else if (i.italic) {<em>{{ i.text }}</em>}
        @else {{{ i.text }}}
      }
    </ng-template>
    <div class="space-y-4 text-[16px] leading-relaxed">
      @for (b of blocks(); track $index) {
        @switch (b.type) {
          @case ('h2') {<h2 class="pt-4 text-[22px] font-semibold tracking-tight"><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></h2>}
          @case ('h3') {<h3 class="pt-2 text-[18px] font-semibold"><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></h3>}
          @case ('p') {<p><ng-container *ngTemplateOutlet="inl; context: { $implicit: $any(b).inlines }" /></p>}
          @case ('ul') {
            <ul class="list-disc space-y-1.5 pl-6">
              @for (item of $any(b).items; track $index) {<li><ng-container *ngTemplateOutlet="inl; context: { $implicit: item }" /></li>}
            </ul>
          }
          @case ('ol') {
            <ol class="list-decimal space-y-1.5 pl-6">
              @for (item of $any(b).items; track $index) {<li><ng-container *ngTemplateOutlet="inl; context: { $implicit: item }" /></li>}
            </ol>
          }
          @case ('hr') {<hr class="border-sf-line" />}
        }
      }
    </div>
  `,
})
export class RichTextComponent {
  readonly source = input<string | null>('');
  protected readonly blocks = computed(() => parseRichText(this.source()));
}
