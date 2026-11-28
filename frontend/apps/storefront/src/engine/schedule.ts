/**
 * Store times are entered in Polish local time ("2026-12-05T20:00", Europe/Warsaw, with summer time). Here they become
 * instants, so a countdown or a section's "show from–to" is the same moment for every visitor and every server.
 */
export const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ZONE = 'Europe/Warsaw';

const zoneParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Offset of Warsaw from UTC at an instant, in minutes (60 in winter, 120 in summer). */
function offsetAt(utcMs: number): number {
  const p = Object.fromEntries(zoneParts.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p['year'], +p['month'] - 1, +p['day'], +p['hour'], +p['minute'], +p['second']);
  return Math.round((asUtc - utcMs) / 60_000);
}

/** "2026-12-05T20:00" (Warsaw) → epoch milliseconds; null for anything else. */
export function warsawToUtc(local: unknown): number | null {
  if (typeof local !== 'string' || !LOCAL_TIME.test(local)) return null;
  const [d, t] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  if (Number.isNaN(naive)) return null;
  // Two passes settle the offset also around the summer-time switch
  let utc = naive - offsetAt(naive) * 60_000;
  utc = naive - offsetAt(utc) * 60_000;
  return utc;
}

const LABEL = new Intl.DateTimeFormat('pl-PL', { timeZone: ZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** What a template gets for a date-time setting: the instant (ISO, UTC), whether it is past, and a Polish label. */
export function toTplDate(local: unknown, now = Date.now()) {
  const utc = warsawToUtc(local);
  if (utc === null) return null;
  const left = Math.max(0, Math.floor((utc - now) / 1000));
  const two = (n: number) => String(n).padStart(2, '0');
  return {
    value: local as string, iso: new Date(utc).toISOString(), past: utc <= now, label: LABEL.format(new Date(utc)),
    /** Time left when the page was rendered (the runtime keeps counting). */
    remaining: { d: two(Math.floor(left / 86_400)), h: two(Math.floor(left / 3600) % 24), m: two(Math.floor(left / 60) % 60), s: two(left % 60) },
  };
}

export interface Schedule { from?: string; to?: string; }

/** Whether a section with this schedule is shown at `now`: from inclusive, to exclusive; no schedule = always. */
export function isShown(schedule: Schedule | undefined, now = Date.now()): boolean {
  if (!schedule) return true;
  const from = warsawToUtc(schedule.from);
  const to = warsawToUtc(schedule.to);
  return (from === null || now >= from) && (to === null || now < to);
}

/** Editor label of a schedule, e.g. "od 27 listopada 2026, 00:00 do 1 grudnia 2026, 23:59". */
export function scheduleLabel(schedule: Schedule | undefined): string {
  if (!schedule) return '';
  const from = warsawToUtc(schedule.from);
  const to = warsawToUtc(schedule.to);
  return [from !== null ? 'od ' + LABEL.format(new Date(from)) : '', to !== null ? 'do ' + LABEL.format(new Date(to)) : ''].filter(Boolean).join(' ');
}
