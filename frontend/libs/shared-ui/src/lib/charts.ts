import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal,
} from '@angular/core';

export interface ChartSeries {
  name: string;
  color: string;
  values: number[];
}

export interface ChartPoint {
  x: number;
  y: number;
}

/** Monotone cubic interpolation (Fritsch–Carlson): smooth like the reference, never overshoots the data. */
export function smoothPath(points: ChartPoint[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${p.x + h},${p.y + tangent[i] * h} ${q.x - h},${q.y - tangent[i + 1] * h} ${q.x},${q.y}`;
  }
  return d;
}

/** Rounds the axis maximum up to a "nice" number (1, 2, 2.5, 5 × 10^n). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / 10 ** exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * 10 ** exponent;
}

const PAD = { top: 16, right: 12, bottom: 28, left: 44 };
let gradientCounter = 0;

/**
 * Responsive smooth area/line chart (SVG) with grid, legend-ready series colours and a hover tooltip.
 * Without data it renders the empty grid plus the projected empty-state content — never sample numbers.
 */
@Component({
  selector: 'sv-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block w-full', '[style.height.px]': 'height()' },
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" class="block overflow-visible" role="img"
      [attr.aria-label]="ariaLabel()" (pointermove)="onMove($event)" (pointerleave)="hover.set(null)">
      <defs>
        @for (s of series(); track s.name; let i = $index) {
          <linearGradient [attr.id]="gradientId + i" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" [attr.stop-color]="s.color" stop-opacity="0.22" />
            <stop offset="100%" [attr.stop-color]="s.color" stop-opacity="0" />
          </linearGradient>
        }
      </defs>
      @for (tick of yTicks(); track tick.value) {
        <line [attr.x1]="pad.left" [attr.x2]="width() - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y"
          stroke="#E8EAE5" stroke-dasharray="4 4" />
        <text [attr.x]="pad.left - 10" [attr.y]="tick.y + 4" text-anchor="end" class="fill-ink-muted text-[11px]">{{ tick.label }}</text>
      }
      @for (label of labels(); track $index; let i = $index) {
        @if (showLabel(i)) {
          <text [attr.x]="xAt(i)" [attr.y]="height() - 8" text-anchor="middle" class="fill-ink-muted text-[11px]">{{ label }}</text>
        }
      }
      @if (hasData()) {
        @for (s of plotted(); track s.name; let i = $index) {
          <path [attr.d]="s.area" [attr.fill]="'url(#' + gradientId + i + ')'" />
          <path [attr.d]="s.line" fill="none" [attr.stroke]="s.color" stroke-width="2.25" stroke-linecap="round" />
        }
        @if (hover(); as h) {
          <line [attr.x1]="xAt(h)" [attr.x2]="xAt(h)" [attr.y1]="pad.top" [attr.y2]="height() - pad.bottom"
            stroke="#C2C6BF" stroke-dasharray="3 4" />
          @for (s of plotted(); track s.name) {
            <circle [attr.cx]="xAt(h)" [attr.cy]="s.points[h].y" r="4.5" fill="#fff" [attr.stroke]="s.color" stroke-width="2.5" />
          }
        }
      }
    </svg>
    @if (hasData()) {
      @if (hover(); as h) {
        <div class="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[8px] bg-ink px-3 py-2 text-white shadow-[var(--shadow-pop)]"
          [style.left.px]="xAt(h)" [style.top.px]="tooltipTop(h) - 10">
          <p class="text-[11px] text-[#A9AEA6]">{{ labels()[h] }}</p>
          @for (s of series(); track s.name) {
            <p class="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold tabular-nums">
              <span class="size-2 rounded-full" [style.background]="s.color"></span>{{ s.name }}: {{ format()(s.values[h] ?? 0) }}
            </p>
          }
        </div>
      }
    } @else {
      <div class="absolute inset-0 flex items-center justify-center" [style.padding-left.px]="pad.left" [style.padding-bottom.px]="pad.bottom">
        <ng-content />
      </div>
    }
  `,
})
export class LineChartComponent {
  readonly labels = input.required<string[]>();
  readonly series = input.required<ChartSeries[]>();
  readonly height = input(280);
  readonly format = input<(v: number) => string>((v) => v.toLocaleString('pl-PL'));
  readonly ariaLabel = input('Wykres');

  protected readonly pad = PAD;
  protected readonly gradientId = `sv-grad-${++gradientCounter}-`;
  protected readonly width = signal(600);
  protected readonly hover = signal<number | null>(null);

  protected readonly hasData = computed(() => this.series().some((s) => s.values.length > 0));
  protected readonly max = computed(() =>
    niceMax(Math.max(0, ...this.series().flatMap((s) => s.values))));
  protected readonly yTicks = computed(() => {
    const max = this.hasData() ? this.max() : 4;
    return Array.from({ length: 5 }, (_, i) => {
      const value = (max / 4) * i;
      return { value, y: this.yAt(value, max), label: this.hasData() ? this.compact(value) : '' };
    });
  });
  protected readonly plotted = computed(() =>
    this.series().map((s) => {
      const points = s.values.map((v, i) => ({ x: this.xAt(i), y: this.yAt(v, this.max()) }));
      const line = smoothPath(points);
      const baseline = this.height() - PAD.bottom;
      const area = points.length
        ? `${line} L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z` : '';
      return { name: s.name, color: s.color, points, line, area };
    }));

  constructor() {
    const host = inject(ElementRef<HTMLElement>);
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = host.nativeElement as HTMLElement;
      const update = () => this.width.set(Math.max(240, Math.floor(el.clientWidth)));
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected xAt(i: number): number {
    const count = Math.max(1, this.labels().length - 1);
    return PAD.left + ((this.width() - PAD.left - PAD.right) * i) / count;
  }

  private yAt(value: number, max: number): number {
    const h = this.height() - PAD.top - PAD.bottom;
    return PAD.top + h - (h * value) / (max || 1);
  }

  protected showLabel(i: number): boolean {
    const n = this.labels().length;
    const maxLabels = Math.max(2, Math.floor((this.width() - PAD.left) / 56));
    const step = Math.ceil(n / maxLabels);
    return i % step === 0 || i === n - 1;
  }

  protected tooltipTop(i: number): number {
    return Math.min(...this.plotted().map((s) => s.points[i]?.y ?? this.height()));
  }

  protected onMove(event: PointerEvent): void {
    const n = this.labels().length;
    if (!this.hasData() || n === 0) return;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const step = (this.width() - PAD.left - PAD.right) / Math.max(1, n - 1);
    this.hover.set(Math.min(n - 1, Math.max(0, Math.round((x - PAD.left) / step))));
  }

  private compact(value: number): string {
    return new Intl.NumberFormat('pl-PL', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Donut chart with centre total and legend (percentages). Empty data renders a neutral ring. */
@Component({
  selector: 'sv-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-center' },
  template: `
    <div class="relative" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" class="-rotate-90" role="img" [attr.aria-label]="ariaLabel()">
        <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" stroke="#ECEDE9" [attr.stroke-width]="stroke()" />
        @for (arc of arcs(); track arc.label) {
          <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="r()" fill="none" [attr.stroke]="arc.color"
            [attr.stroke-width]="stroke()" [attr.stroke-dasharray]="arc.dash" [attr.stroke-dashoffset]="arc.offset" />
        }
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p class="text-[12px] text-ink-muted">{{ centerLabel() }}</p>
        <p class="text-[17px] font-semibold tabular-nums text-ink">{{ total() > 0 ? centerValue() : '—' }}</p>
      </div>
    </div>
    @if (total() > 0) {
      <ul class="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[12px]">
        @for (s of segments(); track s.label) {
          <li class="flex items-center gap-1.5 text-ink-muted">
            <span class="size-2.5 rounded-full" [style.background]="s.color"></span>{{ s.label }}
            <span class="font-semibold text-ink tabular-nums">{{ percent(s.value) }}%</span>
          </li>
        }
      </ul>
    }
  `,
})
export class DonutChartComponent {
  readonly segments = input.required<DonutSegment[]>();
  readonly size = input(168);
  readonly stroke = input(26);
  readonly centerLabel = input('Razem');
  readonly centerValue = input('');
  readonly ariaLabel = input('Wykres pierścieniowy');

  protected readonly c = computed(() => this.size() / 2);
  protected readonly r = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly total = computed(() => this.segments().reduce((sum, s) => sum + Math.max(0, s.value), 0));
  protected readonly arcs = computed(() => {
    const circumference = 2 * Math.PI * this.r();
    let offset = 0;
    return this.segments().filter((s) => s.value > 0).map((s) => {
      const length = (s.value / this.total()) * circumference;
      const arc = { label: s.label, color: s.color, dash: `${length} ${circumference - length}`, offset: -offset };
      offset += length;
      return arc;
    });
  });

  protected percent(value: number): string {
    return Math.round((value / this.total()) * 100).toString();
  }
}
