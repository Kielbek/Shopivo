import { Pipe, PipeTransform } from '@angular/core';

const DATE_TIME = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
const DATE = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium' });
const RELATIVE = new Intl.RelativeTimeFormat('pl-PL', { numeric: 'auto' });

@Pipe({ name: 'svDate' })
export class DatePipe implements PipeTransform {
  transform(value: string | null | undefined, mode: 'datetime' | 'date' | 'relative' = 'datetime'): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    if (mode === 'date') return DATE.format(date);
    if (mode === 'relative') return relative(date);
    return DATE_TIME.format(date);
  }
}

function relative(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return RELATIVE.format(seconds, 'second');
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 30) return RELATIVE.format(Math.round(seconds / 86400), 'day');
  return DATE.format(date);
}

/** Converts free text (with Polish diacritics) to a URL slug — mirrors the backend implementation. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

/** Short human description of a user agent string for session lists. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Nieznane urządzenie';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Przeglądarka';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /(iPhone|iPad)/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser}, ${os}` : browser;
}
