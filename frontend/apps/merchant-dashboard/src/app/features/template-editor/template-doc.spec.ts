import { describe, expect, it } from 'vitest';
import { TemplatePageDoc } from '@shopivo/shared-models';
import {
  History, add, addBlock, canAddBlock, duplicate, duplicateBlock, fullDocs, move, newSection, ownKeys, remove, removeBlock,
  setSetting, step, stepBlock, storeDoc, toggleHidden, valueOf,
} from './template-doc';

const home: TemplatePageDoc = {
  sections: {
    hero: { type: 'hero', settings: {} },
    benefits: { type: 'benefits', settings: {}, blocks: { b1: { type: 'benefit', settings: { title: 'A' } }, b2: { type: 'benefit', settings: { title: 'B' } } }, block_order: ['b1', 'b2'] },
    about: { type: 'about', settings: {} },
  },
  order: ['hero', 'benefits', 'about'],
};
const defaults = { index: home, product: { sections: { main: { type: 'main-product', settings: {} } }, order: ['main'] }, header: { sections: { header: { type: 'header', settings: {} } }, order: ['header'] } };

describe('template document', () => {
  it('starts from the store draft where it has one and saves only its own pages', () => {
    const own = { index: { ...home, order: ['about', 'hero', 'benefits'] } };
    const docs = fullDocs(defaults, { pages: own });
    expect(docs['index'].order).toEqual(['about', 'hero', 'benefits']);
    expect(docs['product'].order).toEqual(['main']);
    expect(docs['header'].order).toEqual(['header']);
    const keys = ownKeys({ pages: own });
    keys.add('header');
    expect(storeDoc(docs, keys)).toEqual({ pages: { index: docs['index'] }, groups: { header: docs['header'] } });
    // defaults are copies: editing never changes the template's data
    docs['index'].order.pop();
    expect(home.order).toHaveLength(3);
  });

  it('moves, duplicates, hides, removes and adds sections', () => {
    expect(move(home, 'about', 0).order).toEqual(['about', 'hero', 'benefits']);
    expect(step(home, 'hero', 1).order).toEqual(['benefits', 'hero', 'about']);
    expect(step(home, 'hero', -1).order).toEqual(['hero', 'benefits', 'about']);
    const d = duplicate(home, 'benefits');
    expect(d.doc.order).toEqual(['hero', 'benefits', d.id, 'about']);
    expect(d.doc.sections[d.id]).toEqual(home.sections['benefits']);
    expect(d.doc.sections[d.id]).not.toBe(home.sections['benefits']);
    expect(toggleHidden(home, 'about').sections['about'].disabled).toBe(true);
    expect(toggleHidden(toggleHidden(home, 'about'), 'about').sections['about'].disabled).toBeUndefined();
    const r = remove(home, 'hero');
    expect(r.order).toEqual(['benefits', 'about']);
    expect(r.sections['hero']).toBeUndefined();
    // A new section brings the template's content for that type
    const a = add(home, newSection('benefits', defaults), 'hero');
    expect(a.doc.order).toEqual(['hero', a.id, 'benefits', 'about']);
    expect(a.doc.sections[a.id].block_order).toEqual(['b1', 'b2']);
    expect(newSection('countdown', defaults)).toEqual({ type: 'countdown', settings: {} });
  });

  it('edits blocks and settings', () => {
    expect(stepBlock(home, 'benefits', 'b2', -1).sections['benefits'].block_order).toEqual(['b2', 'b1']);
    const added = addBlock(home, 'benefits', 'benefit');
    expect(added.doc.sections['benefits'].block_order).toEqual(['b1', 'b2', added.id]);
    expect(added.doc.sections['benefits'].blocks![added.id].settings).toEqual({ title: 'B' });
    const dup = duplicateBlock(home, 'benefits', 'b1');
    expect(dup.doc.sections['benefits'].block_order).toEqual(['b1', dup.id, 'b2']);
    expect(removeBlock(home, 'benefits', 'b1').sections['benefits'].block_order).toEqual(['b2']);
    expect(home.sections['benefits'].block_order).toEqual(['b1', 'b2']);
    const set = setSetting(home, { section: 'benefits', block: 'b2' }, 'title', 'Nowy');
    expect(set.sections['benefits'].blocks!['b2'].settings['title']).toBe('Nowy');
    expect(setSetting(home, { section: 'hero' }, 'heading', 'X').sections['hero'].settings).toEqual({ heading: 'X' });
    expect(valueOf({}, 'heading', 'Domyślny')).toBe('Domyślny');
    expect(valueOf({ heading: '' }, 'heading', 'Domyślny')).toBe('');
    expect(canAddBlock({ type: 'benefits', name: '', settings: [], blocks: [{ type: 'benefit', name: '', settings: [] }], maxBlocks: 2 }, home.sections['benefits'])).toBe(false);
  });

  it('undoes and redoes, typing in one field is one step', () => {
    const h = new History<number>();
    h.push(1, 'hero:heading', 1000);
    h.push(2, 'hero:heading', 1500); // same field a moment later: merged
    h.push(3, null, 5000);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(1);
    expect(h.canUndo).toBe(false);
    expect(h.redo(1)).toBe(3);
    expect(h.redo(3)).toBe(4);
    expect(h.canRedo).toBe(false);
  });
});
