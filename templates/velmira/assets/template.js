/*
 * Velmira — behaviour from the design, reading the server-rendered markup instead of building it from a product
 * array: the hero slider (dots, optional autoplay), the product carousel with tabs (arrows, progress dots, swipe) and
 * the mobile menu. Cart, favourites, newsletter and filters are handled by the platform runtime (data-shop-*).
 */
(() => {
  'use strict';

  // Hero: one slide (photo + copy) visible at a time; dots switch slides.
  function setupHero(hero) {
    const images = [...hero.querySelectorAll('.hero-image')];
    const copies = [...hero.querySelectorAll('[data-hero-copy]')];
    const dots = [...hero.querySelectorAll('.hero-dots .dot')];
    const n = copies.length;
    if (n < 2) return;
    let current = 0;
    let timer = 0;
    function show(i) {
      current = (i + n) % n;
      images.forEach((img) => { img.hidden = img.dataset.slide !== String(current); });
      copies.forEach((c) => { c.hidden = c.dataset.heroCopy !== String(current); });
      dots.forEach((d) => d.setAttribute('aria-current', String(d.dataset.slide === String(current))));
    }
    dots.forEach((d) => d.addEventListener('click', () => { show(Number(d.dataset.slide)); restart(); }));
    const seconds = Number(hero.dataset.autoplay) || 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function restart() {
      clearInterval(timer);
      if (seconds > 0 && !reduced) timer = setInterval(() => show(current + 1), seconds * 1000);
    }
    hero.addEventListener('focusin', () => clearInterval(timer));
    hero.addEventListener('focusout', restart);
    restart();
  }

  // Product carousel: the open tab's track moves by one card; dots show the position.
  function setupTabs(section) {
    const tabs = [...section.querySelectorAll('[data-tab]')];
    const tracks = [...section.querySelectorAll('[data-track]')];
    const prev = section.querySelector('[data-track-prev]');
    const next = section.querySelector('[data-track-next]');
    const progress = section.querySelector('[data-track-progress]');
    const windowEl = section.querySelector('[data-track-window]');
    let offset = 0;
    const active = () => tracks.find((t) => !t.hidden) || tracks[0];
    function move(delta) {
      const t = active();
      if (!t) return;
      const visible = Number(getComputedStyle(t).getPropertyValue('--visible')) || 3;
      const max = Math.max(0, t.children.length - visible);
      offset = Math.max(0, Math.min(max, offset + delta));
      const width = t.firstElementChild?.getBoundingClientRect().width || 0;
      const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
      t.style.transform = offset ? `translateX(-${offset * (width + gap)}px)` : '';
      if (prev) prev.disabled = offset === 0;
      if (next) next.disabled = offset === max;
      if (progress) {
        progress.replaceChildren(...Array.from({ length: max + 1 }, (_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'dot';
          b.setAttribute('aria-label', `Pozycja ${i + 1}`);
          b.setAttribute('aria-current', String(i === offset));
          b.addEventListener('click', () => { offset = i; move(0); });
          return b;
        }));
      }
    }
    tabs.forEach((tab) => tab.addEventListener('click', () => {
      tabs.forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
      tracks.forEach((t) => { t.hidden = t.dataset.track !== tab.dataset.tab; t.style.transform = ''; });
      offset = 0;
      move(0);
    }));
    section.querySelector('.tabs')?.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      const target = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      target.focus();
      target.click();
    });
    prev?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
    let touch = 0;
    windowEl?.addEventListener('touchstart', (e) => { touch = e.touches[0].clientX; }, { passive: true });
    windowEl?.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - touch;
      if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1);
    }, { passive: true });
    window.addEventListener('resize', () => move(0));
    move(0);
  }

  // Mobile menu: the button toggles the link list; Escape, a link or a wide window closes it.
  function setupMenu(root) {
    const button = root.querySelector('[data-menu]');
    const links = document.getElementById('mobileLinks');
    if (!button || !links) return;
    const close = () => { links.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      links.hidden = !links.hidden;
      button.setAttribute('aria-expanded', String(!links.hidden));
    });
    links.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', () => { if (innerWidth > 960) close(); });
  }

  function init(root) {
    root.querySelectorAll('[data-hero-slider]').forEach(setupHero);
    root.querySelectorAll('[data-product-tabs]').forEach(setupTabs);
    setupMenu(root);
  }
  init(document);
  // A section re-rendered in the editor: set up its behaviour again
  document.addEventListener('shop:section-load', (e) => init(e.target));
})();
