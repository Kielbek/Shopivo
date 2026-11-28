/*
 * Bawiloo — behaviour from the design, unchanged apart from reading the server-rendered markup (instead of building
 * it from a product array): the header menu shows only when it fits, and the promotions slider moves its slides.
 * Cart, favourites, newsletter and filters are handled by the platform runtime (data-shop-* attributes).
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // Header: the menu is shown only when it fits next to the logo and the icons (otherwise the icons alone).
  function fitHeaderNav() {
    const slot = $('headerNavSlot');
    const nav = $('headerNav');
    if (!slot || !nav) return;
    nav.style.visibility = nav.getBoundingClientRect().width <= slot.clientWidth ? 'visible' : 'hidden';
  }
  const observer = 'ResizeObserver' in window ? new ResizeObserver(fitHeaderNav) : null;
  function watchHeader() {
    const slot = $('headerNavSlot');
    if (!slot || !observer) return;
    observer.disconnect();
    observer.observe(slot);
    observer.observe($('headerNav'));
  }
  watchHeader();
  window.addEventListener('resize', fitHeaderNav);
  if (document.fonts) document.fonts.ready.then(fitHeaderNav);
  fitHeaderNav();

  // Promotions: one product in the middle, neighbours smaller; arrows, dots, keyboard and swipe. Endless.
  function setupPromoSlider(shell) {
    const stage = shell.querySelector('[data-promo-stage]');
    const section = shell.parentElement;
    const dots = section.querySelector('[data-promo-dots]');
    const status = section.querySelector('[data-promo-status]');
    const slides = [...stage.children];
    const n = slides.length;
    if (!n) return;
    let index = n > 1 ? 1 : 0;
    let busy = false;
    let queued = 0;
    const offsetOf = (i) => {
      const d = (i - index + n) % n;
      return d > Math.floor(n / 2) ? d - n : d;
    };
    function position(animate = true) {
      slides.forEach((el, i) => {
        const offset = offsetOf(i);
        const previous = Number(el.dataset.offset);
        const show = Math.abs(offset) <= 1;
        const jump = !animate || Math.abs(previous - offset) > 1;
        el.classList.toggle('no-motion', jump);
        el.dataset.offset = String(offset);
        el.dataset.visible = String(show);
        el.dataset.center = String(offset === 0);
        el.style.setProperty('--offset', offset);
        el.style.setProperty('--scale', offset === 0 ? 1 : Math.abs(offset) === 1 ? 0.79 : 0.69);
        el.style.setProperty('--visible', show ? 1 : 0);
        el.setAttribute('aria-hidden', String(!show));
        el.tabIndex = show ? 0 : -1;
        if (jump) {
          void el.offsetWidth;
          el.classList.remove('no-motion');
        }
      });
      [...(dots?.children ?? [])].forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));
      const name = slides[index].querySelector('h3')?.textContent ?? '';
      if (status) status.textContent = `${name} — ${index + 1} / ${n}`;
    }
    function step(dir) {
      if (n < 2) return;
      if (busy) {
        queued = dir;
        return;
      }
      busy = true;
      index = (index + dir + n) % n;
      position();
      setTimeout(() => {
        busy = false;
        if (queued) {
          const d = queued;
          queued = 0;
          step(d);
        }
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 20 : 460);
    }
    section.querySelector('[data-promo-prev]')?.addEventListener('click', () => step(-1));
    section.querySelector('[data-promo-next]')?.addEventListener('click', () => step(1));
    dots?.addEventListener('click', (e) => {
      const dot = e.target.closest('[data-slide]');
      if (!dot || busy) return;
      const d = (Number(dot.dataset.slide) - index + n) % n;
      if (!d) return;
      // The shorter way round: one or two animated steps, further targets directly
      const forward = d <= n / 2;
      const steps = forward ? d : n - d;
      if (steps > 2) {
        index = Number(dot.dataset.slide);
        position();
        return;
      }
      step(forward ? 1 : -1);
      if (steps === 2) queued = forward ? 1 : -1;
    });
    shell.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 1 : -1);
      }
    });
    let start = null;
    let lastSwipe = 0;
    stage.addEventListener('touchstart', (e) => { start = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start[0];
      const dy = e.changedTouches[0].clientY - start[1];
      start = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        lastSwipe = Date.now();
        step(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
    // A side product moves to the middle; only the middle one opens the product page. A swipe never opens anything.
    stage.addEventListener('click', (e) => {
      if (Date.now() - lastSwipe < 500) {
        e.preventDefault();
        return;
      }
      const slide = e.target.closest('.young-slide');
      if (slide && slide.dataset.center !== 'true') {
        e.preventDefault();
        step(Number(slide.dataset.offset) > 0 ? 1 : -1);
      }
    });
    position(false);
  }
  // "Kontakt" scrolls smoothly to the footer
  function setupContactLinks(root) {
    root.querySelectorAll('a[href="#contact"]').forEach((a) => a.addEventListener('click', (e) => {
      const footer = $('contact');
      if (!footer) return;
      e.preventDefault();
      footer.scrollIntoView({ behavior: 'smooth' });
    }));
  }

  function init(root) {
    root.querySelectorAll('[data-promo-slider]').forEach(setupPromoSlider);
    setupContactLinks(root);
  }
  init(document);
  // A section re-rendered in the editor: set up its behaviour again
  document.addEventListener('shop:section-load', (e) => {
    init(e.target);
    if (e.target.querySelector('#headerNav')) {
      watchHeader();
      fitHeaderNav();
    }
  });
})();
