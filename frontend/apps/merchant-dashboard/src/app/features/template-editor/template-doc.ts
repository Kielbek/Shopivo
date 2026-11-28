import { TemplatePageDoc, TemplateSectionDoc, TemplateSectionSchema, TemplateStoreDoc } from '@shopivo/shared-models';

/**
 * Pure operations on a store's template document (engine v2). The editor keeps every page and group as a full
 * document (template defaults for untouched ones) and saves only those the merchant changed, so template updates still
 * reach the rest.
 */
export type Docs = Record<string, TemplatePageDoc>;
export const GROUPS = ['header', 'footer'] as const;

/** What the editor shows for a click in the preview or a row in the list. */
export interface Target { section: string; block?: string; }

export function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Every page and group: the store's version where it has one, otherwise the template's. */
export function fullDocs(defaults: Record<string, TemplatePageDoc>, draft: TemplateStoreDoc): Docs {
  const out: Docs = {};
  for (const [key, doc] of Object.entries(defaults)) {
    const own = (GROUPS as readonly string[]).includes(key) ? draft.groups?.[key as 'header' | 'footer'] : draft.pages?.[key];
    out[key] = clone(own ?? doc);
  }
  return out;
}

/** The document to save: only pages and groups the store has its own version of. */
export function storeDoc(docs: Docs, own: Set<string>): TemplateStoreDoc {
  const pages: Record<string, TemplatePageDoc> = {};
  const groups: { header?: TemplatePageDoc; footer?: TemplatePageDoc } = {};
  for (const key of own) {
    if (!docs[key]) continue;
    if (key === 'header' || key === 'footer') groups[key] = docs[key];
    else pages[key] = docs[key];
  }
  return { pages, groups };
}

/** Which keys of the saved draft are the store's own (the rest follow the template). */
export function ownKeys(draft: TemplateStoreDoc): Set<string> {
  return new Set([...Object.keys(draft.pages ?? {}), ...Object.keys(draft.groups ?? {})]);
}

export function newId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = prefix.replace(/[^a-z0-9]/g, '').slice(0, 16) || 's';
  for (;;) {
    const id = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    if (!used.has(id)) return id;
  }
}

/** Page sections (main-…) and the header/footer cannot be moved out, hidden or removed. */
export function isFixed(type: string): boolean {
  return type.startsWith('main-') || type === 'header' || type === 'footer';
}

export function move(doc: TemplatePageDoc, id: string, to: number): TemplatePageDoc {
  const order = doc.order.filter((x) => x !== id);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, id);
  return { ...doc, order };
}

export function step(doc: TemplatePageDoc, id: string, dir: -1 | 1): TemplatePageDoc {
  const i = doc.order.indexOf(id);
  return i < 0 ? doc : move(doc, id, i + dir);
}

export function remove(doc: TemplatePageDoc, id: string): TemplatePageDoc {
  const sections = { ...doc.sections };
  delete sections[id];
  return { sections, order: doc.order.filter((x) => x !== id) };
}

export function duplicate(doc: TemplatePageDoc, id: string): { doc: TemplatePageDoc; id: string } {
  const copy = clone(doc.sections[id]);
  const nid = newId(copy.type, doc.order);
  const order = [...doc.order];
  order.splice(order.indexOf(id) + 1, 0, nid);
  return { doc: { sections: { ...doc.sections, [nid]: copy }, order }, id: nid };
}

/** Sets or clears a section's "show from–to" (empty ends are dropped; no ends = always shown). */
export function setSchedule(doc: TemplatePageDoc, id: string, schedule: { from?: string; to?: string } | null): TemplatePageDoc {
  const s = { ...doc.sections[id] };
  const clean = Object.fromEntries(Object.entries(schedule ?? {}).filter(([, v]) => !!v)) as { from?: string; to?: string };
  if (Object.keys(clean).length) s.schedule = clean; else delete s.schedule;
  return { ...doc, sections: { ...doc.sections, [id]: s } };
}

/** Where a schedule stands now: upcoming, showing, ended (browser time; the store uses Polish time). */
export function scheduleState(schedule: { from?: string; to?: string } | undefined, now = new Date()): 'upcoming' | 'live' | 'ended' | null {
  if (!schedule || (!schedule.from && !schedule.to)) return null;
  const at = (v?: string) => (v ? new Date(v).getTime() : null);
  const from = at(schedule.from), to = at(schedule.to), t = now.getTime();
  if (from !== null && t < from) return 'upcoming';
  if (to !== null && t >= to) return 'ended';
  return 'live';
}

export function toggleHidden(doc: TemplatePageDoc, id: string): TemplatePageDoc {
  const s = { ...doc.sections[id] };
  if (s.disabled) delete s.disabled; else s.disabled = true;
  return { ...doc, sections: { ...doc.sections, [id]: s } };
}

/**
 * A new section of a type: its content taken from the first place the template uses it (real texts and elements
 * rather than an empty box), otherwise empty settings (schema defaults apply).
 */
export function newSection(type: string, defaults: Record<string, TemplatePageDoc>): TemplateSectionDoc {
  for (const doc of Object.values(defaults)) {
    for (const s of Object.values(doc.sections)) if (s.type === type) return clone({ ...s, disabled: undefined });
  }
  return { type, settings: {} };
}

export function add(doc: TemplatePageDoc, section: TemplateSectionDoc, after: string | null): { doc: TemplatePageDoc; id: string } {
  const id = newId(section.type, doc.order);
  const order = [...doc.order];
  order.splice(after ? order.indexOf(after) + 1 : order.length, 0, id);
  return { doc: { sections: { ...doc.sections, [id]: clean(section) }, order }, id };
}

function clean(s: TemplateSectionDoc): TemplateSectionDoc {
  const out: TemplateSectionDoc = { type: s.type, settings: s.settings ?? {} };
  if (s.blocks) out.blocks = s.blocks;
  if (s.block_order) out.block_order = s.block_order;
  return out;
}

// ---- blocks --------------------------------------------------------------------------------------------------------

function withBlocks(doc: TemplatePageDoc, id: string, change: (s: TemplateSectionDoc) => TemplateSectionDoc): TemplatePageDoc {
  const s = doc.sections[id];
  const next = change({ ...s, blocks: { ...(s.blocks ?? {}) }, block_order: [...(s.block_order ?? [])] });
  return { ...doc, sections: { ...doc.sections, [id]: next } };
}

export function moveBlock(doc: TemplatePageDoc, section: string, block: string, to: number): TemplatePageDoc {
  return withBlocks(doc, section, (s) => {
    const order = s.block_order!.filter((b) => b !== block);
    order.splice(Math.max(0, Math.min(to, order.length)), 0, block);
    return { ...s, block_order: order };
  });
}

export function stepBlock(doc: TemplatePageDoc, section: string, block: string, dir: -1 | 1): TemplatePageDoc {
  const i = doc.sections[section].block_order?.indexOf(block) ?? -1;
  return i < 0 ? doc : moveBlock(doc, section, block, i + dir);
}

export function removeBlock(doc: TemplatePageDoc, section: string, block: string): TemplatePageDoc {
  return withBlocks(doc, section, (s) => {
    delete s.blocks![block];
    return { ...s, block_order: s.block_order!.filter((b) => b !== block) };
  });
}

export function duplicateBlock(doc: TemplatePageDoc, section: string, block: string): { doc: TemplatePageDoc; id: string } {
  let nid = '';
  const next = withBlocks(doc, section, (s) => {
    nid = newId(s.blocks![block].type, s.block_order!);
    s.blocks![nid] = clone(s.blocks![block]);
    s.block_order!.splice(s.block_order!.indexOf(block) + 1, 0, nid);
    return s;
  });
  return { doc: next, id: nid };
}

export function toggleBlockHidden(doc: TemplatePageDoc, section: string, block: string): TemplatePageDoc {
  return withBlocks(doc, section, (s) => {
    const b = { ...s.blocks![block] };
    if (b.disabled) delete b.disabled; else b.disabled = true;
    s.blocks![block] = b;
    return s;
  });
}

export function addBlock(doc: TemplatePageDoc, section: string, type: string): { doc: TemplatePageDoc; id: string } {
  let nid = '';
  const next = withBlocks(doc, section, (s) => {
    // A copy of the last element of the same type, so it looks like its neighbours; otherwise schema defaults
    const like = [...s.block_order!].reverse().map((b) => s.blocks![b]).find((b) => b.type === type);
    nid = newId(type, s.block_order!);
    s.blocks![nid] = like ? { type, settings: clone(like.settings) } : { type, settings: {} };
    s.block_order!.push(nid);
    return s;
  });
  return { doc: next, id: nid };
}

export function canAddBlock(schema: TemplateSectionSchema | undefined, section: TemplateSectionDoc): boolean {
  return !!schema?.blocks.length && (schema.maxBlocks === null || (section.block_order?.length ?? 0) < schema.maxBlocks);
}

// ---- settings ------------------------------------------------------------------------------------------------------

export function setSetting(doc: TemplatePageDoc, target: Target, setting: string, value: unknown): TemplatePageDoc {
  const s = doc.sections[target.section];
  if (!s) return doc;
  if (target.block) {
    const b = s.blocks?.[target.block];
    if (!b) return doc;
    return { ...doc, sections: { ...doc.sections, [target.section]: { ...s, blocks: { ...s.blocks, [target.block]: { ...b, settings: { ...b.settings, [setting]: value } } } } } };
  }
  return { ...doc, sections: { ...doc.sections, [target.section]: { ...s, settings: { ...s.settings, [setting]: value } } } };
}

/** A setting's current value: the store's, otherwise the schema default. */
export function valueOf(settings: Record<string, unknown> | undefined, id: string, fallback: unknown): unknown {
  return settings && id in settings ? settings[id] : fallback;
}

// ---- undo / redo ---------------------------------------------------------------------------------------------------

/** Snapshots of the whole editor state; typing in one field within a moment is one step. */
export class History<T> {
  private past: { state: T; key: string | null; at: number }[] = [];
  private future: T[] = [];

  constructor(private readonly limit = 100) {}

  push(previous: T, key: string | null = null, now = Date.now()): void {
    const last = this.past.at(-1);
    if (key && last && last.key === key && now - last.at < 1500) {
      last.at = now;
    } else {
      this.past.push({ state: previous, key, at: now });
      if (this.past.length > this.limit) this.past.shift();
    }
    this.future = [];
  }

  undo(current: T): T | null {
    const last = this.past.pop();
    if (!last) return null;
    this.future.push(current);
    return last.state;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push({ state: current, key: null, at: 0 });
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
