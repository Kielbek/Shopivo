import { ChangeDetectionStrategy, Component, inject, input, model, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ProductImage } from '@shopivo/shared-models';
import { ButtonComponent, CardComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const MAX = 10;
const MAX_BYTES = 10 * 1024 * 1024;

/** Product photos: upload (JPEG/PNG, validated again on the server), order, alternative text, removal. */
@Component({
  selector: 'sv-product-images',
  imports: [LucideDynamicIcon, ButtonComponent, CardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sv-card heading="Zdjęcia" [subheading]="'JPEG lub PNG, do 10 MB, najwyżej ' + max + '. Pierwsze zdjęcie jest główne.'">
      <div card-actions>
        @if (canWrite() && images().length < max) {
          <label class="sv-button-like inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-card px-3 text-[13px] font-medium text-ink hover:bg-hover">
            <svg [lucideIcon]="icons.image" [size]="16" />{{ uploading() ? 'Wysyłanie…' : 'Dodaj zdjęcia' }}
            <input type="file" class="sr-only" accept="image/jpeg,image/png" multiple [disabled]="uploading()" (change)="upload($event)" />
          </label>
        }
      </div>
      @if (!images().length) {
        <p class="text-[13px] text-ink-muted">Brak zdjęć. Produkty ze zdjęciami sprzedają się lepiej i lepiej wyglądają w wyszukiwarkach.</p>
      } @else {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          @for (img of images(); track img.id; let i = $index; let first = $first; let last = $last) {
            <li class="overflow-hidden rounded-[10px] border border-line bg-card">
              <div class="relative aspect-square bg-canvas">
                <img [src]="img.urls['w400']" [alt]="img.alt || ''" class="size-full object-cover" loading="lazy" />
                @if (first) {<span class="absolute left-2 top-2 rounded-[6px] bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">Główne</span>}
              </div>
              <div class="space-y-2 p-2">
                <input class="sv-input !h-8 !text-[12px]" [value]="img.alt ?? ''" maxlength="200" placeholder="Opis zdjęcia (alt)"
                  [attr.aria-label]="'Opis zdjęcia ' + (i + 1)" [disabled]="!canWrite()" (change)="saveAlt(img, $any($event.target).value)" />
                @if (canWrite()) {
                  <div class="flex justify-between">
                    <span class="flex gap-1">
                      <button sv-button type="button" variant="ghost" size="icon" [disabled]="first" [attr.aria-label]="'Przesuń zdjęcie ' + (i + 1) + ' wcześniej'" (click)="move(i, -1)"><svg [lucideIcon]="icons.chevronLeft" /></button>
                      <button sv-button type="button" variant="ghost" size="icon" [disabled]="last" [attr.aria-label]="'Przesuń zdjęcie ' + (i + 1) + ' dalej'" (click)="move(i, 1)"><svg [lucideIcon]="icons.chevronRight" /></button>
                    </span>
                    <button sv-button type="button" variant="ghost" size="icon" [attr.aria-label]="'Usuń zdjęcie ' + (i + 1)" (click)="remove(img)"><svg [lucideIcon]="icons.trash" /></button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
      }
    </sv-card>
  `,
})
export class ProductImagesComponent {
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly max = MAX;

  readonly tenantId = input.required<string>();
  readonly productId = input.required<string>();
  readonly canWrite = input(false);
  readonly images = model<ProductImage[]>([]);
  protected readonly uploading = signal(false);

  protected async upload(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement;
    const files = Array.from(inputEl.files ?? []);
    inputEl.value = '';
    if (!files.length) return;
    this.uploading.set(true);
    try {
      for (const file of files.slice(0, MAX - this.images().length)) {
        if (file.size > MAX_BYTES) {
          this.toast.error(`${file.name}: plik jest większy niż 10 MB.`);
          continue;
        }
        try {
          const img = await firstValueFrom(this.api.uploadImage(this.tenantId(), this.productId(), file, null));
          this.images.update((list) => [...list, img]);
        } catch (e) {
          this.toast.error(`${file.name}: ${ApiError.from(e).message}`);
        }
      }
    } finally {
      this.uploading.set(false);
    }
  }

  protected async move(index: number, delta: number): Promise<void> {
    const list = [...this.images()];
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    const previous = this.images();
    this.images.set(list);
    try {
      this.images.set(await firstValueFrom(this.api.updateImages(this.tenantId(), this.productId(), list.map((i) => i.id), null)));
    } catch (e) {
      this.images.set(previous);
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async saveAlt(img: ProductImage, alt: string): Promise<void> {
    try {
      this.images.set(await firstValueFrom(this.api.updateImages(this.tenantId(), this.productId(), null, { [img.id]: alt })));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async remove(img: ProductImage): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteImage(this.tenantId(), this.productId(), img.id));
      this.images.update((list) => list.filter((i) => i.id !== img.id));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}
