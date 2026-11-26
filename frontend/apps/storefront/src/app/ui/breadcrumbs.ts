import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb { label: string; link: unknown[] | null; }

@Component({
  selector: 'sf-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Ścieżka nawigacji" class="text-[13px] text-sf-muted">
      <ol class="flex flex-wrap items-center gap-1.5">
        <li><a routerLink="/" class="hover:underline">Strona główna</a></li>
        @for (c of items(); track $index) {
          <li aria-hidden="true">/</li>
          <li>
            @if (c.link) {<a [routerLink]="c.link" class="hover:underline">{{ c.label }}</a>}
            @else {<span aria-current="page" class="text-sf-text">{{ c.label }}</span>}
          </li>
        }
      </ol>
    </nav>
  `,
})
export class BreadcrumbsComponent {
  readonly items = input.required<Crumb[]>();
}
