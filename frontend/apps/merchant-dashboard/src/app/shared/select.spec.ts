import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SelectComponent, SelectOption } from '@shopivo/shared-ui';
import { beforeEach, describe, expect, it } from 'vitest';

const OPTIONS: SelectOption[] = [
  { value: 'pl-PL', label: 'Polski' },
  { value: 'en-US', label: 'Angielski', description: 'English' },
  { value: 'de-DE', label: 'Niemiecki' },
];

@Component({
  imports: [ReactiveFormsModule, SelectComponent],
  template: `<sv-select inputId="lang" [formControl]="control" [options]="options()" ariaLabel="Język" />`,
})
class Host {
  readonly control = new FormControl<string | null>('pl-PL');
  readonly options = signal(OPTIONS);
}

function key(el: Element, k: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('SelectComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, trigger: el.querySelector<HTMLButtonElement>('#lang')! };
  }

  it('shows the form value and exposes combobox semantics', async () => {
    const { trigger } = await render();
    expect(trigger.textContent).toContain('Polski');
    expect(trigger.getAttribute('role')).toBe('combobox');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('selects an option with the keyboard and updates the form control', async () => {
    const { fixture, el, trigger } = await render();
    key(trigger, 'ArrowDown');
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const list = el.querySelector('[role=listbox]')!;
    key(list, 'ArrowDown');
    key(list, 'Enter');
    await fixture.whenStable();
    expect(fixture.componentInstance.control.value).toBe('en-US');
    expect(trigger.textContent).toContain('Angielski');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('selects by click, marks the selected option and shows descriptions', async () => {
    const { fixture, el, trigger } = await render();
    trigger.click();
    await fixture.whenStable();
    const options = el.querySelectorAll('[role=option]');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].textContent).toContain('English');
    (options[2] as HTMLElement).click();
    await fixture.whenStable();
    expect(fixture.componentInstance.control.value).toBe('de-DE');
  });

  it('supports type-ahead on the closed field (Polish diacritics folded)', async () => {
    const { fixture, trigger } = await render();
    key(trigger, 'n');
    await fixture.whenStable();
    expect(fixture.componentInstance.control.value).toBe('de-DE');
  });

  it('respects the disabled state of the form control', async () => {
    const { fixture, trigger } = await render();
    fixture.componentInstance.control.disable();
    await fixture.whenStable();
    expect(trigger.disabled).toBe(true);
  });

  it('adds a search box for long lists and filters options', async () => {
    const { fixture, el, trigger } = await render();
    fixture.componentInstance.options.set(Array.from({ length: 12 }, (_, i) => ({ value: `z${i}`, label: i === 7 ? 'Łódź' : `Strefa ${i}` })));
    await fixture.whenStable();
    trigger.click();
    await fixture.whenStable();
    const search = el.querySelector<HTMLInputElement>('input[type=text]')!;
    search.value = 'lodz';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const options = el.querySelectorAll('[role=option]');
    expect(options.length).toBe(1);
    expect(options[0].textContent).toContain('Łódź');
  });

  it('closes on Escape without changing the value', async () => {
    const { fixture, el, trigger } = await render();
    trigger.click();
    await fixture.whenStable();
    key(el.querySelector('[role=listbox]')!, 'ArrowDown');
    key(el.querySelector('[role=listbox]')!, 'Escape');
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.control.value).toBe('pl-PL');
  });
});
