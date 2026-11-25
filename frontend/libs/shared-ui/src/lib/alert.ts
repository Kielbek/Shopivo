import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { icons } from './icons';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: 'border-primary-ring bg-primary-soft text-ink', icon: 'text-primary-strong' },
  success: { box: 'border-[#C9F2E5] bg-success-soft text-ink', icon: 'text-success-ink' },
  warning: { box: 'border-[#FFE3C2] bg-warning-soft text-ink', icon: 'text-warning-ink' },
  error: { box: 'border-[#FBD3D8] bg-danger-soft text-ink', icon: 'text-danger-ink' },
};

@Component({
  selector: 'sv-alert',
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.role]': 'tone() === "error" ? "alert" : "status"',
  },
  template: `
    <svg [lucideIcon]="icon()" [size]="18" [class]="'mt-px shrink-0 ' + TONES[tone()].icon" />
    <div class="min-w-0">
      @if (heading()) {<p class="text-[13px] font-semibold">{{ heading() }}</p>}
      <div class="text-[13px] leading-5" [class.text-ink-soft]="!!heading()"><ng-content /></div>
    </div>
  `,
})
export class AlertComponent {
  protected readonly TONES = TONES;
  readonly tone = input<AlertTone>('info');
  readonly heading = input<string>();
  protected readonly icon = computed(() =>
    ({ info: icons.info, success: icons.success, warning: icons.alert, error: icons.alert })[this.tone()]);
  protected readonly classes = computed(
    () => `flex gap-3 rounded-[var(--radius-control)] border px-4 py-3 ${TONES[this.tone()].box}`,
  );
}
