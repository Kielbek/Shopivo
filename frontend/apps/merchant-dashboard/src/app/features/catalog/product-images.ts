import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, model, signal } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ApiError, StorefrontAdminApi } from '@shopivo/api-client';
import { ProductImage } from '@shopivo/shared-models';
import { ButtonComponent, CardComponent, SpinnerComponent, ToastService, icons } from '@shopivo/shared-ui';
import { firstValueFrom } from 'rxjs';

const MAX = 10;
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png'];

/** A photo chosen before the product exists; uploaded right after the product is created. */
export interface PendingImage { key: string; file: File; url: string; alt: string; }

interface Tile { key: string; url: string; alt: string; saved: ProductImage | null; pending: PendingImage | null; }

/**
 * Product photos: drag & drop anywhere on the page (the page blurs and shows a drop target), a file picker, reordering
 * by dragging (or arrow buttons for keyboard users), alternative text and removal. For a product that is not saved yet
 * the photos are kept in the browser ({@link pending}) and uploaded by the page after the product is created.
 */
@Component({
  selector: 'sv-product-images',
  imports: [LucideDynamicIcon, ButtonComponent, CardComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block',
    '[class.z-[60]]': 'fileDrag() && canWrite()',
    '(document:dragenter)': 'docDragEnter($event)',
    '(document:dragover)': 'docDragOver($event)',
    '(document:dragleave)': 'docDragLeave($event)',
    '(document:drop)': 'docDrop($event)',
  },
  template: `
    <sv-card class="relative block" heading="Zdjęcia" [subheading]="'JPEG lub PNG, do 10 MB, najwyżej ' + max + '. Pierwsze zdjęcie jest główne — przeciągnij, aby zmienić kolejność.'">
      <div card-actions>
        @if (canWrite() && count() > 0 && count() < max) {
          <button sv-button type="button" size="sm" variant="secondary" [disabled]="uploading() > 0" (click)="picker.click()">
            <svg [lucideIcon]="icons.imagePlus" />Dodaj zdjęcia
          </button>
        }
      </div>
      <input #picker type="file" class="sr-only" tabindex="-1" aria-hidden="true" accept="image/jpeg,image/png" multiple (change)="picked($event)" />

      @if (count() === 0 && uploading() === 0) {
        <div class="flex flex-col items-center justify-center rounded-[12px] border-2 border-dashed border-line-strong bg-canvas/60 px-6 py-10 text-center
          transition-colors">
          <span class="flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
            <svg [lucideIcon]="icons.imagePlus" [size]="22" />
          </span>
          <p class="mt-3 text-[14px] font-medium text-ink">Przeciągnij zdjęcia tutaj</p>
          <p class="mt-1 text-[12px] text-ink-muted">albo</p>
          @if (canWrite()) {
            <button sv-button type="button" class="mt-2" (click)="picker.click()"><svg [lucideIcon]="icons.upload" />Wybierz z dysku</button>
          }
          <p class="mt-3 max-w-sm text-[12px] text-ink-muted">Najlepiej kwadratowe, min. 1000 × 1000 px, na jasnym tle. Produkty ze zdjęciami sprzedają się
            lepiej i lepiej wyglądają w Google.</p>
        </div>
      } @else {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Zdjęcia produktu">
          @for (t of tiles(); track t.key; let i = $index; let first = $first; let last = $last) {
            <li class="group overflow-hidden rounded-[10px] border bg-card transition-[border-color,opacity,transform]"
              [class]="dragKey() === t.key ? 'border-line opacity-40' : dropKey() === t.key ? 'border-primary ring-2 ring-primary/30' : 'border-line'"
              [attr.draggable]="canWrite()" (dragstart)="tileDragStart($event, t)" (dragover)="tileDragOver($event, t)"
              (drop)="tileDrop($event, t)" (dragend)="tileDragEnd()">
              <div class="relative aspect-square bg-canvas">
                <img [src]="t.url" [alt]="t.alt" class="pointer-events-none size-full object-cover" loading="lazy" />
                @if (first) {<span class="absolute left-2 top-2 rounded-[6px] bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">Główne</span>}
                @if (t.pending) {<span class="absolute right-2 top-2 rounded-[6px] bg-card/90 px-1.5 py-0.5 text-[11px] text-ink-soft">Po zapisaniu</span>}
                @if (canWrite()) {
                  <span class="absolute bottom-2 right-2 hidden cursor-grab rounded-[6px] bg-card/90 p-1 text-ink-soft group-hover:block" aria-hidden="true">
                    <svg [lucideIcon]="icons.grip" [size]="14" /></span>
                }
              </div>
              <div class="space-y-2 p-2">
                <input class="sv-input !h-8 !text-[12px]" [value]="t.alt" maxlength="200" placeholder="Co widać na zdjęciu? (opis alt)"
                  [attr.aria-label]="'Opis zdjęcia ' + (i + 1)" [disabled]="!canWrite()" (change)="saveAlt(t, $any($event.target).value)" />
                @if (canWrite()) {
                  <div class="flex justify-between">
                    <span class="flex gap-1">
                      <button sv-button type="button" variant="ghost" size="icon" [disabled]="first" [attr.aria-label]="'Przesuń zdjęcie ' + (i + 1) + ' wcześniej'" (click)="move(i, i - 1)"><svg [lucideIcon]="icons.chevronLeft" /></button>
                      <button sv-button type="button" variant="ghost" size="icon" [disabled]="last" [attr.aria-label]="'Przesuń zdjęcie ' + (i + 1) + ' dalej'" (click)="move(i, i + 1)"><svg [lucideIcon]="icons.chevronRight" /></button>
                    </span>
                    <button sv-button type="button" variant="ghost" size="icon" [attr.aria-label]="'Usuń zdjęcie ' + (i + 1)" (click)="remove(t)"><svg [lucideIcon]="icons.trash" /></button>
                  </div>
                }
              </div>
            </li>
          }
          @for (n of uploadingSlots(); track $index) {
            <li class="flex aspect-square flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong bg-canvas text-[12px] text-ink-muted">
              <sv-spinner />Wysyłanie…
            </li>
          }
          @if (canWrite() && count() + uploading() < max) {
            <li>
              <button type="button" class="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed border-line-strong
                text-[12px] text-ink-muted transition-colors hover:border-primary hover:bg-primary-soft hover:text-primary-strong"
                (click)="picker.click()">
                <svg [lucideIcon]="icons.plus" [size]="20" />Dodaj zdjęcie
              </button>
            </li>
          }
        </ul>
      }
    </sv-card>

    @if (fileDrag() && canWrite()) {
      <!-- The rest of the page blurs; the photos card itself becomes the drop target with a dashed frame. -->
      <div class="fixed inset-0 z-[-1] bg-ink/15 backdrop-blur-[3px]" aria-hidden="true" (dragover)="$event.preventDefault()" (drop)="overlayDrop($event)"></div>
      <div class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[var(--radius-card,14px)] border-2 border-dashed border-primary
        bg-primary-soft/90 text-center" [class.!bg-primary-soft]="overCard()"
        (dragenter)="overCard.set(true)" (dragleave)="overCard.set(false)" (dragover)="$event.preventDefault()" (drop)="overlayDrop($event)">
        <span class="pointer-events-none flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-sm"
          [class.scale-110]="overCard()"><svg [lucideIcon]="icons.upload" [size]="22" /></span>
        <p class="pointer-events-none mt-3 text-[15px] font-semibold text-ink">Upuść zdjęcia tutaj</p>
        <p class="pointer-events-none mt-1 text-[12px] text-ink-muted">JPEG lub PNG, do 10 MB każde · zostało miejsca: {{ max - count() }}</p>
      </div>
    }
  `,
})
export class ProductImagesComponent {
  private readonly api = inject(StorefrontAdminApi);
  private readonly toast = inject(ToastService);
  protected readonly icons = icons;
  protected readonly max = MAX;

  readonly tenantId = input.required<string>();
  /** Null while the product is being created: photos then stay in {@link pending}. */
  readonly productId = input<string | null>(null);
  readonly canWrite = input(false);
  readonly images = model<ProductImage[]>([]);
  readonly pending = model<PendingImage[]>([]);

  protected readonly uploading = signal(0);
  protected readonly fileDrag = signal(false);
  protected readonly overCard = signal(false);
  protected readonly dragKey = signal<string | null>(null);
  protected readonly dropKey = signal<string | null>(null);
  private depth = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pending().forEach((p) => URL.revokeObjectURL(p.url)));
  }

  protected count(): number {
    return this.productId() ? this.images().length : this.pending().length;
  }

  protected uploadingSlots(): number[] {
    return Array.from({ length: this.uploading() });
  }

  protected tiles(): Tile[] {
    return this.productId()
      ? this.images().map((i) => ({ key: i.id, url: i.urls['w400'], alt: i.alt ?? '', saved: i, pending: null }))
      : this.pending().map((p) => ({ key: p.key, url: p.url, alt: p.alt, saved: null, pending: p }));
  }

  // ---- file drag over the page -----------------------------------------------------------------------------------
  private static hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  }

  protected docDragEnter(e: DragEvent): void {
    if (!ProductImagesComponent.hasFiles(e) || !this.canWrite()) return;
    this.depth++;
    this.fileDrag.set(true);
  }

  protected docDragOver(e: DragEvent): void {
    if (ProductImagesComponent.hasFiles(e) && this.canWrite()) e.preventDefault();
  }

  protected docDragLeave(e: DragEvent): void {
    if (!ProductImagesComponent.hasFiles(e)) return;
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) this.fileDrag.set(false);
  }

  protected docDrop(e: DragEvent): void {
    // Prevent the browser from opening a file dropped outside the target.
    if (ProductImagesComponent.hasFiles(e)) e.preventDefault();
    this.depth = 0;
    this.fileDrag.set(false);
    this.overCard.set(false);
  }

  protected overlayDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.depth = 0;
    this.fileDrag.set(false);
    this.overCard.set(false);
    void this.add(Array.from(e.dataTransfer?.files ?? []));
  }

  protected picked(event: Event): void {
    const el = event.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    void this.add(files);
  }

  private async add(files: File[]): Promise<void> {
    const room = MAX - this.count() - this.uploading();
    if (files.length > room) this.toast.error(`Można dodać jeszcze ${Math.max(room, 0)} zdj. (limit ${MAX}).`);
    const accepted: File[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      if (!TYPES.includes(file.type)) this.toast.error(`${file.name}: dozwolone są tylko pliki JPEG i PNG.`);
      else if (file.size > MAX_BYTES) this.toast.error(`${file.name}: plik jest większy niż 10 MB.`);
      else accepted.push(file);
    }
    if (!accepted.length) return;
    const id = this.productId();
    if (!id) {
      this.pending.update((list) => [...list, ...accepted.map((file) => ({ key: crypto.randomUUID(), file, url: URL.createObjectURL(file), alt: '' }))]);
      return;
    }
    this.uploading.update((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        const img = await firstValueFrom(this.api.uploadImage(this.tenantId(), id, file, null));
        this.images.update((list) => [...list, img]);
      } catch (e) {
        this.toast.error(`${file.name}: ${ApiError.from(e).message}`);
      } finally {
        this.uploading.update((n) => n - 1);
      }
    }
  }

  // ---- reordering ------------------------------------------------------------------------------------------------
  protected tileDragStart(e: DragEvent, t: Tile): void {
    if (!this.canWrite() || !e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.key);
    this.dragKey.set(t.key);
  }

  protected tileDragOver(e: DragEvent, t: Tile): void {
    if (!this.dragKey()) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.dropKey.set(t.key);
  }

  protected tileDrop(e: DragEvent, t: Tile): void {
    const from = this.dragKey();
    if (!from) return;
    e.preventDefault();
    const keys = this.tiles().map((x) => x.key);
    void this.move(keys.indexOf(from), keys.indexOf(t.key));
    this.tileDragEnd();
  }

  protected tileDragEnd(): void {
    this.dragKey.set(null);
    this.dropKey.set(null);
  }

  protected async move(from: number, to: number): Promise<void> {
    if (from === to || from < 0 || to < 0) return;
    const id = this.productId();
    if (!id) {
      this.pending.update((list) => reorder(list, from, to));
      return;
    }
    const previous = this.images();
    const list = reorder(previous, from, to);
    this.images.set(list);
    try {
      this.images.set(await firstValueFrom(this.api.updateImages(this.tenantId(), id, list.map((i) => i.id), null)));
    } catch (e) {
      this.images.set(previous);
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async saveAlt(t: Tile, alt: string): Promise<void> {
    if (t.pending) {
      this.pending.update((list) => list.map((p) => (p.key === t.key ? { ...p, alt } : p)));
      return;
    }
    try {
      this.images.set(await firstValueFrom(this.api.updateImages(this.tenantId(), this.productId()!, null, { [t.key]: alt })));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }

  protected async remove(t: Tile): Promise<void> {
    if (t.pending) {
      URL.revokeObjectURL(t.pending.url);
      this.pending.update((list) => list.filter((p) => p.key !== t.key));
      return;
    }
    try {
      await firstValueFrom(this.api.deleteImage(this.tenantId(), this.productId()!, t.key));
      this.images.update((list) => list.filter((i) => i.id !== t.key));
    } catch (e) {
      this.toast.error(ApiError.from(e).message);
    }
  }
}

export function reorder<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
