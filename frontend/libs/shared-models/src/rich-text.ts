/**
 * The small Markdown subset used for pages and blog posts. Parsed into plain data and rendered with Angular bindings —
 * never as HTML — so merchant content cannot inject markup or scripts. Supported: `## heading`, `### heading`,
 * paragraphs, `- list`, `1. list`, `---`, `**bold**`, `*italic*`, `[text](url)` with http(s), mailto, tel or
 * store-relative URLs (anything else stays plain text).
 */
export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Store-relative path (router link). */
  route?: string;
  /** External link (new tab). */
  href?: string;
  br?: boolean;
}

export type Block =
  | { type: 'h2' | 'h3' | 'p'; inlines: Inline[] }
  | { type: 'ul' | 'ol'; items: Inline[][] }
  | { type: 'hr' };

const INLINE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(INLINE)) {
    if (m.index! > last) out.push({ text: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], italic: true });
    else out.push(link(m[3], m[4]));
    last = m.index! + m[0].length;
  }
  if (last < source.length) out.push({ text: source.slice(last) });
  return out;
}

function link(text: string, url: string): Inline {
  if (/^\/(?!\/)/.test(url) && !/[\\]/.test(url)) return { text, route: url };
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return { text, href: url };
  return { text: `${text} (${url})` };
}

export function parseRichText(source: string | null | undefined): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { type: 'ul' | 'ol'; items: Inline[][] } | null = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const inlines: Inline[] = [];
    paragraph.forEach((line, i) => {
      if (i > 0) inlines.push({ text: '', br: true });
      inlines.push(...parseInline(line));
    });
    blocks.push({ type: 'p', inlines });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of (source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: heading[1].length === 3 ? 'h3' : 'h2', inlines: parseInline(heading[2]) });
    } else if (/^-{3,}$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'hr' });
    } else if (bullet || numbered) {
      flushParagraph();
      const type = bullet ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(parseInline((bullet ?? numbered)![1]));
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // Indented continuation of the previous list item.
      list.items[list.items.length - 1].push({ text: ' ' }, ...parseInline(line.trim()));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text (for meta descriptions and excerpts). */
export function plainText(source: string | null | undefined, max = 300): string {
  const text = (source ?? '')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}
