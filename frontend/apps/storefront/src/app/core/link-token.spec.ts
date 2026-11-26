import { afterEach, describe, expect, it } from 'vitest';
import { routeOf, takeLinkToken } from './link-token';

describe('takeLinkToken', () => {
  afterEach(() => history.replaceState(null, '', '/'));

  it('reads the token from the fragment and removes it from the address bar', () => {
    const token = 'A'.repeat(43);
    history.replaceState(null, '', '/konto/potwierdz#t=' + token);
    expect(takeLinkToken()).toBe(token);
    expect(window.location.href).not.toContain(token);
  });

  it('still accepts the query form and rejects malformed values', () => {
    history.replaceState(null, '', '/opinia?t=' + 'b'.repeat(43) + '&x=1');
    expect(takeLinkToken()).toBe('b'.repeat(43));
    expect(window.location.search).toBe('?x=1');
    history.replaceState(null, '', '/opinia#t=<script>');
    expect(takeLinkToken()).toBeNull();
  });
});

describe('routeOf', () => {
  it('separates the query for router links', () => {
    expect(routeOf('/szukaj?q=prezent dla mamy')).toEqual({ path: '/szukaj', query: { q: 'prezent dla mamy' } });
    expect(routeOf('/kategoria/kubki')).toEqual({ path: '/kategoria/kubki', query: null });
  });
});
