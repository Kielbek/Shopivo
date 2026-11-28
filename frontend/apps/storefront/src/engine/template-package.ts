import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { imageSize } from './image-size';

/**
 * A template package (`templates/<name>/`): the designer's HTML/CSS split into Liquid sections, with a schema per section
 * describing what the merchant may edit. Format: docs/TEMPLATE_FORMAT.md.
 */
export interface SettingSchema {
  id: string;
  type: 'text' | 'textarea' | 'url' | 'image' | 'select' | 'number' | 'checkbox' | 'color' | 'datetime' | 'point' | 'product' | 'product_list' | 'category_list' | 'link_list';
  label: string;
  default?: unknown;
  info?: string;
  max?: number;
  min?: number;
  options?: { value: string; label: string }[];
  /** category_list: each category also gets its first N products (`items`) — tabs or filters of a catalogue. */
  products_per_category?: number;
}
export interface BlockSchema { type: string; name: string; settings: SettingSchema[]; }
export interface SectionSchema { name: string; settings: SettingSchema[]; blocks?: BlockSchema[]; max_blocks?: number; }
export interface SectionSource { type: string; source: string; schema: SectionSchema; }

export interface SectionDoc {
  type: string;
  disabled?: boolean;
  /** Shown only from–to (Polish local time "YYYY-MM-DDTHH:mm"); either end may be missing. */
  schedule?: { from?: string; to?: string };
  settings: Record<string, unknown>;
  blocks?: Record<string, { type: string; disabled?: boolean; settings: Record<string, unknown> }>;
  block_order?: string[];
}
export interface PageDoc { sections: Record<string, SectionDoc>; order: string[]; }

export type PageType = 'index' | 'catalog' | 'product' | 'cart' | 'favorites' | 'not_found' | 'checkout' | 'order' | 'page' | 'blog'
  | 'auth' | 'account' | 'account_order' | 'newsletter' | 'review';
/** Every package provides all of these (each template styles its own checkout too). */
export const PAGE_TYPES: PageType[] = ['index', 'catalog', 'product', 'cart', 'favorites', 'not_found', 'checkout', 'order', 'page', 'blog',
  'auth', 'account', 'account_order', 'newsletter', 'review'];

export interface TemplatePackage {
  code: string;
  name: string;
  version: string;
  description: string;
  dir: string;
  layout: string;
  sections: Map<string, SectionSource>;
  /** Snippet name → source (`{% render 'name' %}`), kept in memory. */
  snippets: Record<string, string>;
  pages: Record<PageType, PageDoc>;
  groups: { header: PageDoc; footer: PageDoc };
  styles: string[];
  scripts: string[];
  /** Asset file → intrinsic size (images only), for width/height attributes. */
  assets: Map<string, { width: number; height: number } | null>;
  /** Types of the sections that come from templates/_shared (offered by every template). */
  shared: Set<string>;
}

/** Sections and snippets every template offers (countdown, campaign banner…), from `templates/_shared/`. */
export interface SharedParts { sections: Map<string, SectionSource>; snippets: Record<string, string>; css: string; }

const SCHEMA = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/;
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

/** Where template packages live: $SHOPIVO_TEMPLATES_DIR, or `templates/` next to (or above) the working directory. */
export function templatesDir(): string | null {
  const candidates = [process.env['SHOPIVO_TEMPLATES_DIR'], join(process.cwd(), 'templates'), join(process.cwd(), '..', 'templates')];
  for (const c of candidates) if (c && existsSync(join(c))) return resolve(c);
  return null;
}

function json<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function loadPackage(dir: string, sharedParts?: SharedParts): TemplatePackage {
  const manifest = json<{
    code: string; name: string; version: string; description?: string; styles?: string[]; scripts?: string[];
    pages: Record<string, string>; groups: { header: string; footer: string };
  }>(join(dir, 'template.json'));
  if (!/^[A-Z][A-Z0-9_]{1,30}$/.test(manifest.code)) throw new Error(`${dir}: invalid template code`);
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error(`${dir}: version must be x.y.z`);

  const sections = readSections(join(dir, 'sections'));
  const snippets = readSnippets(join(dir, 'snippets'));
  // Shared sections and snippets: a template may restyle one by shipping a file of the same name
  const shared = new Set<string>();
  for (const [type, src] of sharedParts?.sections ?? []) {
    if (!sections.has(type)) {
      sections.set(type, src);
      shared.add(type);
    }
  }
  for (const [name, src] of Object.entries(sharedParts?.snippets ?? {})) snippets[name] ??= src;

  const pages = {} as Record<PageType, PageDoc>;
  for (const type of PAGE_TYPES) {
    const path = manifest.pages[type];
    if (!path) throw new Error(`${dir}: page "${type}" is missing`);
    pages[type] = checkPage(json<PageDoc>(join(dir, path)), sections, `${type}`);
  }
  const groups = {
    header: checkPage(json<PageDoc>(join(dir, manifest.groups.header)), sections, 'header'),
    footer: checkPage(json<PageDoc>(join(dir, manifest.groups.footer)), sections, 'footer'),
  };

  const assets = new Map<string, { width: number; height: number } | null>();
  const assetDir = join(dir, 'assets');
  if (existsSync(assetDir)) {
    for (const file of readdirSync(assetDir)) {
      if (!SAFE_NAME.test(file) || !statSync(join(assetDir, file)).isFile()) continue;
      assets.set(file, /\.(png|webp|jpe?g)$/i.test(file) ? imageSize(readFileSync(join(assetDir, file))) : null);
    }
  }
  for (const s of manifest.scripts ?? []) if (!assets.has(s)) throw new Error(`${dir}: script ${s} not in assets/`);

  return {
    code: manifest.code, name: manifest.name, version: manifest.version, description: manifest.description ?? '', dir,
    layout: readFileSync(join(dir, 'layout', 'theme.liquid'), 'utf8'), sections, snippets, pages, groups,
    styles: manifest.styles ?? [], scripts: manifest.scripts ?? [], assets, shared,
  };
}

function readSections(dir: string): Map<string, SectionSource> {
  const sections = new Map<string, SectionSource>();
  if (!existsSync(dir)) return sections;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.liquid')) continue;
    const raw = readFileSync(join(dir, file), 'utf8');
    const m = SCHEMA.exec(raw);
    if (!m) throw new Error(`${file}: missing {% schema %}`);
    const schema = JSON.parse(m[1]) as SectionSchema;
    sections.set(file.slice(0, -'.liquid'.length), { type: file.slice(0, -'.liquid'.length), source: raw.replace(SCHEMA, ''), schema });
  }
  return sections;
}

function readSnippets(dir: string): Record<string, string> {
  const snippets: Record<string, string> = {};
  if (!existsSync(dir)) return snippets;
  for (const file of readdirSync(dir)) {
    if (file.endsWith('.liquid')) snippets[file.slice(0, -'.liquid'.length)] = readFileSync(join(dir, file), 'utf8');
  }
  return snippets;
}

/** The shared parts (templates/_shared), or empty ones when the folder is missing. */
export function loadShared(root: string | null = templatesDir()): SharedParts {
  const dir = root ? join(root, '_shared') : '';
  if (!dir || !existsSync(dir)) return { sections: new Map(), snippets: {}, css: '' };
  return { sections: readSections(join(dir, 'sections')), snippets: readSnippets(join(dir, 'snippets')),
    css: existsSync(join(dir, 'shared.css')) ? readFileSync(join(dir, 'shared.css'), 'utf8') : '' };
}

function checkPage(doc: PageDoc, sections: Map<string, SectionSource>, where: string): PageDoc {
  for (const id of doc.order) {
    const s = doc.sections[id];
    if (!s) throw new Error(`${where}: section "${id}" listed in order but not defined`);
    if (!sections.has(s.type)) throw new Error(`${where}: unknown section type "${s.type}"`);
  }
  return doc;
}

/** All packages in the templates directory, by code. A broken package is reported and skipped. */
export function loadAll(root: string | null = templatesDir()): Map<string, TemplatePackage> {
  const out = new Map<string, TemplatePackage>();
  if (!root) return out;
  const shared = loadShared(root);
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'template.json'))) continue;
    try {
      const p = loadPackage(dir, shared);
      out.set(p.code, p);
    } catch (e) {
      console.error(`Template ${name} skipped:`, (e as Error).message);
    }
  }
  return out;
}
