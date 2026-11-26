import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, plainText } from './rich-text';

describe('parseRichText', () => {
  it('builds headings, paragraphs and lists', () => {
    const blocks = parseRichText('## § 1. Zasady\n\nPierwsza linia\ndruga linia\n\n- jeden\n- dwa\n\n1. A\n2. B\n---');
    expect(blocks.map((b) => b.type)).toEqual(['h2', 'p', 'ul', 'ol', 'hr']);
    expect(blocks[1]).toEqual({ type: 'p', inlines: [{ text: 'Pierwsza linia' }, { text: '', br: true }, { text: 'druga linia' }] });
    expect((blocks[2] as { items: unknown[] }).items.length).toBe(2);
  });

  it('never turns markup into HTML and only allows safe link targets', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ text: '<script>alert(1)</script>' }]);
    expect(parseInline('[x](javascript:alert(1))')[0]).toEqual({ text: 'x (javascript:alert(1)' });
    expect(parseInline('[x](//evil.example)')[0].route).toBeUndefined();
    expect(parseInline('[Regulamin](/strona/regulamin)')[0]).toEqual({ text: 'Regulamin', route: '/strona/regulamin' });
    expect(parseInline('[UOKiK](https://uokik.gov.pl)')[0]).toEqual({ text: 'UOKiK', href: 'https://uokik.gov.pl' });
    expect(parseInline('a **b** *c*')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }]);
  });

  it('produces plain text for descriptions', () => {
    expect(plainText('## Tytuł\n\n**Ważne:** zobacz [regulamin](/strona/regulamin).\n- punkt')).toBe('Tytuł Ważne: zobacz regulamin. punkt');
  });
});
