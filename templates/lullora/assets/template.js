/*
 * Lullora — behaviour from the design, reading the server-rendered markup: the home catalogue filters by category in
 * place (every list is already on the page) and the mobile menu. Cart, favourites, newsletter and filters of the
 * catalogue page are handled by the platform runtime (data-shop-*).
 */
(() => {
  'use strict';

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

  function setupMenu(root) {
    const button = root.querySelector('[data-menu]');
    const nav = document.getElementById('mobileNav');
    if (!button || !nav) return;
    const close = () => { nav.hidden = true; button.setAttribute('aria-expanded', 'false'); };
    button.addEventListener('click', () => {
      nav.hidden = !nav.hidden;
      button.setAttribute('aria-expanded', String(!nav.hidden));
    });
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', () => { if (innerWidth > 760) close(); });
  }

  // Product page: the favourites button text follows its state
  function setupWish(root) {
    root.querySelectorAll('.wish[data-shop-fav]').forEach((b) => {
      const label = b.querySelector('span');
      const sync = () => { if (label) label.textContent = b.getAttribute('aria-pressed') === 'true' ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'; };
      new MutationObserver(sync).observe(b, { attributes: true, attributeFilter: ['aria-pressed'] });
      sync();
    });
  }

  function init(root) {
    root.querySelectorAll('[data-catalog]').forEach(setupCatalog);
    setupMenu(root);
    setupWish(root);
  }
  init(document);
  document.addEventListener('shop:section-load', (e) => init(e.target));
})();
