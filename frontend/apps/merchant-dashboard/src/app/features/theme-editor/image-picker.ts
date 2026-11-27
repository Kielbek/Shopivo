import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ProductImage, TemplateImage } from '@shopivo/shared-models';
import { ButtonComponent, DialogComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const TYPES = ['image/jpeg', 'image/png'];

/**
 * The store's image library for the theme: pick an image, upload new ones (button or drag & drop) or remove unused
 * ones. Emits the chosen image (with its URLs, so the live preview can show it at once).
 */
@Component({
  selector: 'sv-image-picker',
  imports: [LucideDynamicIcon, ButtonComponent, DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-dialog heading="Wybierz zdjęcie" [open]="open()" (closed)="closed.emit()">
      <div class="relative rounded-[12px] border-2 border-dashed p-4 text-center transition-colors"
        [class]="over() ? 'border-primary bg-primary-soft' : 'border-line-strong bg-canvas/60'"
        (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="drop($event)">
        <p class="text-[13px] text-ink-soft">Przeciągnij zdjęcia tutaj albo</p>
        <button sv-button size="sm" class="mt-2" type="button" [loading]="uploading()" (click)="file.click()"><svg [lucideIcon]="icons.upload" />Wybierz z dysku</button>
        <p class="mt-2 text-[11px] text-ink-muted">JPEG lub PNG, do 10 MB. Na baner najlepiej poziome, min. 1600 px szerokości.</p>
        <input #file type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept="image/jpeg,image/png" multiple (change)="picked($event)" />
      </div>
      @if (templateImages().length) {
        <p class="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Zdjęcia szablonu</p>
        <ul class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Zdjęcia szablonu">
          @for (img of templateImages(); track img.ref) {
            <li>
              <button type="button" class="block w-full overflow-hidden rounded-[8px] border-2 transition-colors"
                [class]="img.ref === selected() ? 'border-primary' : 'border-transparent hover:border-line-strong'"
                [attr.aria-label]="'Wybierz zdjęcie szablonu: ' + img.label" [attr.aria-pressed]="img.ref === selected()" [title]="img.label" (click)="chooseTemplate(img)">
                <img [src]="img.urls['w400']" alt="" class="aspect-square w-full object-cover" loading="lazy" />
              </button>
            </li>
          }
        </ul>
        <p class="mt-4 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Twoje zdjęcia</p>
      }
      @if (loading()) {
        <div class="mt-4 grid grid-cols-3 gap-2">@for (i of [1, 2, 3]; track i) {<span class="sv-shimmer block aspect-square rounded-[8px]"></span>}</div>
      } @else if (images().length) {
        <ul class="mt-4 grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" aria-label="Biblioteka zdjęć">
          @for (img of images(); track img.id) {
            <li class="group relative">
              <button type="button" class="block w-full overflow-hidden rounded-[8px] border-2 transition-colors"
                [class]="img.id === selected() ? 'border-primary' : 'border-transparent hover:border-line-strong'"
                [attr.aria-label]="'Wybierz zdjęcie ' + (img.alt || '')" [attr.aria-pressed]="img.id === selected()" (click)="choose(img)">
                <img [src]="img.urls['w400']" alt="" class="aspect-square w-full object-cover" loading="lazy" />
              </button>
              <button type="button" class="absolute right-1.5 top-1.5 hidden rounded-[6px] bg-card/95 p-1 text-ink-soft shadow hover:text-danger-ink group-hover:block focus:block"
                [attr.aria-label]="'Usuń zdjęcie z biblioteki'" (click)="remove(img)"><svg [lucideIcon]="icons.trash" [size]="14" /></button>
            </li>
          }
        </ul>
      } @else {
        <p class="mt-4 text-center text-[13px] text-ink-muted">Biblioteka jest pusta — dodaj pierwsze zdjęcie.</p>
      }
      <ng-container dialog-actions>
        @if (selected()) {<button sv-button variant="ghost" type="button" (click)="cleared.emit()">Bez zdjęcia</button>}
        <button sv-button variant="secondary" type="button" (click)="closed.emit()">Zamknij</button>
      </ng-container>
    </sv-dialog>
  `,
})
export class ImagePickerComponent {
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  readonly tenantId = input.required<string>();
  readonly open = input(false);
  readonly selected = input<string | null>(null);
  /** Photos shipped with the current template — shared, never copied; choosing one stores its `tpl:` reference. */
  readonly templateImages = input<TemplateImage[]>([]);
  readonly chosen = output<ProductImage>();
  readonly cleared = output<void>();
  readonly closed = output<void>();
  protected readonly images = signal<ProductImage[]>([]);
  protected readonly loading = signal(false);
  protected readonly uploading = signal(false);
  protected readonly over = signal(false);
  private loadedFor: string | null = null;

  /** Loads the library once per store (called by the editor when the dialog opens). */
  async load(): Promise<ProductImage[]> {
    if (this.loadedFor === this.tenantId()) return this.images();
    this.loading.set(true);
    try {
      this.images.set(await firstValueFrom(this.api.themeImages(this.tenantId())));
      this.loadedFor = this.tenantId();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    } finally {
      this.loading.set(false);
    }
    return this.images();
  }

  protected chooseTemplate(img: TemplateImage): void {
    this.chosen.emit({ id: img.ref, alt: img.label, width: 0, height: 0, position: 0, urls: img.urls } as ProductImage);
  }

  protected choose(img: ProductImage): void {
    this.chosen.emit(img);
  }

  protected picked(e: Event): void {
    const el = e.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    void this.upload(files);
  }

  protected drop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    void this.upload(Array.from(e.dataTransfer?.files ?? []));
  }

  private async upload(files: File[]): Promise<void> {
    this.uploading.set(true);
    let last: ProductImage | null = null;
    for (const f of files) {
      if (!TYPES.includes(f.type)) { this.toast.error(`${f.name}: dozwolone są pliki JPEG i PNG.`); continue; }
      if (f.size > 10 * 1024 * 1024) { this.toast.error(`${f.name}: plik jest większy niż 10 MB.`); continue; }
      try {
        last = await firstValueFrom(this.api.uploadThemeImage(this.tenantId(), f));
        this.images.update((l) => [...l, last!]);
      } catch (err) {
        this.toast.error(`${f.name}: ${ApiError.from(err).message}`);
      }
    }
    this.uploading.set(false);
    if (last && files.length === 1) this.chosen.emit(last);
  }

  protected async remove(img: ProductImage): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteThemeImage(this.tenantId(), img.id));
      this.images.update((l) => l.filter((i) => i.id !== img.id));
      if (img.id === this.selected()) this.cleared.emit();
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
