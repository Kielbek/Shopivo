import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ThemeEditorPage } from '../theme-editor/theme-editor.page';
import { TemplateEditorPage } from './template-editor.page';

/**
 * "Edytor wyglądu": templates built as template packages (engine v2) open the new in-place editor, the others the
 * previous section editor.
 */
@Component({
  selector: 'sv-editor-entry-page',
  imports: [ThemeEditorPage, TemplateEditorPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    @if (kind() === 'v2') {<sv-template-editor-page [tenantId]="tenantId()" />}
    @else if (kind() === 'v1') {<sv-theme-editor-page [tenantId]="tenantId()" />}
    @else {<div class="flex h-dvh items-center justify-center bg-canvas"><span class="sv-shimmer h-10 w-64 rounded-[10px]"></span></div>}
  `,
})
export class EditorEntryPage {
  readonly tenantId = input.required<string>();
  private readonly api = inject(StorefrontAdminApi);
  private readonly probe = rxResource({ params: () => this.tenantId(), stream: ({ params }) => this.api.template(params) });
  protected readonly kind = computed<'v1' | 'v2' | null>(() => {
    if (this.probe.hasValue()) return 'v2';
    const e = this.probe.error();
    if (!e) return null;
    return ApiError.from(e).code === 'NOT_A_TEMPLATE_PACKAGE' ? 'v1' : 'v2';
  });
}
