import { Category } from '@shopivo/shared-models';
import { describe, expect, it } from 'vitest';
import { buildTree } from './category-tree';
import { INDUSTRIES, OPTION_PRESETS, PACKAGE_PRESETS, presetsFor } from './industries';
import { parseDecimal, toDisplay } from './parcel-fields';
import { reorder } from './product-images';
import { clip, suggestDescription, suggestTitle } from './seo-panel';
import { isColorOption, mergeValues, splitValues } from './variant-options';

const cat = (id: string, name: string, parentId: string | null, position = 0): Category => ({
  id, name, parentId, position, slug: id, description: null, depth: 0, visible: true, seoTitle: null, seoDescription: null, productCount: 0, version: 0,
});

describe('category tree', () => {
  it('orders depth-first with children under their parent (API returns breadth-first)', () => {
    const tree = buildTree([cat('a', 'Męskie', null, 1), cat('b', 'Damskie', null, 0), cat('c', 'Koszule', 'a'), cat('d', 'Sukienki', 'b'), cat('e', 'Bluzki', 'b')]);
    expect(tree.map((n) => n.category.name)).toEqual(['Damskie', 'Bluzki', 'Sukienki', 'Męskie', 'Koszule']);
    expect(tree[1].path).toEqual(['Damskie', 'Bluzki']);
    expect(tree[1].ancestors).toEqual(['b']);
    expect(tree[0].childCount).toBe(2);
  });

  it('treats a category with a missing parent as a root instead of dropping it', () => {
    expect(buildTree([cat('x', 'Sierota', 'gone')]).map((n) => n.depth)).toEqual([0]);
  });
});

describe('variant values', () => {
  it('splits typed or pasted lists', () => {
    expect(splitValues(' S, M ;L\nXL ,, ')).toEqual(['S', 'M', 'L', 'XL']);
  });

  it('merges without case-insensitive duplicates', () => {
    expect(mergeValues(['Czarny', 'M'], ['czarny', 'Biały', 'm'])).toEqual(['Czarny', 'M', 'Biały']);
  });

  it('recognises colour options', () => {
    expect(isColorOption(' Kolor ')).toBe(true);
    expect(isColorOption('Rozmiar')).toBe(false);
  });
});

describe('industries', () => {
  it('covers all 35 industries with valid presets and starter categories', () => {
    expect(INDUSTRIES).toHaveLength(35);
    expect(new Set(INDUSTRIES.map((i) => i.id)).size).toBe(35);
    const presetIds = new Set(OPTION_PRESETS.map((p) => p.id));
    const parcels = new Set(PACKAGE_PRESETS.map((p) => p.id));
    for (const i of INDUSTRIES) {
      expect(i.presets.every((p) => presetIds.has(p)), i.id).toBe(true);
      expect(i.categories.length, i.id).toBeGreaterThan(2);
      if (i.parcel) expect(parcels.has(i.parcel), i.id).toBe(true);
    }
  });

  it('puts the industry presets first and keeps the others available', () => {
    const { suggested, other } = presetsFor('FOOTWEAR');
    expect(suggested[0].id).toBe('shoes');
    expect(suggested.length + other.length).toBe(OPTION_PRESETS.length);
    expect(presetsFor(null).suggested).toEqual([]);
  });
});

describe('SEO suggestions', () => {
  it('clips at a word boundary', () => {
    expect(clip('Kubek ręcznie toczony z kamionki', 20)).toBe('Kubek ręcznie…');
    expect(clip('Krótki', 20)).toBe('Krótki');
  });

  it('uses the product description when long enough, otherwise a neutral sentence', () => {
    const long = 'Kamionka szkliwiona, pojemność 350 ml, można myć w zmywarce i podgrzewać w mikrofalówce.';
    expect(suggestDescription('Kubek', long, 'Glina', 'product')).toBe(long);
    expect(suggestDescription('Kubek', '', 'Glina', 'product')).toContain('Kubek w sklepie Glina');
    expect(suggestDescription('Kubek', '', 'Glina', 'product').length).toBeLessThanOrEqual(160);
  });

  it('adds the brand to the title when it fits and is not already there', () => {
    expect(suggestTitle('Buty do biegania', 'Nike')).toBe('Buty do biegania – Nike');
    expect(suggestTitle('Nike Air Max', 'Nike')).toBe('Nike Air Max');
  });
});

describe('parcel units', () => {
  it('parses Polish decimals and rejects garbage', () => {
    expect(parseDecimal('1,25')).toBe(1.25);
    expect(parseDecimal(' ')).toBeNull();
    expect(parseDecimal('abc')).toBeNaN();
  });

  it('shows grams as kilograms and millimetres as centimetres', () => {
    expect(toDisplay(1250, 1000)).toBe('1,25');
    expect(toDisplay(380, 10)).toBe('38');
    expect(toDisplay(null, 10)).toBe('');
  });
});

describe('photo order', () => {
  it('moves an item forwards and backwards', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorder(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
});
