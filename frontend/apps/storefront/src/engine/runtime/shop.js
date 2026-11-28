/*
 * Shopivo storefront runtime — the shop behaviour every template gets, wired through data-shop-* attributes in the
 * template's HTML (contract: docs/TEMPLATE_FORMAT.md). Plain browser JavaScript, no build step, no dependencies.
 *
 * The cart token and favourites are kept both in cookies (so the server can render the cart and favourites pages) and
 * in localStorage under the keys the checkout pages use, so the visitor keeps one cart across all pages.
 */
(() => {
  'use strict';
  const API = '/api/v1/storefront';
  const config = (() => {
    try {
      return JSON.parse(document.getElementById('shop-config')?.textContent || '{}');
    } catch {
      return {};
    }
  })();
  const CART_COOKIE = config.cartCookie || 'shopivo_cart';
  const FAV_COOKIE = config.favCookie || 'shopivo_fav';
  const CART_KEY = 'shopivo.cart';
  const FAV_KEY = 'sf-wishlist';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const preview = new URLSearchParams(location.search).get('podglad');

  // ------------------------------------------------------------------------------------------- storage

  function getCookie(name) {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }
  function setCookie(name, value, days) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${value ? days * 86400 : 0}; SameSite=Lax${secure}`;
  }
  function local(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* private mode: cookies still work */
    }
    return null;
  }

  function cartToken() {
    const fromCookie = getCookie(CART_COOKIE);
    if (fromCookie) return fromCookie;
    const fromCheckout = local(CART_KEY);
    if (fromCheckout) setCookie(CART_COOKIE, fromCheckout, 30);
    return fromCheckout;
  }
  function saveCartToken(token) {
    setCookie(CART_COOKIE, token || '', 30);
    local(CART_KEY, token || null);
  }

  function favourites() {
    const ids = new Set((getCookie(FAV_COOKIE) || '').split(',').filter((id) => UUID.test(id)));
    try {
      for (const id of JSON.parse(local(FAV_KEY) || '[]')) if (UUID.test(id)) ids.add(id);
    } catch {
      /* ignore a broken value */
    }
    return [...ids].slice(-60);
  }
  function saveFavourites(ids) {
    setCookie(FAV_COOKIE, ids.join(','), 365);
    local(FAV_KEY, ids.length ? JSON.stringify(ids) : null);
  }

  // ------------------------------------------------------------------------------------------- API

  async function api(method, path, body, token, extra) {
    // Template preview: example catalogue only; nothing is bought, saved or sent
    if (config.demo) {
      if (method !== 'GET') throw new Error('To podgląd szablonu z przykładowymi produktami — koszyk, zamówienia i zapisy działają w Twoim sklepie.');
      path = '/demo/' + config.demo + path;
    }
    // X-Requested-With: the API's CSRF check for account and newsletter requests (a cross-site form cannot set it)
    const headers = { Accept: 'application/json', 'X-Requested-With': 'shopivo', ...(extra || {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['X-Cart-Token'] = token;
    if (preview) headers['X-Store-Preview'] = preview;
    const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error((data && data.detail) || 'Coś poszło nie tak. Spróbuj ponownie.');
      error.status = res.status;
      throw error;
    }
    return data;
  }

  async function addToCart(variantId, quantity) {
    let token = cartToken();
    if (!token) {
      const created = await api('POST', '/cart', null);
      token = created.token;
      saveCartToken(token);
    }
    try {
      return await api('POST', '/cart/items', { variantId, quantity }, token);
    } catch (e) {
      if (e.status !== 404) throw e;
      // The cart expired: start a new one
      const created = await api('POST', '/cart', null);
      saveCartToken(created.token);
      return api('POST', '/cart/items', { variantId, quantity }, created.token);
    }
  }

  // ------------------------------------------------------------------------------------------- UI helpers

  let toastTimer;
  function toast(message) {
    const el = document.querySelector('[data-shop-toast]');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function setCounts(cartCount) {
    if (typeof cartCount === 'number') {
      document.querySelectorAll('[data-shop-cart-count]').forEach((el) => { el.textContent = String(cartCount); el.dataset.count = String(cartCount); });
      document.querySelectorAll('[data-shop-cart-label]').forEach((el) => {
        el.setAttribute('aria-label', el.dataset.shopCartLabel.replace('{count}', String(cartCount)));
      });
    }
    const favs = favourites().length;
    document.querySelectorAll('[data-shop-fav-count]').forEach((el) => { el.textContent = String(favs); el.dataset.count = String(favs); });
    document.querySelectorAll('[data-shop-fav-label]').forEach((el) => {
      el.setAttribute('aria-label', el.dataset.shopFavLabel.replace('{count}', String(favs)));
    });
  }

  function syncFavButtons(root = document) {
    const ids = new Set(favourites());
    root.querySelectorAll('[data-shop-fav]').forEach((b) => {
      const on = ids.has(b.dataset.shopFav);
      b.setAttribute('aria-pressed', String(on));
      if (b.dataset.on && b.dataset.off) b.textContent = on ? b.dataset.on : b.dataset.off;
      if (b.dataset.ariaOn && b.dataset.ariaOff) b.setAttribute('aria-label', on ? b.dataset.ariaOn : b.dataset.ariaOff);
    });
  }

  /** Re-renders sections of the current page on the server and swaps them in (cart page after a change…). */
  async function refreshSections(ids, onlyRegions) {
    const path = location.pathname + location.search;
    const res = await fetch(`/_shop/sections?path=${encodeURIComponent(path)}&ids=${encodeURIComponent(ids.join(','))}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error('sections ' + res.status);
    const html = await res.json();
    for (const [id, markup] of Object.entries(html)) {
      const current = document.querySelector(`[data-shop-section="${CSS.escape(id)}"]`);
      if (!current) continue;
      const next = new DOMParser().parseFromString(markup, 'text/html').body.firstElementChild;
      if (!next) continue;
      if (onlyRegions) {
        next.querySelectorAll('[data-shop-region]').forEach((region) => {
          const old = current.querySelector(`[data-shop-region="${CSS.escape(region.dataset.shopRegion)}"]`);
          if (old) old.replaceWith(region);
        });
      } else {
        current.replaceWith(next);
      }
    }
    syncFavButtons();
  }

  function sectionOf(el) {
    return el.closest('[data-shop-section]')?.dataset.shopSection;
  }

  // ------------------------------------------------------------------------------------------- actions

  async function quickAdd(button) {
    const slug = button.dataset.product;
    button.disabled = true;
    try {
      const product = await api('GET', '/products/' + encodeURIComponent(slug));
      const available = product.variants.filter((v) => v.available);
      // Products with options are chosen on their page
      if (product.variants.length !== 1 || available.length !== 1) {
        location.href = '/produkt/' + encodeURIComponent(slug);
        return;
      }
      const cart = await addToCart(available[0].id, 1);
      setCounts(cart.itemCount);
      toast('Dodano do koszyka');
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  }

  function toggleFavourite(button) {
    const id = button.dataset.shopFav;
    if (!UUID.test(id)) return;
    const ids = favourites();
    const was = ids.includes(id);
    saveFavourites(was ? ids.filter((x) => x !== id) : [...ids, id].slice(-60));
    syncFavButtons();
    setCounts();
    toast(was ? 'Usunięto z ulubionych' : 'Dodano do ulubionych');
    const favPage = document.querySelector('[data-shop-favorites]');
    if (was && favPage) {
      const section = sectionOf(favPage);
      if (section) refreshSections([section]).catch(() => location.reload());
    }
  }

  async function setQuantity(button) {
    const variant = button.dataset.shopCartSet;
    const quantity = Math.max(0, Math.min(99, Number(button.dataset.quantity) || 0));
    const token = cartToken();
    if (!token) return;
    button.disabled = true;
    try {
      const cart = await api('PATCH', '/cart/items/' + encodeURIComponent(variant), { quantity }, token);
      setCounts(cart.itemCount);
      const section = sectionOf(button);
      if (section) await refreshSections([section]);
    } catch (e) {
      toast(e.message);
      button.disabled = false;
    }
  }

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const add = target.closest('button[data-shop-add]');
    if (add) {
      e.preventDefault();
      void quickAdd(add);
      return;
    }
    const fav = target.closest('[data-shop-fav]');
    if (fav) {
      e.preventDefault();
      toggleFavourite(fav);
      return;
    }
    const set = target.closest('[data-shop-cart-set]');
    if (set) {
      e.preventDefault();
      void setQuantity(set);
    }
  });

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    const status = form.querySelector('[data-shop-status]');
    const say = (text) => { if (status) status.textContent = text; };

    if (form.matches('[data-shop-add-form]')) {
      e.preventDefault();
      const data = new FormData(form);
      const variant = String(data.get('variant') || '');
      const quantity = Number(data.get('quantity') || 1);
      if (!UUID.test(variant) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        say('Wybierz wariant i ilość (1–99).');
        return;
      }
      const button = form.querySelector('[type="submit"]');
      if (button) button.disabled = true;
      addToCart(variant, quantity)
        .then((cart) => {
          setCounts(cart.itemCount);
          say('');
          toast('Dodano do koszyka');
        })
        .catch((err) => say(err.message))
        .finally(() => { if (button) button.disabled = false; });
      return;
    }

    if (form.matches('[data-shop-newsletter]')) {
      e.preventDefault();
      if (!form.checkValidity()) {
        say('Podaj adres e-mail i zaznacz zgodę.');
        return;
      }
      const email = String(new FormData(form).get('email') || '').trim();
      const captcha = captchaToken(form);
      if (captcha === undefined) {
        say('Potwierdź, że nie jesteś robotem.');
        return;
      }
      api('POST', '/newsletter', { email }, null, captcha ? { 'X-Captcha-Token': captcha } : undefined)
        .then(() => {
          form.reset();
          say('Dziękujemy! Sprawdź skrzynkę i potwierdź zapis.');
        })
        .catch((err) => {
          resetCaptcha(form);
          say(err.message);
        });
      return;
    }

    if (form.matches('[data-shop-filter]')) {
      e.preventDefault();
      applyFilter(form);
    }
  });

  // Catalogue filters: results update in place, the address follows (shareable, back button friendly).
  function applyFilter(form) {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (String(v).trim()) params.set(k, String(v).trim());
    if (preview) params.set('podglad', preview);
    const category = params.get('kategoria');
    // A category on its own page keeps its address; with other filters the list is /produkty?kategoria=…
    const base = form.getAttribute('action') || location.pathname;
    const url = base + (params.toString() ? '?' + params : '');
    history.replaceState(null, '', url);
    const section = sectionOf(form);
    if (section) refreshSections([section], true).catch(() => { location.href = url; });
    return category;
  }
  let filterTimer;
  document.addEventListener('change', (e) => {
    const form = e.target instanceof Element ? e.target.closest('form[data-shop-filter]') : null;
    if (form && e.target.tagName === 'SELECT') applyFilter(form);
  });
  document.addEventListener('input', (e) => {
    const form = e.target instanceof Element ? e.target.closest('form[data-shop-filter]') : null;
    if (!form || e.target.type !== 'search') return;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => applyFilter(form), 350);
  });


  // ------------------------------------------------------------------------------------------- captcha

  /** Cloudflare Turnstile, only where a form has [data-shop-captcha="site key"] (the store has protection on). */
  const captchas = new WeakMap();
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')));
      s.onerror = () => reject(new Error('turnstile'));
      document.head.appendChild(s);
    });
  }
  function setupCaptcha(box) {
    const state = { token: null, widget: null };
    captchas.set(box, state);
    loadTurnstile().then((t) => {
      state.widget = t.render(box, {
        sitekey: box.dataset.shopCaptcha, language: 'pl',
        callback: (token) => { state.token = token; },
        'expired-callback': () => { state.token = null; },
      });
    }).catch(() => { box.textContent = 'Nie udało się wczytać zabezpieczenia formularza. Odśwież stronę.'; });
  }
  /** The form's one-time captcha token (null when the form has no captcha; undefined when it is not solved yet). */
  function captchaToken(form) {
    const box = form.querySelector('[data-shop-captcha]');
    if (!box) return null;
    const state = captchas.get(box);
    return state && state.token ? state.token : undefined;
  }
  function resetCaptcha(form) {
    const box = form.querySelector('[data-shop-captcha]');
    const state = box && captchas.get(box);
    if (state && state.widget !== null && window.turnstile) {
      state.token = null;
      window.turnstile.reset(state.widget);
    }
  }
  document.querySelectorAll('[data-shop-captcha]').forEach(setupCaptcha);

  // ------------------------------------------------------------------------------------------- checkout

  const moneyFormat = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: config.currency || 'PLN' });
  const fmt = (minor) => moneyFormat.format(minor / 100);

  function checkoutState(form) {
    const totals = form.querySelector('[data-shop-totals]');
    const subtotal = Number(totals?.dataset.subtotal || 0);
    const ship = form.querySelector('input[name="shippingMethodId"]:checked');
    const pay = form.querySelector('input[name="paymentMethod"]:checked');
    const freeFrom = ship && ship.dataset.freeFrom !== '' ? Number(ship.dataset.freeFrom) : null;
    const shipping = ship ? (freeFrom !== null && subtotal >= freeFrom ? 0 : Number(ship.dataset.price || 0)) : null;
    const fee = pay ? Number(pay.dataset.fee || 0) : 0;
    return { subtotal, ship, pay, shipping, fee, total: subtotal + (shipping || 0) + fee };
  }

  function updateCheckout(form) {
    const st = checkoutState(form);
    // "Gratis" next to methods that are free for this cart
    form.querySelectorAll('input[name="shippingMethodId"]').forEach((input) => {
      const label = input.closest('label')?.querySelector('[data-shop-shipping-price]');
      if (!label) return;
      const free = input.dataset.freeFrom !== '' && st.subtotal >= Number(input.dataset.freeFrom);
      label.textContent = free || Number(input.dataset.price) === 0 ? 'Gratis' : fmt(Number(input.dataset.price));
    });
    const set = (k, v) => { const el = form.querySelector(`[data-shop-total="${k}"]`); if (el) el.textContent = v; };
    set('shipping', st.shipping === null ? '—' : st.shipping === 0 ? 'Gratis' : fmt(st.shipping));
    set('fee', fmt(st.fee));
    const feeRow = form.querySelector('[data-shop-fee-row]');
    if (feeRow) feeRow.hidden = !st.fee;
    set('total', fmt(st.total));
    form.querySelectorAll('[data-shop-pickup]').forEach((box) => { box.hidden = !st.ship || st.ship.value !== box.dataset.shopPickup; });
    form.querySelectorAll('[data-shop-toggle]').forEach((t) => {
      form.querySelectorAll(`[data-shop-when="${CSS.escape(t.dataset.shopToggle)}"]`).forEach((el) => { el.hidden = !t.checked; });
    });
  }

  // Parcel lockers: search by postal code / city, or type the code
  async function searchPickup(box) {
    const q = box.querySelector('[data-shop-pickup-query]').value.trim();
    const list = box.querySelector('[data-shop-pickup-results]');
    const status = box.querySelector('[data-shop-pickup-status]');
    if (q.length < 2) return;
    status.textContent = 'Szukam…';
    list.replaceChildren();
    try {
      const points = await api('GET', `/pickup-points?metoda=${encodeURIComponent(box.dataset.shopPickup)}&q=${encodeURIComponent(q)}`);
      status.textContent = points.length ? '' : 'Nie znaleźliśmy paczkomatów — spróbuj innej frazy albo wpisz kod paczkomatu.';
      for (const p of points) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.code = p.code;
        const strong = document.createElement('strong');
        strong.textContent = p.code;
        b.append(strong, ` · ${p.address}`);
        if (p.description) {
          const small = document.createElement('span');
          small.className = 'checkout-muted';
          small.style.display = 'block';
          small.textContent = p.description;
          b.append(small);
        }
        li.append(b);
        list.append(li);
      }
    } catch (e) {
      status.textContent = e.message || 'Nie udało się wyszukać paczkomatów. Wpisz kod paczkomatu.';
    }
  }

  function pickupCode(form) {
    const st = checkoutState(form);
    if (!st.ship || !('pickup' in st.ship.dataset)) return null;
    const box = form.querySelector(`[data-shop-pickup="${CSS.escape(st.ship.value)}"]`);
    return box ? box.querySelector('[data-shop-pickup-code]').value.trim().toUpperCase() : '';
  }

  /** Same rules as the server (which checks everything again). Returns the first problem or null. */
  function validateCheckout(form) {
    const v = (name) => String(form.elements[name]?.value ?? '').trim();
    const mark = (name, bad) => { const el = form.elements[name]; if (el && el.setAttribute) el.setAttribute('aria-invalid', String(bad)); return bad; };
    const shipping = !!form.querySelector('[data-shop-needs-shipping]');
    const invoice = !!form.elements['invoice']?.checked;
    const bad = [
      mark('email', !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v('email'))),
      mark('firstName', !v('firstName')),
      mark('lastName', !v('lastName')),
      shipping && mark('line1', !v('line1')),
      shipping && mark('postalCode', !/^\d{2}-\d{3}$/.test(v('postalCode'))),
      shipping && mark('city', !v('city')),
      invoice && mark('companyName', !v('companyName')),
      invoice && mark('taxId', v('taxId').replace(/\D/g, '').length !== 10),
      mark('termsAccepted', !form.elements['termsAccepted']?.checked),
    ].some(Boolean);
    if (bad) return 'Uzupełnij zaznaczone pola i zaakceptuj regulamin.';
    const st = checkoutState(form);
    if (shipping && !st.ship) return 'Wybierz sposób dostawy.';
    if (pickupCode(form) === '') return 'Wybierz paczkomat.';
    if (!st.pay) return 'Wybierz metodę płatności.';
    return null;
  }

  function busy(button, on) {
    if (!button) return;
    if (on) {
      button.dataset.label = button.textContent;
      if (button.dataset.busyLabel) button.textContent = button.dataset.busyLabel;
    } else if (button.dataset.label) {
      button.textContent = button.dataset.label;
    }
    button.disabled = on;
  }

  function rememberOrder(token) {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${config.orderCookie || 'shopivo_order'}=${encodeURIComponent(token)}; Path=/; Max-Age=86400; SameSite=Lax${secure}`;
    try { sessionStorage.setItem('shopivo.lastOrder', token); } catch { /* the cookie is enough */ }
  }

  async function submitCheckout(form) {
    const error = form.querySelector('[data-shop-error]');
    const say = (t) => { if (error) error.textContent = t || ''; };
    const problem = validateCheckout(form);
    if (problem) {
      say(problem);
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const captcha = captchaToken(form);
    if (captcha === undefined) {
      say('Potwierdź, że nie jesteś robotem (pole nad przyciskiem).');
      return;
    }
    const token = cartToken();
    if (!token) {
      location.href = '/koszyk';
      return;
    }
    const v = (name) => String(form.elements[name]?.value ?? '').trim();
    const st = checkoutState(form);
    const shipping = !!form.querySelector('[data-shop-needs-shipping]');
    const invoice = !!form.elements['invoice']?.checked;
    const body = {
      email: v('email'), phone: v('phone') || null, firstName: v('firstName'), lastName: v('lastName'),
      shippingAddress: shipping ? { name: `${v('firstName')} ${v('lastName')}`.trim(), company: invoice ? v('companyName') : null,
        line1: v('line1'), line2: null, postalCode: v('postalCode'), city: v('city'), countryCode: 'PL', phone: v('phone') || null } : null,
      billing: invoice ? { invoice: true, companyName: v('companyName'), taxId: v('taxId'), address: null } : null,
      shippingMethodId: shipping && st.ship ? st.ship.value : null, paymentMethod: st.pay.value,
      customerNote: v('customerNote') || null, termsAccepted: true, marketingConsent: !!form.elements['marketingConsent']?.checked,
      pickupPointCode: pickupCode(form) || null,
    };
    const button = form.querySelector('[type="submit"]');
    busy(button, true);
    say('');
    try {
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Cart-Token': token, 'X-Requested-With': 'shopivo' };
      if (captcha) headers['X-Captcha-Token'] = captcha;
      if (preview) headers['X-Store-Preview'] = preview;
      if (config.demo) throw new Error('To podgląd szablonu — zamówienia działają w Twoim sklepie.');
      const res = await fetch(API + '/checkout', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.detail) || 'Nie udało się złożyć zamówienia. Spróbuj ponownie.');
      rememberOrder(data.orderToken);
      saveCartToken(null);
      if (st.pay.value === 'ONLINE') {
        try {
          const pay = await api('POST', '/orders/pay', null, null, { 'X-Order-Token': data.orderToken });
          location.assign(pay.redirectUrl);
          return;
        } catch {
          // the confirmation page offers "Zapłać" again
        }
      }
      location.assign('/zamowienie/potwierdzenie');
    } catch (e) {
      resetCaptcha(form); // tokens are single-use
      say(e.message);
      busy(button, false);
    }
  }

  document.querySelectorAll('form[data-shop-checkout]').forEach((form) => {
    updateCheckout(form);
    form.addEventListener('change', () => updateCheckout(form));
    form.addEventListener('input', (e) => {
      if (e.target.getAttribute && e.target.getAttribute('aria-invalid') === 'true') e.target.setAttribute('aria-invalid', 'false');
    });
    form.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      const search = t && t.closest('[data-shop-pickup-search]');
      if (search) void searchPickup(search.closest('[data-shop-pickup]'));
      const choice = t && t.closest('[data-shop-pickup-results] button');
      if (choice) {
        const box = choice.closest('[data-shop-pickup]');
        box.querySelector('[data-shop-pickup-code]').value = choice.dataset.code;
        box.querySelector('[data-shop-pickup-status]').textContent = 'Wybrano: ' + choice.textContent;
      }
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-shop-pickup-query]')) {
        e.preventDefault();
        void searchPickup(e.target.closest('[data-shop-pickup]'));
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void submitCheckout(form);
    });
  });

  // Order confirmation: after an online payment the operator's notice usually arrives within seconds
  document.querySelectorAll('[data-shop-order]').forEach((box) => {
    const waiting = box.querySelector('[data-shop-order-waiting]');
    const retry = box.querySelector('[data-shop-order-retry]');
    const orderToken = getCookie(config.orderCookie || 'shopivo_order');
    if ('wait' in box.dataset && orderToken) {
      let tries = 0;
      const poll = async () => {
        try {
          const o = await api('GET', '/orders/status', undefined, null, { 'X-Order-Token': orderToken });
          if (o.paymentStatus !== 'UNPAID' || o.status === 'CANCELED') {
            location.reload();
            return;
          }
        } catch {
          tries = 99;
        }
        if (++tries < 6) setTimeout(poll, 2500);
        else {
          if (waiting) waiting.hidden = true;
          if (retry) retry.hidden = false;
        }
      };
      setTimeout(poll, 2500);
    }
    box.querySelector('[data-shop-order-pay]')?.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      busy(button, true);
      try {
        const pay = await api('POST', '/orders/pay', null, null, { 'X-Order-Token': orderToken });
        location.assign(pay.redirectUrl);
      } catch (err) {
        const error = box.querySelector('[data-shop-error]');
        if (error) error.textContent = err.message;
        busy(button, false);
      }
    });
  });


  // ------------------------------------------------------------------------------------------- account forms

  /** One-time secret from an e-mail link (#t=… or ?t=…), removed from the address bar at once. */
  function takeLinkToken() {
    const url = new URL(location.href);
    const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('t') || url.searchParams.get('t');
    if (token) {
      url.searchParams.delete('t');
      history.replaceState(history.state, '', url.pathname + url.search);
    }
    return token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null;
  }
  const linkToken = document.querySelector('[data-shop-needs-link-token]') ? takeLinkToken() : null;
  document.querySelectorAll('[data-shop-needs-link-token]').forEach((el) => {
    const missing = el.querySelector('[data-shop-link-missing]');
    const form = el.querySelector('form');
    if (!linkToken) {
      if (form) form.hidden = true;
      if (missing) missing.hidden = false;
    }
  });

  /** A store-relative path from ?powrot= (no open redirects). */
  function backPath(fallback) {
    const p = new URLSearchParams(location.search).get('powrot');
    return p && /^\/(?![/\\])/.test(p) ? p : fallback;
  }

  const ACCOUNT = '/account';
  /**
   * Named form actions (the template only says which one): request, and what happens after success —
   * "done" shows [data-shop-done] instead of the form, "reload" re-renders the page, a path navigates there.
   */
  const ACTIONS = {
    login: (d) => ({ method: 'POST', path: ACCOUNT + '/login', body: { email: d.email.trim(), password: d.password }, then: backPath('/konto') }),
    register: (d) => ({ method: 'POST', path: ACCOUNT + '/register', captcha: true, then: 'done',
      body: { email: d.email.trim(), password: d.password, firstName: (d.firstName || '').trim(), lastName: (d.lastName || '').trim(), termsAccepted: !!d.termsAccepted } }),
    verify: (d) => ({ method: 'POST', path: ACCOUNT + '/verify', body: { token: linkToken, password: d.password }, then: '/konto' }),
    'reset-request': (d) => ({ method: 'POST', path: ACCOUNT + '/password-reset', captcha: true, body: { email: d.email.trim() }, then: 'done' }),
    reset: (d) => ({ method: 'POST', path: ACCOUNT + '/password-reset/confirm', body: { token: linkToken, password: d.password }, then: 'done' }),
    profile: (d) => ({ method: 'PATCH', path: ACCOUNT + '/me', body: { firstName: d.firstName.trim(), lastName: d.lastName.trim(), phone: (d.phone || '').trim() || null },
      then: 'message', message: 'Zapisano dane.' }),
    password: (d) => ({ method: 'POST', path: ACCOUNT + '/password', body: { currentPassword: d.currentPassword, newPassword: d.newPassword },
      then: 'message', message: 'Hasło zostało zmienione.', reset: true }),
    'delete-account': (d) => ({ method: 'POST', path: ACCOUNT + '/delete', body: { password: d.password }, then: '/',
      confirm: 'Usunąć konto na stałe? Tej operacji nie można cofnąć.' }),
    address: (d) => ({ method: d.id ? 'PUT' : 'POST', path: ACCOUNT + '/addresses' + (d.id ? '/' + encodeURIComponent(d.id) : ''), then: 'reload',
      body: { name: d.name.trim(), company: (d.company || '').trim() || null, line1: d.line1.trim(), line2: (d.line2 || '').trim() || null,
        postalCode: d.postalCode.trim(), city: d.city.trim(), countryCode: 'PL', phone: (d.phone || '').trim() || null, isDefault: !!d.isDefault } }),
    'address-delete': (d) => ({ method: 'DELETE', path: ACCOUNT + '/addresses/' + encodeURIComponent(d.id), then: 'reload', confirm: 'Usunąć ten adres?' }),
    review: (d) => ({ method: 'POST', path: ACCOUNT + '/reviews', then: 'done',
      body: { orderNumber: Number(d.orderNumber), productId: d.productId, rating: Number(d.rating), body: (d.body || '').trim() || null } }),
    return: (d, form) => ({ method: 'POST', path: ACCOUNT + `/orders/${Number(d.orderNumber)}/returns`, then: 'done',
      body: { kind: d.kind, reason: (d.reason || '').trim() || null, refundAccount: (d.refundAccount || '').trim() || null,
        items: [...form.querySelectorAll('[data-return-item]')].map((s) => ({ orderItemId: s.dataset.returnItem, quantity: Number(s.value) })).filter((i) => i.quantity > 0) } }),
    logout: () => ({ method: 'POST', path: ACCOUNT + '/logout', then: '/' }),
    'order-pay': (d) => ({ method: 'POST', path: ACCOUNT + `/orders/${Number(d.orderNumber)}/pay`, then: 'payment' }),
    // Review from an e-mail invitation (/opinia): authorised by the link's token, not by an account
    'invite-review': (d, form) => ({ method: 'POST', path: '/reviews', then: 'done', headers: { 'X-Review-Token': reviewToken },
      body: { productId: d.productId, rating: Number(d.rating), body: (d.body || '').trim() || null,
        authorName: (document.querySelector('[data-shop-review-author]')?.value || '').trim() || null } }),
  };

  /** Checks a form action can be sent; returns the problem in words or null. */
  function precheck(name, d, form) {
    if (name === 'register' && !d.termsAccepted) return 'Zaakceptuj regulamin sklepu.';
    if ((name === 'verify' || name === 'reset') && !linkToken) return 'Link jest niepełny. Otwórz go ponownie z wiadomości e-mail.';
    if ((name === 'review' || name === 'invite-review') && !Number(d.rating)) return 'Wybierz ocenę od 1 do 5.';
    if (name === 'return') {
      if (![...form.querySelectorAll('[data-return-item]')].some((s) => Number(s.value) > 0)) return 'Wybierz co najmniej jeden produkt.';
      if (d.kind === 'COMPLAINT' && !(d.reason || '').trim()) return 'Opisz wadę produktu.';
    }
    return null;
  }

  async function submitAction(form) {
    const name = form.dataset.shopForm;
    const action = ACTIONS[name];
    if (!action) return;
    const error = form.querySelector('[data-shop-error]');
    const message = form.querySelector('[data-shop-status]');
    const say = (t, el = error) => { if (el) el.textContent = t || ''; };
    say('');
    say('', message);
    const d = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.type === 'checkbox') d[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) d[el.name] = el.value; }
      else d[el.name] = el.value;
    }
    const problem = precheck(name, d, form);
    if (problem) {
      say(problem);
      return;
    }
    const req = action(d, form);
    if (req.confirm && !window.confirm(req.confirm)) return;
    const extra = { ...(req.headers || {}) };
    if (req.captcha) {
      const token = captchaToken(form);
      if (token === undefined) {
        say('Potwierdź, że nie jesteś robotem.');
        return;
      }
      if (token) extra['X-Captcha-Token'] = token;
    }
    const button = form.querySelector('[type="submit"]');
    busy(button, true);
    try {
      const result = await api(req.method, req.path, req.body, null, extra);
      if (req.then === 'done') {
        const done = form.parentElement.querySelector('[data-shop-done]');
        if (done) {
          done.hidden = false;
          const n = done.querySelector('[data-shop-done-number]');
          if (n && result && result.number) n.textContent = String(result.number);
          form.hidden = true;
          done.focus?.();
        }
      } else if (req.then === 'reload') {
        location.reload();
        return;
      } else if (req.then === 'message') {
        say(req.message, message);
        if (req.reset) form.reset();
      } else if (req.then === 'payment') {
        location.assign(result.redirectUrl);
        return;
      } else {
        location.assign(req.then);
        return;
      }
    } catch (e) {
      resetCaptcha(form);
      say(e.message);
    }
    busy(button, false);
  }

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.dataset.shopForm) return;
    e.preventDefault();
    void submitAction(form);
  });

  // "Edytuj" opens the address form filled in; "Dodaj adres" opens it empty
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-shop-address-edit]') : null;
    if (!t) return;
    const form = document.querySelector('form[data-shop-form="address"]');
    if (!form) return;
    form.reset();
    const data = t.dataset.shopAddressEdit ? JSON.parse(t.dataset.shopAddressEdit) : {};
    for (const [k, v] of Object.entries(data)) {
      const el = form.elements[k];
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v ?? '';
    }
    const title = form.querySelector('[data-shop-address-title]');
    if (title) title.textContent = data.id ? 'Edytuj adres' : 'Nowy adres';
    form.hidden = false;
    form.querySelector('input:not([type=hidden])')?.focus();
  });
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target.closest('[data-shop-hide-form]') : null;
    if (t) t.closest('form').hidden = true;
  });


  // Review invitation (/opinia#t=…): the order's products, one form each (cloned from the template's <template>)
  let reviewToken = null;
  document.querySelectorAll('[data-shop-review-invite]').forEach((box) => {
    const show = (state) => box.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });
    reviewToken = takeLinkToken();
    if (!reviewToken) {
      show('missing');
      return;
    }
    fetch(API + '/review-invitation', { headers: { Accept: 'application/json', 'X-Review-Token': reviewToken, 'X-Requested-With': 'shopivo' } })
      .then(async (res) => {
        if (!res.ok) {
          show(res.status === 410 ? 'expired' : 'invalid');
          return;
        }
        const inv = await res.json();
        box.querySelectorAll('[data-shop-review-order]').forEach((el) => { el.textContent = String(inv.orderNumber); });
        const author = box.querySelector('[data-shop-review-author]');
        if (author && !author.value) author.value = inv.suggestedAuthor || '';
        const list = box.querySelector('[data-shop-review-items]');
        const tpl = box.querySelector('template[data-shop-review-item]');
        for (const item of inv.items) {
          const node = tpl.content.firstElementChild.cloneNode(true);
          node.querySelectorAll('[data-shop-review-name]').forEach((el) => { el.textContent = item.name; });
          node.querySelectorAll('input[name="productId"]').forEach((el) => { el.value = item.productId; });
          node.querySelectorAll('input[name="rating"]').forEach((el) => { el.name = 'rating'; el.id = `r-${item.productId}-${el.value}`; });
          if (item.reviewed) {
            node.querySelector('form')?.setAttribute('hidden', '');
            node.querySelector('[data-shop-done]')?.removeAttribute('hidden');
          }
          list.append(node);
        }
        show('ready');
      })
      .catch(() => show('invalid'));
  });

  // Newsletter link from an e-mail: confirm or unsubscribe at once
  document.querySelectorAll('[data-shop-newsletter-link]').forEach((box) => {
    const show = (state) => box.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });
    const token = takeLinkToken();
    if (!token) {
      show('invalid');
      return;
    }
    const unsubscribe = box.dataset.shopNewsletterLink === 'unsubscribe';
    api('POST', unsubscribe ? '/newsletter/unsubscribe' : '/newsletter/confirm', { token })
      .then(() => show(unsubscribe ? 'unsubscribed' : 'confirmed'))
      .catch(() => show('invalid'));
  });

  // Countdowns (shared sections): tick every second; at zero show the "after" message or remove the section
  const editingPreview = !!document.getElementById('shop-editor-config');
  function tickCountdowns() {
    const now = Date.now();
    document.querySelectorAll('[data-shop-countdown]').forEach((el) => {
      const end = Date.parse(el.dataset.shopCountdown);
      if (Number.isNaN(end)) return;
      const left = Math.max(0, Math.floor((end - now) / 1000));
      const two = (n) => String(n).padStart(2, '0');
      const parts = { d: Math.floor(left / 86400), h: Math.floor(left / 3600) % 24, m: Math.floor(left / 60) % 60, s: left % 60 };
      el.querySelectorAll('[data-unit]').forEach((u) => { u.textContent = two(parts[u.dataset.unit]); });
      if (left > 0 || el.dataset.shopCountdownDone) return;
      el.dataset.shopCountdownDone = '1';
      if (el.dataset.after === 'hide') {
        if (!editingPreview) el.hidden = true;
        return;
      }
      el.querySelectorAll('[data-shop-countdown-live]').forEach((x) => { x.hidden = true; });
      el.querySelectorAll('[data-shop-countdown-ended]').forEach((x) => { x.hidden = false; });
    });
  }
  if (document.querySelector('[data-shop-countdown]') || editingPreview) {
    tickCountdowns();
    setInterval(tickCountdowns, 1000);
  }

  // ------------------------------------------------------------------------------------------- start

  syncFavButtons();
  setCounts();
  // A cart started on the checkout pages: show its count here too
  if (!getCookie(CART_COOKIE) && local(CART_KEY)) {
    const token = cartToken();
    api('GET', '/cart', undefined, token).then((cart) => setCounts(cart.itemCount)).catch(() => saveCartToken(null));
  }
  window.Shopivo = Object.freeze({ toast, refreshSections });
})();
