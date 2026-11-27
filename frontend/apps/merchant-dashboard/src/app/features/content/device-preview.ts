import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from '@shopivo/shared-ui';

export type Device = 'desktop' | 'tablet' | 'phone';

const DEVICES: { id: Device; label: string; width: number; height: number; icon: 'monitor' | 'tablet' | 'smartphone' }[] = [
  { id: 'desktop', label: 'Komputer', width: 1280, height: 860, icon: 'monitor' },
  { id: 'tablet', label: 'Tablet', width: 820, height: 1080, icon: 'tablet' },
  { id: 'phone', label: 'Telefon', width: 390, height: 780, icon: 'smartphone' },
];

/**
 * The real storefront page (preview link with a signed token, so drafts are visible) in an iframe at a device width,
 * scaled down to fit. The storefront allows framing by the panel only for preview responses.
 */
@Component({
  selector: 'sv-device-preview',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <div class="inline-flex rounded-[10px] bg-canvas p-1" role="radiogroup" aria-label="Widok urządzenia">
        @for (d of devices; track d.id) {
          <button type="button" role="radio" [attr.aria-checked]="device() === d.id"
            class="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors"
            [class]="device() === d.id ? 'bg-card text-ink shadow-[0_1px_2px_rgba(15,18,16,0.08)]' : 'text-ink-muted hover:text-ink'"
            (click)="device.set(d.id)">
            <svg [lucideIcon]="icons[d.icon]" [size]="15" />{{ d.label }}
          </button>
        }
      </div>
      <span class="flex-1"></span>
      @if (url()) {
        <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] text-ink-soft hover:bg-hover hover:text-ink" (click)="reload()">
          <svg [lucideIcon]="icons.refresh" [size]="15" />Odśwież</button>
        <a class="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] text-ink-soft hover:bg-hover hover:text-ink" [href]="url()" target="_blank" rel="noopener">
          <svg [lucideIcon]="icons.external" [size]="15" />Nowa karta</a>
      }
    </div>

    <div #stage class="relative mt-3 flex shrink-0 justify-center overflow-hidden rounded-[14px] bg-[#E9ECF1] p-4" [style.height.px]="stageHeight()">
      @if (safeUrl(); as src) {
        <div class="origin-top overflow-hidden bg-white shadow-[0_8px_30px_rgba(15,18,16,0.12)]"
          [class]="device() === 'phone' ? 'rounded-[28px] ring-[10px] ring-[#0F1210]' : device() === 'tablet' ? 'rounded-[18px] ring-[8px] ring-[#0F1210]' : 'rounded-[10px]'"
          [style.width.px]="current().width" [style.height.px]="current().height" [style.transform]="'scale(' + scale() + ')'">
          @if (device() === 'desktop') {
            <div class="flex h-7 items-center gap-1.5 border-b border-[#e5e7eb] bg-[#f6f7f9] px-3" aria-hidden="true">
              <span class="size-2.5 rounded-full bg-[#ff5f57]"></span><span class="size-2.5 rounded-full bg-[#febc2e]"></span><span class="size-2.5 rounded-full bg-[#28c840]"></span>
            </div>
          }
          <iframe [src]="src" [title]="title()" class="block w-full border-0 bg-white" [style.height]="device() === 'desktop' ? 'calc(100% - 28px)' : '100%'"
            sandbox="allow-scripts allow-same-origin allow-forms" referrerpolicy="no-referrer" loading="lazy"></iframe>
        </div>
      } @else {
        <div class="flex w-full flex-col items-center justify-center gap-3 p-6">
          <span class="sv-shimmer block h-6 w-1/2 rounded-[6px]"></span>
          <span class="sv-shimmer block h-40 w-3/4 rounded-[10px]"></span>
          <span class="sr-only">Wczytywanie podglądu…</span>
        </div>
      }
    </div>
  `,
})
export class DevicePreviewComponent {
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly icons = icons;
  protected readonly devices = DEVICES;
  readonly url = input<string | null>(null);
  readonly title = input('Podgląd strony sklepu');
  protected readonly device = signal<Device>('desktop');
  private readonly nonce = signal(0);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly stageWidth = signal(900);

  protected readonly current = computed(() => DEVICES.find((d) => d.id === this.device())!);
  protected readonly scale = computed(() => Math.min(1, (this.stageWidth() - 32) / (this.current().width + 20)));
  protected readonly stageHeight = computed(() => Math.round((this.current().height + 20) * this.scale()) + 32);
  /** Trusted only for URLs we built from the API's preview link (https or the local dev origin). */
  protected readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const u = this.url();
    if (!u || !/^https?:\/\//.test(u)) return null;
    const withNonce = this.nonce() ? u + (u.includes('?') ? '&' : '?') + '_r=' + this.nonce() : u;
    return this.sanitizer.bypassSecurityTrustResourceUrl(withNonce);
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const el = this.stage()?.nativeElement;
      if (!el) return;
      const ro = new ResizeObserver(([entry]) => this.stageWidth.set(entry.contentRect.width + 32));
      ro.observe(el);
      destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  protected reload(): void {
    this.nonce.update((n) => n + 1);
  }
}
