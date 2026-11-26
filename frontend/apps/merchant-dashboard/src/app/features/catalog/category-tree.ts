import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { Category } from '@shopivo/shared-models';
import { icons } from '@shopivo/shared-ui';

export interface TreeNode {
  category: Category;
  depth: number;
  /** Names from the root, e.g. ["Odzież", "Damskie", "Sukienki"]. */
  path: string[];
  childCount: number;
  /** Ids of all ancestors (root first). */
  ancestors: string[];
}

/** Depth-first tree order (the API returns categories breadth-first), siblings by position then name. */
export function buildTree(all: Category[]): TreeNode[] {
  const children = new Map<string | null, Category[]>();
  const ids = new Set(all.map((c) => c.id));
  for (const c of all) {
    const parent = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  const out: TreeNode[] = [];
  const walk = (parent: string | null, depth: number, path: string[], ancestors: string[]) => {
    const list = [...(children.get(parent) ?? [])].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pl'));
    for (const c of list) {
      out.push({ category: c, depth, path: [...path, c.name], childCount: children.get(c.id)?.length ?? 0, ancestors });
      walk(c.id, depth + 1, [...path, c.name], [...ancestors, c.id]);
    }
  };
  walk(null, 0, [], []);
  return out;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

/**
 * Checkbox tree for assigning a product to categories: indented with guide lines, collapsible branches, search
 * (matches keep their parents visible) and the chosen categories listed as removable chips with their full path.
 */
@Component({
  selector: 'sv-category-tree-select',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selectedNodes().length) {
      <ul class="flex flex-wrap gap-1.5 px-5 pb-3" aria-label="Wybrane kategorie">
        @for (n of selectedNodes(); track n.category.id) {
          <li class="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-[12px] text-primary-strong">
            <span class="truncate" [title]="n.path.join(' › ')">{{ n.path.join(' › ') }}</span>
            @if (!disabled()) {
              <button type="button" class="rounded-full p-0.5 hover:bg-primary/15" [attr.aria-label]="'Usuń z kategorii ' + n.category.name" (click)="toggle(n.category.id, false)">
                <svg [lucideIcon]="icons.close" [size]="12" /></button>
            }
          </li>
        }
      </ul>
    }
    @if (nodes().length > 8) {
      <div class="relative px-5 pb-2">
        <svg [lucideIcon]="icons.search" [size]="14" class="pointer-events-none absolute left-8 top-1/2 -translate-y-[calc(50%+4px)] text-ink-muted" />
        <input type="search" class="sv-input !h-9 pl-8 !text-[13px]" placeholder="Szukaj kategorii" aria-label="Szukaj kategorii"
          [value]="query()" (input)="query.set($any($event.target).value)" />
      </div>
    }
    <ul class="max-h-80 overflow-y-auto px-3 pb-3" role="tree" aria-label="Kategorie" aria-multiselectable="true">
      @for (n of visible(); track n.category.id) {
        <li role="treeitem" [attr.aria-level]="n.depth + 1" [attr.aria-expanded]="n.childCount ? !collapsed().has(n.category.id) : null"
          [attr.aria-selected]="value().includes(n.category.id)" class="relative flex items-center gap-1 rounded-[8px] pr-2 hover:bg-hover"
          [style.padding-left.px]="4 + n.depth * 20">
          @for (d of guides(n.depth); track $index) {
            <span class="absolute bottom-0 top-0 border-l border-line" [style.left.px]="14 + d * 20" aria-hidden="true"></span>
          }
          @if (n.childCount && !query()) {
            <button type="button" class="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-[6px] text-ink-muted hover:bg-canvas hover:text-ink"
              [attr.aria-label]="(collapsed().has(n.category.id) ? 'Rozwiń ' : 'Zwiń ') + n.category.name" (click)="toggleCollapse(n.category.id)">
              <svg [lucideIcon]="collapsed().has(n.category.id) ? icons.chevronRight : icons.chevronDown" [size]="14" />
            </button>
          } @else {
            <span class="size-6 shrink-0"></span>
          }
          <label class="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-1.5 text-[13px]"
            [class]="n.depth === 0 ? 'font-medium text-ink' : 'text-ink-soft'">
            <input type="checkbox" class="sv-checkbox" [checked]="value().includes(n.category.id)" [disabled]="disabled()"
              (change)="toggle(n.category.id, $any($event.target).checked)" />
            <span class="truncate">{{ n.category.name }}</span>
            @if (n.childCount) {<span class="text-[11px] font-normal text-ink-muted">{{ n.childCount }}</span>}
          </label>
        </li>
      } @empty {
        <li class="px-2 py-3 text-[13px] text-ink-muted">Brak kategorii pasujących do „{{ query() }}”.</li>
      }
    </ul>
  `,
})
export class CategoryTreeSelectComponent {
  protected readonly icons = icons;
  readonly categories = input.required<Category[]>();
  readonly value = model<string[]>([]);
  readonly disabled = input(false);
  protected readonly query = signal('');
  protected readonly collapsed = signal(new Set<string>());

  protected readonly nodes = computed(() => buildTree(this.categories()));
  protected readonly selectedNodes = computed(() => this.nodes().filter((n) => this.value().includes(n.category.id)));

  protected readonly visible = computed(() => {
    const q = normalize(this.query().trim());
    const nodes = this.nodes();
    if (q) {
      const keep = new Set<string>();
      for (const n of nodes) {
        if (normalize(n.category.name).includes(q)) {
          keep.add(n.category.id);
          n.ancestors.forEach((a) => keep.add(a));
        }
      }
      return nodes.filter((n) => keep.has(n.category.id));
    }
    const hidden = this.collapsed();
    return nodes.filter((n) => !n.ancestors.some((a) => hidden.has(a)));
  });

  protected guides(depth: number): number[] {
    return Array.from({ length: depth }, (_, i) => i);
  }

  protected toggleCollapse(id: string): void {
    const next = new Set(this.collapsed());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.collapsed.set(next);
  }

  protected toggle(id: string, on: boolean): void {
    const set = new Set(this.value());
    if (on) set.add(id); else set.delete(id);
    this.value.set([...set]);
  }
}
