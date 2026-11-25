import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

/** App-wide notifications (feedback after actions). Rendered by `<sv-toast-outlet>`. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.push('success', message);
  }

  error(message: string): void {
    this.push('error', message, 7000);
  }

  info(message: string): void {
    this.push('info', message);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(tone: ToastTone, message: string, ttl = 4500): void {
    const id = ++this.counter;
    this.toasts.update((list) => [...list.slice(-3), { id, tone, message }]);
    setTimeout(() => this.dismiss(id), ttl);
  }
}

@Component({
  selector: 'sv-toast-outlet',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end' },
  template: `
    <div aria-live="polite" class="contents">
      @for (t of toast.toasts(); track t.id) {
        <div role="status" class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[12px] border border-line bg-card px-4 py-3 shadow-[var(--shadow-pop)]">
          <svg [lucideIcon]="t.tone === 'error' ? icons.alert : t.tone === 'success' ? icons.success : icons.info" [size]="18"
            [class]="t.tone === 'error' ? 'text-danger-ink' : t.tone === 'success' ? 'text-success-ink' : 'text-primary-strong'" class="mt-px shrink-0" />
          <p class="flex-1 text-[13px] text-ink">{{ t.message }}</p>
          <button type="button" class="-mr-1 rounded-[6px] p-0.5 text-ink-muted hover:bg-hover hover:text-ink" (click)="toast.dismiss(t.id)" aria-label="Zamknij powiadomienie">
            <svg [lucideIcon]="icons.close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastOutletComponent {
  protected readonly toast = inject(ToastService);
  protected readonly icons = icons;
}
