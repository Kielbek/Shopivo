/*
 * Shopivo editor overlay — runs only in the panel's preview (?podglad=…&edycja=1) of a template store.
 *
 * Shows what can be edited (outline + name on hover), selects sections and blocks, lets the merchant type text in
 * place, and reports everything to the panel with postMessage (only to the panel's origin, and only messages from it
 * are accepted). The panel owns the document: it saves the draft and sends the new document back here, and this
 * script swaps in the page re-rendered by the server. Nothing is saved from here.
 *
 * Messages to the panel:   shop:ready {page}, shop:select {section, block?}, shop:text {section, block?, setting, value},
 *                          shop:action {action, section, block?}, shop:image {section, block?, setting}
 * Messages from the panel: shop:names {sections: {type: name}}, shop:render {doc}, shop:selected {section, block?}
 */
(() => {
  'use strict';
  const config = (() => {
    try {
      return JSON.parse(document.getElementById('shop-editor-config')?.textContent || '{}');
    } catch {
      return {};
    }
  })();
  const PANEL = config.panelOrigin;
  if (!PANEL || window.parent === window) return;
  const send = (type, data = {}) => window.parent.postMessage({ type, ...data }, PANEL);

  let names = {};
  let selected = null; // { section, block? }

  // ------------------------------------------------------------------------------------------- overlay

  const layer = document.createElement('div');
  layer.setAttribute('data-shop-editor', '');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000';
  const style = document.createElement('style');
  style.textContent = `
    [data-shop-editor] .box{position:fixed;border:2px solid #6d5dfc;border-radius:4px;transition:all .08s}
    [data-shop-editor] .box.hover{border-style:dashed;border-color:#6d5dfc99}
    [data-shop-editor] .box.block{border-color:#f59e0b}
    [data-shop-editor] .tag{position:absolute;left:-2px;top:-26px;display:flex;gap:2px;align-items:center;pointer-events:auto;
      font:600 12px/1 system-ui,sans-serif;color:#fff;background:#6d5dfc;border-radius:6px 6px 0 0;padding:0 0 0 8px;height:24px;white-space:nowrap}
    [data-shop-editor] .box.block .tag{background:#f59e0b}
    [data-shop-editor] .box.below .tag{top:auto;bottom:-26px;border-radius:0 0 6px 6px}
    [data-shop-editor] .tag button{all:unset;cursor:pointer;width:24px;height:24px;display:grid;place-items:center;font-size:13px}
    [data-shop-editor] .tag button:hover{background:#ffffff33}
    [data-shop-editor] .tag button:focus-visible{outline:2px solid #fff;outline-offset:-3px}
    [data-shop-editor] .tag .name{margin-right:6px}
    [data-shop-edit-type="text"],[data-shop-edit-type="textarea"]{cursor:text}
    [data-shop-edit-type="text"]:hover,[data-shop-edit-type="textarea"]:hover{outline:1px dashed #6d5dfc;outline-offset:2px}
    [data-shop-edit-type="image"]{cursor:pointer}
    [contenteditable]:focus{outline:2px solid #6d5dfc!important;outline-offset:3px}
  `;
  document.head.append(style);
  document.body.append(layer);

  const hoverBox = document.createElement('div');
  hoverBox.className = 'box hover';
  hoverBox.hidden = true;
  const selectBox = document.createElement('div');
  selectBox.className = 'box';
  selectBox.hidden = true;
  layer.append(hoverBox, selectBox);

  const sectionEl = (id) => document.querySelector(`[data-shop-section="${CSS.escape(id)}"]`);
  const blockEl = (section, block) => document.querySelector(`[data-shop-block="${CSS.escape(section)}/${CSS.escape(block)}"]`);

  /** Box of an element; section wrappers are display:contents, so their children's union is used. */
  function rectOf(el) {
    if (!el) return null;
    const kids = getComputedStyle(el).display === 'contents' ? [...el.children] : [el];
    let r = null;
    for (const k of kids) {
      const b = k.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    return r;
  }

  function place(box, el) {
    const r = rectOf(el);
    if (!r) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.style.left = `${Math.max(0, r.left)}px`;
    box.style.top = `${Math.max(0, r.top)}px`;
    box.style.width = `${Math.min(window.innerWidth, r.right) - Math.max(0, r.left)}px`;
    box.style.height = `${r.bottom - r.top}px`;
    box.classList.toggle('below', r.top < 28);
  }

  function nameOf(el) {
    const section = el.closest('[data-shop-section]');
    return names[section?.dataset.shopSectionType] || 'Sekcja';
  }

  function button(label, icon, action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.textContent = icon;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      send('shop:action', { action, ...selected });
    });
    return b;
  }

  function drawSelection() {
    if (!selected) {
      selectBox.hidden = true;
      return;
    }
    const el = selected.block ? blockEl(selected.section, selected.block) : sectionEl(selected.section);
    if (!el) {
      selectBox.hidden = true;
      return;
    }
    place(selectBox, el);
    selectBox.classList.toggle('block', !!selected.block);
    selectBox.replaceChildren();
    const tag = document.createElement('div');
    tag.className = 'tag';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = selected.block ? 'Element' : nameOf(el);
    tag.append(name, button('Przesuń wyżej', '↑', 'up'), button('Przesuń niżej', '↓', 'down'), button('Powiel', '⧉', 'duplicate'),
      button('Ukryj', '◌', 'hide'), button('Usuń', '✕', 'remove'));
    selectBox.append(tag);
  }

  function drawHover(target) {
    const el = target?.closest('[data-shop-block]') || target?.closest('[data-shop-section]');
    if (!el || (selected && el === (selected.block ? blockEl(selected.section, selected.block) : sectionEl(selected.section)))) {
      hoverBox.hidden = true;
      return;
    }
    place(hoverBox, el);
    hoverBox.classList.toggle('block', el.hasAttribute('data-shop-block'));
    hoverBox.replaceChildren();
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.style.pointerEvents = 'none';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = el.hasAttribute('data-shop-block') ? 'Element' : nameOf(el);
    tag.append(name);
    hoverBox.append(tag);
  }

  const redraw = () => drawSelection();
  window.addEventListener('scroll', redraw, { passive: true });
  window.addEventListener('resize', redraw);

  // ------------------------------------------------------------------------------------------- selecting and typing

  function targetOf(el) {
    const [path, setting] = el.dataset.shopEdit.split(':');
    const [section, block] = path.split('/');
    return { section, ...(block ? { block } : {}), setting };
  }

  document.addEventListener('mousemove', (e) => drawHover(e.target instanceof Element ? e.target : null), { passive: true });
  document.addEventListener('mouseleave', () => { hoverBox.hidden = true; });

  // Clicks select; nothing navigates, submits or adds to the cart while editing.
  document.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || el.closest('[data-shop-editor]')) return;
    const editable = el.closest('[data-shop-edit]');
    if (!editable || !editable.isContentEditable) e.preventDefault();
    e.stopPropagation();
    const block = el.closest('[data-shop-block]');
    const section = el.closest('[data-shop-section]');
    if (!section) return;
    selected = block ? { section: block.dataset.shopBlock.split('/')[0], block: block.dataset.shopBlock.split('/')[1] } : { section: section.dataset.shopSection };
    drawSelection();
    send('shop:select', selected);
    if (editable && editable.dataset.shopEditType === 'image') send('shop:image', targetOf(editable));
  }, true);
  document.addEventListener('submit', (e) => e.preventDefault(), true);

  // Text in place: plain text only (no pasted markup); single-line fields keep one line.
  function makeEditable(root) {
    root.querySelectorAll('[data-shop-edit-type="text"], [data-shop-edit-type="textarea"]').forEach((el) => {
      if (el.dataset.shopEditReady) return;
      el.dataset.shopEditReady = '1';
      try {
        el.contentEditable = 'plaintext-only';
      } catch {
        el.contentEditable = 'true';
      }
      el.spellcheck = true;
      let timer;
      const multi = el.dataset.shopEditType === 'textarea';
      const value = () => (multi ? el.innerText.replace(/\n{3,}/g, '\n\n') : el.textContent.replace(/\s+/g, ' ')).trim();
      const report = () => send('shop:text', { ...targetOf(el), value: value() });
      el.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(report, 400);
        drawSelection();
      });
      el.addEventListener('blur', () => {
        clearTimeout(timer);
        report();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !multi) {
          e.preventDefault();
          el.blur();
        }
        if (e.key === 'Escape') el.blur();
      });
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData?.getData('text/plain') || '').replace(multi ? /\r/g : /\s+/g, multi ? '' : ' ');
        document.execCommand('insertText', false, text);
      });
    });
  }
  makeEditable(document);

  // ------------------------------------------------------------------------------------------- re-rendering

  /** Swaps one group's sections (between its markers) for the server's new rendering. */
  function replaceGroup(group, data) {
    const start = document.querySelector(`template[data-shop-group-start="${group}"]`);
    const end = document.querySelector(`template[data-shop-group-end="${group}"]`);
    if (!start || !end) return;
    const active = document.activeElement?.closest?.('[data-shop-edit]')?.dataset.shopEdit;
    while (start.nextSibling && start.nextSibling !== end) start.nextSibling.remove();
    const tpl = document.createElement('template');
    tpl.innerHTML = data.order.map((id) => data.html[id]).join('\n');
    const nodes = [...tpl.content.children];
    end.before(tpl.content);
    for (const node of nodes) {
      makeEditable(node);
      node.dispatchEvent(new CustomEvent('shop:section-load', { bubbles: true }));
    }
    if (active) document.querySelector(`[data-shop-edit="${CSS.escape(active)}"]`)?.focus();
  }

  let rendering = 0;
  async function render(doc) {
    const ticket = ++rendering;
    const res = await fetch('/_shop/editor/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ path: location.pathname + location.search, doc }),
    });
    if (!res.ok || ticket !== rendering) return;
    const groups = await res.json();
    for (const g of ['header', 'page', 'footer']) if (groups[g]) replaceGroup(g, groups[g]);
    drawSelection();
    send('shop:rendered');
  }

  window.addEventListener('message', (e) => {
    if (e.origin !== PANEL || !e.data || typeof e.data.type !== 'string') return;
    const m = e.data;
    if (m.type === 'shop:names' && m.sections && typeof m.sections === 'object') names = m.sections;
    if (m.type === 'shop:render' && m.doc && typeof m.doc === 'object') void render(m.doc);
    if (m.type === 'shop:selected') {
      selected = m.section ? { section: String(m.section), ...(m.block ? { block: String(m.block) } : {}) } : null;
      drawSelection();
      const el = selected && (selected.block ? blockEl(selected.section, selected.block) : sectionEl(selected.section));
      const r = rectOf(el);
      if (r && (r.top < 0 || r.top > window.innerHeight - 80)) window.scrollBy({ top: r.top - 120, behavior: 'smooth' });
    }
  });

  send('shop:ready', { path: location.pathname });
})();
