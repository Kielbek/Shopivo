import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, input, output, signal, viewChild } from '@angular/core';

interface Turnstile {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window { turnstile?: Turnstile; }
}

let loading: Promise<Turnstile> | null = null;

/** Loads Cloudflare's widget script once, only on pages with a protected form. */
function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
    script.onerror = () => {
      loading = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Bot check for public forms (Cloudflare Turnstile). Emits a single-use token; call {@link reset} after every submit.
 * Rendered only in the browser.
 */
@Component({
  selector: 'sf-captcha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #box class="min-h-[65px]"></div>
    @if (failed()) {<p class="text-[13px] text-sf-danger" role="alert">Nie udało się wczytać zabezpieczenia przed botami. Sprawdź połączenie i odśwież stronę.</p>}`,
})
export class CaptchaComponent implements OnDestroy {
  readonly siteKey = input.required<string>();
  readonly token = output<string | null>();
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private api: Turnstile | null = null;
  private widget: string | null = null;
  protected readonly failed = signal(false);

  constructor() {
    afterNextRender(() => {
      loadTurnstile().then((api) => {
        this.api = api;
        this.widget = api.render(this.box().nativeElement, {
          sitekey: this.siteKey(),
          language: 'pl',
          callback: (t: string) => this.token.emit(t),
          'expired-callback': () => this.token.emit(null),
          'error-callback': () => this.token.emit(null),
        });
      }).catch(() => this.failed.set(true));
    });
  }

  reset(): void {
    this.token.emit(null);
    if (this.api && this.widget) this.api.reset(this.widget);
  }

  ngOnDestroy(): void {
    if (this.api && this.widget) this.api.remove(this.widget);
  }
}
