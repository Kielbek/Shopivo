/*
 * Nordivo — behaviour from the design, reading the server-rendered markup: the new-arrivals carousel, the home catalogue
 * filtered by category in place, the arrangements slider, the search bar and the mobile menu. The slider background and
 * the phone hero background continue the photo's top edge, sampled here (the designer did the same by hand), so any
 * photo the merchant picks blends in. Cart, favourites and newsletter are handled by the platform runtime.
 */
(() => {
  'use strict';

  /** CSS gradient from the colours along the top edge of a (same-origin, loaded) image; null when it cannot be read. */
  function topEdge(img) {
    try {
      const steps = 24;
      const c = document.createElement('canvas');
      c.width = steps + 1;
      c.height = 1;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, img.naturalWidth, Math.max(1, Math.round(img.naturalHeight / 200)), 0, 0, steps + 1, 1);
      const d = g.getImageData(0, 0, steps + 1, 1).data;
      const stops = [];
      for (let i = 0; i <= steps; i++) {
        const hex = '#' + [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
        stops.push(`${hex} ${((i / steps) * 100).toFixed(3)}%`);
      }
      return `linear-gradient(90deg, ${stops.join(', ')})`;
    } catch {
      return null;
    }
  }
  function whenLoaded(img, fn) {
    if (img.complete && img.naturalWidth) fn();
    else img.addEventListener('load', fn, { once: true });
  }

  function setupHero(root) {
    const hero = root.querySelector('#home.hero') || (root.matches?.('#home.hero') ? root : null);
    const img = hero?.querySelector('[data-tone-source]');
    if (img) whenLoaded(img, () => { const bg = topEdge(img); if (bg) hero.style.setProperty('--hero-top', bg); });
  }

  function setupArrivals(section) {
    const track = section.querySelector('[data-arrival-track]');
    const prev = section.querySelector('[data-arrival-prev]');
    const next = section.querySelector('[data-arrival-next]');
    const win = section.querySelector('[data-arrival-window]');
    let at = 0;
    function move(d) {
      const item = track.firstElementChild;
      if (!item) return;
      const visible = innerWidth <= 850 ? 2 : 3;
      const max = Math.max(0, track.children.length - visible);
      at = Math.max(0, Math.min(max, at + d));
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      track.style.transform = at ? `translateX(-${at * (item.getBoundingClientRect().width + gap)}px)` : '';
      prev.disabled = at === 0;
      next.disabled = at === max;
    }
    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    let x0 = 0;
    win.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    win.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1); }, { passive: true });
    window.addEventListener('resize', () => move(0));
    move(0);
  }

  function setupCatalog(section) {
    const buttons = [...section.querySelectorAll('[data-cat]')];
    const panels = [...section.querySelectorAll('[data-cat-panel]')];
    const more = section.querySelector('[data-cat-more]');
    buttons.forEach((b) => b.addEventListener('click', () => {
      buttons.forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      panels.forEach((p) => { p.hidden = p.dataset.catPanel !== b.dataset.cat; });
      if (more) more.setAttribute('href', b.dataset.cat ? '/kategoria/' + encodeURIComponent(b.dataset.cat) : '/produkty');
    }));
  }

  function setupCombo(section) {
    const slides = [...section.querySelectorAll('[data-combo-slide]')];
    let at = 0;
    const tones = new Map();
    function tone(slide) {
      const img = slide.querySelector('[data-tone-source]');
      if (!img) return;
      whenLoaded(img, () => {
        if (!tones.has(slide)) tones.set(slide, topEdge(img));
        if (!slide.hidden && tones.get(slide)) section.style.setProperty('--combo-bg', tones.get(slide));
      });
    }
    function show(i) {
      at = (i + slides.length) % slides.length;
      slides.forEach((s, j) => { s.hidden = j !== at; });
      const img = slides[at].querySelector('img');
      if (img) img.loading = 'eager';
      tone(slides[at]);
    }
    section.querySelectorAll('[data-combo-prev]').forEach((b) => b.addEventListener('click', () => show(at - 1)));
    section.querySelectorAll('[data-combo-next]').forEach((b) => b.addEventListener('click', () => show(at + 1)));
    show(0);
  }

  function setupHeader(root) {
    const menu = root.querySelector('[data-menu]');
    const nav = document.getElementById('mobileNav');
    const search = root.querySelector('[data-search-toggle]');
    const bar = document.getElementById('searchbar');
    if (menu && nav) {
      menu.addEventListener('click', () => { nav.hidden = !nav.hidden; menu.setAttribute('aria-expanded', String(!nav.hidden)); });
      nav.addEventListener('click', (e) => { if (e.target.closest('a')) { nav.hidden = true; menu.setAttribute('aria-expanded', 'false'); } });
    }
    if (search && bar) {
      search.addEventListener('click', () => {
        bar.hidden = !bar.hidden;
        search.setAttribute('aria-expanded', String(!bar.hidden));
        if (!bar.hidden) bar.querySelector('input')?.focus();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (nav) nav.hidden = true;
      if (bar) bar.hidden = true;
    });
  }

  function init(root) {
    setupHero(root);
    root.querySelectorAll('[data-arrivals]').forEach(setupArrivals);
    root.querySelectorAll('[data-catalog]').forEach(setupCatalog);
    root.querySelectorAll('[data-combo]').forEach(setupCombo);
    setupHeader(root);
  }
  init(document);
  document.addEventListener('shop:section-load', (e) => init(e.target));
})();
