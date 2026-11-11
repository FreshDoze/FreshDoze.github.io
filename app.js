(() => {
  'use strict';

  const BOTTLES = { 2: 20, 3: 25, 5: 25, 10: 30, 15: 40, 20: 50, 30: 60, 50: 70 };
  const CARD_VOLS = [3, 5, 10];
  const ALL_VOLS = [2, 3, 5, 10, 15, 20, 30, 50];
  const TG = 'https://t.me/AndresBurmachenko';
  const VIBER = 'viber://chat?number=%2B380954117082';
  const PAGE = 24;
  const CART_KEY = 'freshdoze_cart_v1';

  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const empty = $('empty');
  const moreBtn = $('moreBtn');
  const resultCount = $('resultCount');
  const updatedEl = $('updated');
  const searchInput = $('searchInput');
  const clearSearch = $('clearSearch');
  const brandFilter = $('brandFilter');
  const sortFilter = $('sortFilter');
  const cats = $('cats');
  const toastEl = $('toast');

  const state = {
    products: [],
    updated: '',
    demo: false,
    query: '',
    cat: 'all',
    brand: 'all',
    sort: 'curated',
    limit: PAGE,
    selected: {},
    cart: [],
    modal: null,
    filtered: [],
    content: { e: [], byArt: {}, byName: {} }
  };

  const CATS = [
    ['all', 'Всі'],
    ['Чоловічі', 'Чоловічі'],
    ['Жіночі', 'Жіночі'],
    ['Нішеві', 'Нішеві'],
    ['Арабські', 'Арабські'],
    ['Інше', 'Інше']
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function norm(s) {
    return String(s || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-zа-яіїєґ0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/парфумована вода|туалетна вода|парфуми|одеколон|екстракт|парфюм|унісекс|чоловічі|жіночі|чоловіча|жіноча|духи/g, ' ')
      .replace(/\b\d+\s*(мл|ml)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function fmtNum(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('uk-UA', {
      maximumFractionDigits: 2, minimumFractionDigits: 0
    });
  }
  function money(n) {
    return Math.round(Number(n) || 0).toLocaleString('uk-UA') + ' ₴';
  }
  function priceFor(p, ml) {
    return Math.round((Number(p.priceMl) || 0) * ml + (BOTTLES[ml] || 0));
  }
  function safeUrl(url, fallback) {
    const s = String(url || '').trim();
    return /^https?:\/\//i.test(s) ? s : fallback;
  }
  function cleanAroma(brand, aroma) {
    const b = String(brand || '').trim();
    let a = String(aroma || '').trim();
    if (!b) return a;
    const low = a.toLowerCase();
    const lb = b.toLowerCase();
    if (low.startsWith(lb + ' ')) a = a.slice(b.length).trim();
    return a || String(aroma || '').trim();
  }

  function hash(s) { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0; return Math.abs(h); }
  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- data ---------- */
  function entryOf(id) {
    return (typeof id === 'number' && state.content.e) ? state.content.e[id] : null;
  }
  function contentFor(p) {
    const byArt = state.content.byArt || {};
    const byName = state.content.byName || {};
    let id;
    if (p.art && byArt[p.art] != null) id = byArt[p.art];
    else if (byName[norm(p.brand + ' ' + p.aroma)] != null) id = byName[norm(p.brand + ' ' + p.aroma)];
    else if (byName[norm(p.aroma)] != null) id = byName[norm(p.aroma)];
    if (id == null) return null;
    const e = entryOf(id);
    if (!e) return null;
    return { docName: e.n, desc: e.d, category: e.c, telegram: e.t, image: e.i };
  }

  async function boot() {
    try {
      const [productsRes, contentRes] = await Promise.all([
        fetch('data.json?ts=' + Date.now(), { cache: 'no-store' }),
        fetch('content.json')
      ]);
      if (!productsRes.ok) throw new Error('data.json ' + productsRes.status);
      const raw = await productsRes.json();
      const products = Array.isArray(raw) ? raw : (raw.products || []);
      state.updated = Array.isArray(raw) ? '' : (raw.updated || '');
      state.demo = !Array.isArray(raw) && raw.demo !== false;
      if (contentRes.ok) {
        try {
          const c = await contentRes.json();
          state.content = { e: c.e || [], byArt: c.byArt || {}, byName: c.byName || {}, meta: c.meta || {} };
        } catch (e) { /* content optional */ }
      }
      state.products = products
        .filter((p) => p && p.brand && p.aroma && Math.abs(Number(p.stock) || 0) >= 0.001 && Number(p.priceMl) > 0)
        .map((p, i) => {
          const c = contentFor(p) || {};
          p = { ...p, aroma: cleanAroma(p.brand, p.aroma) };
          return {
            ...p,
            _id: i,
            _cat: c.category || 'Інше',
            _image: c.image || '',
            _desc: c.desc || '',
            _tg: safeUrl(c.telegram, TG),
            _docName: c.docName || '',
            _search: norm([p.brand, p.aroma, c.docName, c.category].join(' '))
          };
        });
      state.cart = loadCart();
      bind();
      buildBrands();
      renderCats();
      updateUpdated();
      updateCartUI();
      apply(true);
    } catch (e) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.querySelector('.empty-title').textContent = 'Не вдалося завантажити каталог';
      empty.querySelector('.empty-text').textContent = 'Оновіть сторінку або спробуйте пізніше.';
      console.error(e);
    }
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((x) => x && x.qty > 0 && x.ml > 0) : [];
    } catch (e) { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch (e) {}
  }

  /* ---------- filtering / rendering ---------- */
  function buildBrands() {
    const brands = [...new Set(state.products.map((p) => p.brand))].sort((a, b) => a.localeCompare(b, 'uk'));
    brandFilter.innerHTML = '<option value="all">Усі бренди</option>' +
      brands.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
  }

  function renderCats() {
    const counts = {};
    state.products.forEach((p) => { counts[p._cat] = (counts[p._cat] || 0) + 1; });
    cats.innerHTML = CATS.map(([key, label]) => {
      const n = key === 'all' ? state.products.length : (counts[key] || 0);
      return `<button class="cat${state.cat === key ? ' active' : ''}" type="button" role="tab" aria-selected="${state.cat === key}" data-cat="${esc(key)}">${esc(label)} <span>${n}</span></button>`;
    }).join('');
  }

  function apply(resetLimit) {
    if (resetLimit) state.limit = PAGE;
    const q = norm(state.query);
    let list = state.products;
    if (state.cat !== 'all') list = list.filter((p) => p._cat === state.cat);
    if (state.brand !== 'all') list = list.filter((p) => p.brand === state.brand);
    if (q) list = list.filter((p) => p._search.includes(q));
    if (state.sort === 'curated') list = list.slice().sort((a, b) => ((b._image ? 1 : 0) - (a._image ? 1 : 0)) || (hash(a.brand + a.aroma) - hash(b.brand + b.aroma)));
    else if (state.sort === 'price-asc') list = list.slice().sort((a, b) => a.priceMl - b.priceMl || a.brand.localeCompare(b.brand, 'uk'));
    else if (state.sort === 'price-desc') list = list.slice().sort((a, b) => b.priceMl - a.priceMl || a.brand.localeCompare(b.brand, 'uk'));
    else list = list.slice().sort((a, b) => a.brand.localeCompare(b.brand, 'uk') || a.aroma.localeCompare(b.aroma, 'uk'));
    state.filtered = list;
    renderGrid();
    renderActiveFilters();
  }

  function filterState() {
    const out = [];
    if (state.query) out.push({ key: 'query', label: 'Пошук', value: state.query });
    if (state.cat !== 'all') out.push({ key: 'cat', label: 'Категорія', value: state.cat });
    if (state.brand !== 'all') out.push({ key: 'brand', label: 'Бренд', value: state.brand });
    if (state.sort !== 'curated') {
      out.push({ key: 'sort', label: 'Сортування', value: sortFilter.options[sortFilter.selectedIndex].textContent.trim() });
    }
    return out;
  }

  function renderActiveFilters() {
    const box = $('activeFilters');
    const items = filterState();
    box.hidden = items.length === 0;
    if (!items.length) { $('chips').innerHTML = ''; return; }
    $('chips').innerHTML = items.map((f) =>
      `<button class="chip" type="button" data-clear="${f.key}" aria-label="Прибрати фільтр ${esc(f.label)}">
        ${esc(f.label)}: <b>${esc(f.value)}</b><span class="x" aria-hidden="true">✕</span>
      </button>`
    ).join('');
  }

  function renderGrid() {
    const list = state.filtered;
    const slice = list.slice(0, state.limit);
    grid.innerHTML = slice.map(cardHtml).join('');
    empty.hidden = list.length !== 0;
    moreBtn.hidden = list.length <= state.limit;
    resultCount.textContent = `${list.length} ${plural(list.length, 'аромат', 'аромати', 'ароматів')}`;
    grid.querySelectorAll('img[data-ph]').forEach((img) => {
      img.addEventListener('error', () => { img.src = 'images/placeholder.svg'; }, { once: true });
    });
  }

  function cardHtml(p) {
    const sel = state.selected[p._id] || 3;
    const img = p._image || 'images/placeholder.svg';
    const price = priceFor(p, sel);
    return `<article class="card" data-id="${p._id}">
      <button class="card-media" type="button" data-open="${p._id}" aria-label="Відкрити ${esc(p.brand + ' ' + p.aroma)}">
        <img src="${esc(img)}" alt="${esc(p.brand + ' ' + p.aroma)}" loading="lazy" decoding="async" width="400" height="500" data-ph>
      </button>
      <div class="card-body">
        <p class="card-brand">${esc(p.brand)}</p>
        <h3 class="card-name"><button type="button" data-open="${p._id}">${esc(p.aroma)}</button></h3>
        <div class="card-price">
          <span class="per">${fmtNum(p.priceMl)} ₴ / мл</span>
          <strong data-price="${p._id}">${money(price)}</strong>
        </div>
        <div class="vols" role="group" aria-label="Обʼєм">
          ${CARD_VOLS.map((ml) => `<button class="vol${ml === sel ? ' active' : ''}" type="button" data-vol="${ml}" data-for="${p._id}" aria-pressed="${ml === sel}">${ml} мл</button>`).join('')}
        </div>
        <button class="add" type="button" data-add="${p._id}">В кошик</button>
      </div>
    </article>`;
  }

  function updateCardPrice(id) {
    const p = state.products[id];
    const ml = state.selected[id] || 3;
    const el = grid.querySelector(`[data-price="${id}"]`);
    if (el && p) el.textContent = money(priceFor(p, ml));
    grid.querySelectorAll(`[data-for="${id}"]`).forEach((b) => {
      const on = Number(b.dataset.vol) === ml;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  /* ---------- product modal ---------- */
  function openProduct(id) {
    const p = state.products[id];
    if (!p) return;
    const sel = state.selected[id] || 3;
    state.modal = { id, vol: sel, qty: 1 };
    $('productMedia').innerHTML = `<img src="${esc(p._image || 'images/placeholder.svg')}" alt="${esc(p.brand + ' ' + p.aroma)}" data-ph>`;
    const pm = $('productMedia').querySelector('img');
    pm.addEventListener('error', () => { pm.src = 'images/placeholder.svg'; }, { once: true });
    $('productCat').textContent = p._cat;
    $('productBrand').textContent = p.brand;
    $('productTitle').textContent = p.aroma;
    $('productPriceMl').textContent = `${fmtNum(p.priceMl)} ₴ за 1 мл · флакон додається`;
    $('productDesc').textContent = p._desc || 'Опис цього аромату скоро зʼявиться.';
    const tg = $('productTg');
    tg.href = p._tg || TG;
    renderModalVols();
    updateModalTotals();
    const d = $('productDialog');
    const sc = d.querySelector('.product-scroll');
    if (sc) sc.scrollTop = 0;
    if (!d.open) d.showModal();
    if (sc) sc.scrollTop = 0;
    document.body.classList.add('locked');
    fitViewport();
    $('closeProduct').focus({ preventScroll: true });
  }

  function renderModalVols() {
    const { id, vol } = state.modal;
    $('modalVols').innerHTML = ALL_VOLS.map((ml) =>
      `<button class="vol${ml === vol ? ' active' : ''}" type="button" data-mvol="${ml}" aria-pressed="${ml === vol}">${ml} мл</button>`
    ).join('');
    $('qtyValue').textContent = state.modal.qty;
    const p = state.products[id];
    $('modalTotal').textContent = money(priceFor(p, vol) * state.modal.qty);
    $('modalAdd').textContent = `Додати в кошик · ${money(priceFor(p, vol) * state.modal.qty)}`;
  }
  function updateModalTotals() {
    const { id, vol, qty } = state.modal;
    const p = state.products[id];
    $('qtyValue').textContent = qty;
    $('modalTotal').textContent = money(priceFor(p, vol) * qty);
    $('modalAdd').textContent = `Додати в кошик · ${money(priceFor(p, vol) * qty)}`;
    $('modalVols').querySelectorAll('[data-mvol]').forEach((b) => {
      const on = Number(b.dataset.mvol) === vol;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function closeDialog(d) {
    if (d.open) d.close();
  }

  /* ---------- cart ---------- */
  function addToCart(p, ml, qty) {
    const key = `${p.art || (p.brand + '|' + p.aroma)}|${ml}`;
    const unit = priceFor(p, ml);
    let item = state.cart.find((x) => x.key === key);
    if (item) {
      item.qty += qty;
      item.unit = unit;
    } else {
      state.cart.push({
        key, brand: p.brand, aroma: p.aroma, ml,
        qty, unit, image: p._image || ''
      });
    }
    saveCart();
    updateCartUI();
    showToast(`${p.brand} ${p.aroma} · ${ml} мл — у кошику`);
  }

  function cartTotal() {
    return state.cart.reduce((sum, x) => sum + (Number(x.unit) || 0) * (Number(x.qty) || 0), 0);
  }
  function cartCount() {
    return state.cart.reduce((sum, x) => sum + (Number(x.qty) || 0), 0);
  }

  function updateCartUI() {
    const count = cartCount();
    const total = cartTotal();
    const badge = $('cartCount');
    const sum = $('cartSum');
    const btn = $('cartBtn');
    badge.textContent = count;
    btn.dataset.empty = count === 0 ? '1' : '0';
    if (count > 0) {
      sum.textContent = money(total);
      sum.hidden = false;
    } else {
      sum.textContent = '';
      sum.hidden = true;
    }
    if ($('cartDialog').open) renderCart();
    const has = state.cart.length > 0;
    $('copyOrder').disabled = !has;
    $('tgOrder').setAttribute('aria-disabled', String(!has));
    $('tgOrder').style.opacity = has ? '' : '.45';
    $('tgOrder').style.pointerEvents = has ? '' : 'none';
    $('viberOrder').style.opacity = has ? '' : '.45';
    $('viberOrder').style.pointerEvents = has ? '' : 'none';
    if (has) {
      $('tgOrder').href = TG + '?text=' + encodeURIComponent(orderText());
    }
  }

  function renderCart() {
    const body = $('cartBody');
    if (!state.cart.length) {
      body.innerHTML = '<div class="cart-empty"><strong>Кошик порожній</strong>Додайте аромат і оберіть обʼєм.</div>';
      $('cartTotal').textContent = money(0);
      return;
    }
    body.innerHTML = state.cart.map((x) => `
      <div class="cart-item" data-key="${esc(x.key)}">
        <div class="cart-thumb"><img src="${esc(x.image || 'images/placeholder.svg')}" alt=""></div>
        <div>
          <div class="cart-name">${esc(x.brand)}</div>
          <div class="cart-aroma">${esc(x.aroma)}</div>
          <div class="cart-meta">${x.ml} мл · ${money(x.unit)}</div>
          <div class="cart-qty">
            <button type="button" data-cart-dec="${esc(x.key)}" aria-label="Зменшити кількість">−</button>
            <span>${x.qty}</span>
            <button type="button" data-cart-inc="${esc(x.key)}" aria-label="Збільшити кількість">+</button>
          </div>
        </div>
        <div>
          <div class="cart-line">${money(x.unit * x.qty)}</div>
          <button class="cart-remove" type="button" data-cart-remove="${esc(x.key)}">прибрати</button>
        </div>
      </div>
    `).join('');
    $('cartTotal').textContent = money(cartTotal());
  }

  function orderText() {
    if (!state.cart.length) return '';
    const lines = state.cart.map((x) =>
      `• ${x.brand} ${x.aroma} — ${x.ml} мл × ${x.qty} = ${money(x.unit * x.qty)}`
    );
    return `Доброго дня! Хочу замовити:\n\n${lines.join('\n')}\n\nРазом: ${money(cartTotal())}`;
  }

  /* ---------- copy / toast ---------- */
  async function copyText(text) {
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  let toastTimer = null;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }

  /* ---------- events ---------- */
  function bind() {
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearSearch.hidden = !searchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = searchInput.value;
        apply(true);
      }, 90);
    });
    clearSearch.addEventListener('click', () => {
      searchInput.value = '';
      clearSearch.hidden = true;
      state.query = '';
      apply(true);
      searchInput.focus();
    });

    cats.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      state.cat = b.dataset.cat;
      renderCats();
      apply(true);
    });

    brandFilter.addEventListener('change', () => { state.brand = brandFilter.value; apply(true); });
    sortFilter.addEventListener('change', () => { state.sort = sortFilter.value; apply(true); });
    moreBtn.addEventListener('click', () => { state.limit += PAGE; renderGrid(); });

    $('resetFilters').addEventListener('click', resetAllFilters);
    $('activeFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-clear]');
      if (!b) return;
      const k = b.dataset.clear;
      if (k === 'query') { searchInput.value = ''; clearSearch.hidden = true; state.query = ''; }
      if (k === 'cat') { state.cat = 'all'; renderCats(); }
      if (k === 'brand') { state.brand = 'all'; brandFilter.value = 'all'; }
      if (k === 'sort') { state.sort = 'curated'; sortFilter.value = 'curated'; }
      apply(true);
    });

    grid.addEventListener('click', (e) => {
      const vol = e.target.closest('[data-vol]');
      if (vol) {
        const id = Number(vol.dataset.for);
        state.selected[id] = Number(vol.dataset.vol);
        updateCardPrice(id);
        return;
      }
      const add = e.target.closest('[data-add]');
      if (add) {
        const p = state.products[Number(add.dataset.add)];
        if (p) addToCart(p, state.selected[p._id] || 3, 1);
        return;
      }
      const open = e.target.closest('[data-open]');
      if (open) {
        openProduct(Number(open.dataset.open));
      }
    });

    $('modalVols').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mvol]');
      if (!b || !state.modal) return;
      state.modal.vol = Number(b.dataset.mvol);
      updateModalTotals();
    });
    $('qtyMinus').addEventListener('click', () => {
      if (!state.modal) return;
      state.modal.qty = Math.max(1, state.modal.qty - 1);
      updateModalTotals();
    });
    $('qtyPlus').addEventListener('click', () => {
      if (!state.modal) return;
      state.modal.qty = Math.min(99, state.modal.qty + 1);
      updateModalTotals();
    });
    $('modalAdd').addEventListener('click', () => {
      if (!state.modal) return;
      const p = state.products[state.modal.id];
      const { vol, qty } = state.modal;
      addToCart(p, vol, qty);
      state.selected[p._id] = vol;
      state.modal = null;
      closeDialog($('productDialog'));
      updateCardPrice(p._id);
    });

    $('closeProduct').addEventListener('click', () => closeDialog($('productDialog')));
    $('closeCart').addEventListener('click', () => closeDialog($('cartDialog')));
    $('cartBtn').addEventListener('click', openCart);
    $('productDialog').addEventListener('click', (e) => { if (e.target === $('productDialog')) closeDialog($('productDialog')); });
    $('cartDialog').addEventListener('click', (e) => { if (e.target === $('cartDialog')) closeDialog($('cartDialog')); });
    $('productDialog').addEventListener('close', () => document.body.classList.remove('locked'));
    $('cartDialog').addEventListener('close', () => document.body.classList.remove('locked'));
    $('productDialog').addEventListener('cancel', () => document.body.classList.remove('locked'));
    $('cartDialog').addEventListener('cancel', () => document.body.classList.remove('locked'));

    $('cartBody').addEventListener('click', (e) => {
      const inc = e.target.closest('[data-cart-inc]');
      const dec = e.target.closest('[data-cart-dec]');
      const rem = e.target.closest('[data-cart-remove]');
      if (inc) {
        const x = state.cart.find((i) => i.key === inc.dataset.cartInc);
        if (x) x.qty = Math.min(99, x.qty + 1);
        saveCart(); updateCartUI();
      } else if (dec) {
        const x = state.cart.find((i) => i.key === dec.dataset.cartDec);
        if (x) x.qty = Math.max(1, x.qty - 1);
        saveCart(); updateCartUI();
      } else if (rem) {
        state.cart = state.cart.filter((i) => i.key !== rem.dataset.cartRemove);
        saveCart(); updateCartUI();
      }
    });

    $('copyOrder').addEventListener('click', async () => {
      const ok = await copyText(orderText());
      showToast(ok ? 'Замовлення скопійовано' : 'Не вдалося скопіювати');
    });
    $('viberOrder').addEventListener('click', async (e) => {
      if (!state.cart.length) { e.preventDefault(); return; }
      await copyText(orderText());
      showToast('Текст скопійовано. Вставте у Viber.');
    });
    $('tgOrder').addEventListener('click', (e) => {
      if (!state.cart.length) { e.preventDefault(); return; }
      if (!reducedMotion) showToast('Відкриваю Telegram…');
    });
  }

  function resetAllFilters() {
    state.query = ''; state.cat = 'all'; state.brand = 'all'; state.sort = 'curated';
    searchInput.value = ''; clearSearch.hidden = true;
    brandFilter.value = 'all'; sortFilter.value = 'curated';
    renderCats(); apply(true);
  }

  /* Висота вікна в пікселях: працює і там, де немає dvh (старі iOS) */
  function fitViewport() {
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const root = document.documentElement;
    root.style.setProperty('--dlg-h', Math.round(vh * 0.94) + 'px');
    root.style.setProperty('--media-h', Math.round(vh * 0.26) + 'px');
  }

  function openCart() {
    fitViewport();
    renderCart();
    const d = $('cartDialog');
    if (!d.open) d.showModal();
    document.body.classList.add('locked');
    $('closeCart').focus({ preventScroll: true });
  }

  function updateUpdated() {
    if (state.demo) { updatedEl.textContent = 'Демо-знімок'; updatedEl.title = 'Підключіть оновлення з CRM'; return; }
    if (!state.updated) { updatedEl.textContent = ''; return; }
    const d = new Date(state.updated);
    if (isNaN(d.getTime())) { updatedEl.textContent = ''; return; }
    updatedEl.textContent = 'Оновлено ' + d.toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  window.addEventListener('resize', fitViewport);
  window.addEventListener('orientationchange', () => setTimeout(fitViewport, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitViewport);
  fitViewport();

  boot();
})();

