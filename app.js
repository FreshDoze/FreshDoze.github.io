(() => {
  'use strict';

  const BOTTLES = { 2: 20, 3: 25, 5: 25, 10: 30, 15: 40, 20: 50, 30: 60, 50: 70 };
  const CARD_VOLS = [3, 5, 10];
  const ALL_VOLS = [2, 3, 5, 10, 15, 20, 30, 50];
  const MIN_ML_CHEAP = 3;   // до 70 ₴/мл — від 3 мл
  const MIN_ML_PREMIUM = 2; // від 70 ₴/мл — можна 2 мл
  const PREMIUM_FROM = 70;
  const SHEET_PRICES = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2910MKzvkZPTeRiLeIFrJw05NmJ1puf846KMAPBI58wPRTu7ewF8VtQ6qsu9mDsj9fTT-zf1u4-WE/pub?gid=1010258278&single=true&output=csv';
  const SHEET_CONTENT = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT2910MKzvkZPTeRiLeIFrJw05NmJ1puf846KMAPBI58wPRTu7ewF8VtQ6qsu9mDsj9fTT-zf1u4-WE/pub?gid=311190299&single=true&output=csv';
  const TG = 'https://t.me/AndresBurmachenko';
  const VIBER = 'viber://chat?number=%2B380954117082';
  const PAGE = 24;
  const CART_KEY = 'freshdoze_cart_v1';
  const VIEW_KEY = 'freshdoze_view_v1';

  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const empty = $('empty');
  const moreBtn = $('moreBtn');
  const resultCount = $('resultCount');
  const updatedEl = $('updated');
  const searchInput = $('searchInput');
  const clearSearch = $('clearSearch');
  const brandFilter = $('brandFilter');
  const typeFilter = $('typeFilter');
  const priceFilter = $('priceFilter');
  const sortFilter = $('sortFilter');
  const cats = $('cats');
  const toastEl = $('toast');

  const state = {
    products: [],
    updated: '',
    demo: false,
    live: false,
    query: '',
    cat: 'all',
    type: 'all',
    price: 'all',
    brand: 'all',
    sort: 'brand',
    view: 'grid',
    limit: PAGE,
    selected: {},
    cart: [],
    modal: null,
    filtered: [],
    content: { e: [], byArt: {}, byName: {} }
  };

  const GENDERS = ['Чоловічі', 'Жіночі', 'Унісекс'];
  const CATS = [
    ['all', 'Всі'],
    ['Чоловічі', 'Чоловічі'],
    ['Жіночі', 'Жіночі'],
    ['Унісекс', 'Унісекс']
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
  function minMl(p) {
    return (Number(p.priceMl) || 0) >= PREMIUM_FROM ? MIN_ML_PREMIUM : MIN_ML_CHEAP;
  }
  function allowedVols(p) {
    const min = minMl(p);
    return ALL_VOLS.filter((ml) => ml >= min);
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

  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quote = false;
    text = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else quote = false;
        } else cell += c;
      } else if (c === '"') quote = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    row.push(cell);
    if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }

  const numOf = (v) => {
    const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const keyOf = (b, a) => String(b || '').trim().toLowerCase() + '|' + String(a || '').trim().toLowerCase();

  async function fetchSheet(url) {
    const bust = url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const res = await fetch(bust, { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) return null;
      const text = await res.text();
      if (/^\s*</.test(text)) return null;
      const rows = parseCsv(text);
      return rows.length > 1 ? rows : null;
    } catch (e) {
      return null;
    } finally { clearTimeout(timer); }
  }

  /** Ціни + контент напряму з опублікованих CSV Google (CORS відкритий) */
  async function loadFromSheets(onPartial) {
    const priceP = fetchSheet(SHEET_PRICES);
    const contentP = fetchSheet(SHEET_CONTENT);
    const priceRows = await priceP;
    if (!priceRows) return null;
    let contentRows = null;

    const ph = priceRows[0].map((h) => String(h).toLowerCase().trim());
    const find = (...names) => {
      for (const n of names) { const i = ph.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
      return -1;
    };
    const iB = find('бренд'), iA = find('аромат'), iP = find('олх'), iAv = find('наявн');

    const buildList = (contentRows) => {
      const content = {};
      if (contentRows) {
      const ch = contentRows[0].map((h) => String(h).toLowerCase().trim());
      const cFind = (...names) => {
        for (const n of names) { const i = ch.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
        return -1;
      };
      const cB = cFind('бренд'), cA = cFind('аромат'), cG = cFind('стать'), cT = cFind('тип'),
            cD = cFind('опис'), cL = cFind('telegram'), cP = cFind('фото');
      for (const r of contentRows.slice(1)) {
        const b = String(r[cB] || '').trim();
        const a = String(r[cA] || '').trim();
        if (!b || !a) continue;
        content[keyOf(b, a)] = {
          gender: cG >= 0 ? String(r[cG] || '').trim() : '',
          type: cT >= 0 ? String(r[cT] || '').trim() : '',
          desc: cD >= 0 ? String(r[cD] || '').trim() : '',
          tg: cL >= 0 ? String(r[cL] || '').trim() : '',
          photo: cP >= 0 ? String(r[cP] || '').trim() : ''
        };
      }
    }

      const out = [];
      for (const r of priceRows.slice(1)) {
      const brand = String(r[iB] || '').trim();
      const aroma = String(r[iA] || '').trim();
      if (!brand || !aroma) continue;
      if (iAv >= 0 && !['так', 'yes', 'true', '1'].includes(String(r[iAv] || '').trim().toLowerCase())) continue;
      const priceMl = numOf(r[iP]);
      if (!(priceMl > 0)) continue;
      const c = content[keyOf(brand, aroma)] || {};
        out.push({
          art: '', brand, aroma, priceMl, stock: 1,
          gender: c.gender || '', type: c.type || '', desc: c.desc || '',
          tg: c.tg || '', image: c.photo || ''
        });
      }
      return out;
    };

    // 1) швидко: тільки ціни
    const fast = buildList(null);
    if (fast.length && onPartial) onPartial(fast);
    if (!fast.length) return null;

    // 2) контент — коли прийде
    contentRows = await contentP;
    const withContent = contentRows ? buildList(contentRows) : fast;
    return { products: withContent.length ? withContent : fast, updated: new Date().toISOString(), live: true };
  }

  async function fetchLive() {
    if (!API_URL) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(API_URL + (API_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', signal: ctrl.signal });
      if (!res.ok) return null;
      const raw = await res.json();
      const list = (raw && raw.products) || [];
      return list.length ? raw : null;
    } catch (e) {
      return null;
    } finally { clearTimeout(timer); }
  }

  const CACHE_KEY = 'freshdoze_catalog_v1';
  const CACHE_TTL = 5 * 60 * 1000;

  async function boot() {
    try {
      // миттєвий показ із кешу, поки тягнемо свіже
      let cached = null;
      try {
        const rawCache = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
        if (rawCache && Array.isArray(rawCache.products) && rawCache.products.length) {
          cached = { products: rawCache.products, updated: rawCache.updated || '', live: true };
        }
      } catch (e) {}

      // миттєвий рендер із кешу
      if (cached) {
        setProducts(cached.products);
        state.live = true;
        state.cart = loadCart();
        try { state.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) {}
        prepareUI();
        apply(true);
      }

      let live = null;
      const showPartial = (prods) => {
        try {
          setProducts(prods);
          state.live = true;
          if (!state.uiReady) {
            state.cart = loadCart();
            try { state.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) {}
            prepareUI();
          }
          apply(true);
        } catch (e) {}
      };
      try { live = await loadFromSheets(showPartial); } catch (e) { live = null; }
      if (!live) live = await fetchLive();
      if (!live && cached) live = cached;
      if (live && live.products && live.products.length) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ products: live.products, updated: live.updated || '' })); } catch (e) {}
      }
      const [productsRes, contentRes] = await Promise.all([
        live ? Promise.resolve({ ok: true, json: async () => live }) : fetch('data.json?ts=' + Date.now(), { cache: 'no-store' }),
        fetch('content.json')
      ]);
      if (!productsRes.ok) throw new Error('data.json ' + productsRes.status);
      const raw = await productsRes.json();
      const products = Array.isArray(raw) ? raw : (raw.products || []);
      state.updated = Array.isArray(raw) ? '' : (raw.updated || '');
      state.live = !!live;
      state.demo = !Array.isArray(raw) && raw.demo !== false;
      if (contentRes.ok) {
        try {
          const c = await contentRes.json();
          state.content = { e: c.e || [], byArt: c.byArt || {}, byName: c.byName || {}, meta: c.meta || {} };
        } catch (e) { /* content optional */ }
      }
      setProducts(products);
      state.cart = loadCart();
      try { state.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) {}
      prepareUI();
      apply(true);
      state.ready = true;
      deepLinkProduct();
      state.cart = loadCart();
      try { state.view = localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch (e) {}
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

  function setProducts(products) {
    state.products = (products || [])
      .filter((p) => p && p.brand && p.aroma && Math.abs(Number(p.stock) || 0) >= 0.001 && Number(p.priceMl) > 0)
      .map((p, i) => {
        const c = contentFor(p) || {};
        const clean = { ...p, aroma: cleanAroma(p.brand, p.aroma) };
        const cat = clean.gender || c.category || '';
        const gender = GENDERS.includes(cat) ? cat : (cat ? 'Унісекс' : '');
        const type = clean.type || (cat === 'Нішеві' ? 'Нішеві' : cat === 'Арабські' ? 'Арабські' : 'Люкс');
        return {
          ...clean,
          _id: i,
          _cat: gender,
          _type: type,
          _desc: clean.desc || c.desc || '',
          _tg: safeUrl(clean.tg, safeUrl(c.telegram, TG)),
          _image: clean.image || c.image || '',
          _docName: c.docName || '',
          _search: norm([clean.brand, clean.aroma, c.docName, gender, type].join(' '))
        };
      });
  }

  function renderSkeleton() {
    const sk = $('skeleton');
    if (!sk) return;
    sk.innerHTML = Array.from({ length: 8 }, () => `
      <div class="sk-card">
        <div class="sk-media"></div>
        <div class="sk-line w60"></div>
        <div class="sk-line w80"></div>
        <div class="sk-line w40"></div>
      </div>`).join('');
    sk.hidden = false;
  }

  function hideSkeleton() {
    const sk = $('skeleton');
    if (sk) sk.hidden = true;
  }

  function prepareUI() {
    if (state.uiReady) { buildBrands(); renderCats(); renderGrid(); return; }
    state.uiReady = true;
    renderSkeleton();
    bind();
    buildBrands();
    renderCats();
    updateUpdated();
    updateCartUI();
    if (sortFilter) sortFilter.value = state.sort;
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
    const counts = {};
    state.products.forEach((p) => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
    const brands = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'uk'));
    const cur = state.brand;
    brandFilter.innerHTML = `<option value="all">Усі бренди (${state.products.length})</option>` +
      brands.map((b) => `<option value="${esc(b)}">${esc(b)} (${counts[b]})</option>`).join('');
    if (cur && cur !== 'all' && counts[cur]) brandFilter.value = cur;
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
    if (state.type !== 'all') list = list.filter((p) => p._type === state.type);
    if (state.price !== 'all') {
      const [lo, hi] = state.price.split('-');
      const min = Number(lo) || 0;
      const max = hi === '' ? Infinity : Number(hi);
      list = list.filter((p) => Number(p.priceMl) >= min && Number(p.priceMl) < max);
    }
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
    if (state.cat !== 'all') out.push({ key: 'cat', label: 'Стать', value: state.cat });
    if (state.type !== 'all') out.push({ key: 'type', label: 'Тип', value: state.type });
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

  function applyView() {
    grid.classList.toggle('list', state.view === 'list');
    $('viewGrid').setAttribute('aria-pressed', String(state.view === 'grid'));
    $('viewList').setAttribute('aria-pressed', String(state.view === 'list'));
    try { localStorage.setItem(VIEW_KEY, state.view); } catch (e) {}
  }

  function renderGrid() {
    hideSkeleton();
    const list = state.filtered;
    const slice = list.slice(0, state.limit);
    grid.innerHTML = slice.map(cardHtml).join('');
    empty.hidden = list.length !== 0;
    moreBtn.hidden = list.length <= state.limit;
    applyView();
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
          ${CARD_VOLS.map((ml) => {
          const inCart = state.cart.some((i) => i.brand === p.brand && i.aroma === p.aroma && Number(i.ml) === ml);
          return `<button class="vol${ml === sel ? ' active' : ''}${inCart ? ' incart' : ''}" type="button" data-vol="${ml}" data-for="${p._id}" aria-pressed="${ml === sel}">${ml} мл${inCart ? '<span class="vinc">🛒</span>' : ''}</button>`;
        }).join('')}
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
      const inCart = p && state.cart.some((i) => i.brand === p.brand && i.aroma === p.aroma && Number(i.ml) === Number(b.dataset.vol));
      b.classList.toggle('active', on);
      b.classList.toggle('incart', !!inCart);
      b.setAttribute('aria-pressed', String(on));
      const mark = b.querySelector('.vinc');
      if (inCart && !mark) b.insertAdjacentHTML('beforeend', '<span class="vinc">🛒</span>');
      if (!inCart && mark) mark.remove();
    });
  }

  /* ---------- product modal ---------- */
  function deepLinkProduct() {
    const q = new URLSearchParams(location.search);
    const b = (q.get('b') || '').trim();
    const a = (q.get('a') || '').trim();
    if (b && a) {
      const p = state.products.find((x) =>
        norm(x.brand) === norm(b) && norm(x.aroma) === norm(a));
      if (p) { openProduct(p._id); return true; }
    }
    const pid = Number(q.get('p'));
    if (Number.isFinite(pid) && state.products[pid]) { openProduct(pid); return true; }
    return false;
  }

  function openProduct(id) {
    const p = state.products[id];
    if (!p) return;
    const sel = Math.max(state.selected[id] || 3, minMl(p));
    state.modal = { id, vol: sel };
    try {
      const u = new URL(location.href);
      u.searchParams.set('b', p.brand);
      u.searchParams.set('a', p.aroma);
      history.replaceState(null, '', u);
    } catch (e) {}
    $('productMedia').innerHTML = `<img src="${esc(p._image || 'images/placeholder.svg')}" alt="${esc(p.brand + ' ' + p.aroma)}" data-ph>`;
    const pm = $('productMedia').querySelector('img');
    pm.addEventListener('error', () => { pm.src = 'images/placeholder.svg'; }, { once: true });
    $('productCat').textContent = [p._cat, p._type].filter(Boolean).join(' · ');
    $('productBrand').textContent = p.brand;
    $('productTitle').textContent = p.aroma;
    $('productPriceMl').textContent = `${fmtNum(p.priceMl)} ₴ за 1 мл · атомайзер додається`;
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
    const { id } = state.modal;
    const p = state.products[id];
    const vols = allowedVols(p);
    if (!vols.includes(state.modal.vol)) state.modal.vol = vols[0];
    const vol = state.modal.vol;
    $('modalVols').innerHTML = vols.map((ml) =>
      `<button class="vol${ml === vol ? ' active' : ''}" type="button" data-mvol="${ml}" aria-pressed="${ml === vol}">${ml} мл</button>`
    ).join('');
    $('modalTotal').textContent = money(priceFor(p, vol));
    $('modalAdd').textContent = `Додати в кошик · ${money(priceFor(p, vol))}`;
  }
  function updateModalTotals() {
    const { id, vol } = state.modal;
    const p = state.products[id];
    $('modalTotal').textContent = money(priceFor(p, vol));
    $('modalAdd').textContent = `Додати в кошик · ${money(priceFor(p, vol))}`;
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
  function cartBase(p) {
    return p.art || (p.brand + '|' + p.aroma);
  }
  function productFor(item) {
    return state.products.find((p) => p.brand === item.brand && p.aroma === item.aroma) || null;
  }

  function addToCart(p, ml, qty) {
    if (ml < minMl(p)) ml = minMl(p);
    const base = cartBase(p);
    const key = `${base}|${ml}|${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const unit = priceFor(p, ml);
    state.cart.push({
      key, brand: p.brand, aroma: p.aroma, ml,
      qty: 1, unit, image: p._image || '', base
    });
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
    grid.querySelectorAll('[data-for]').forEach((b) => {
      const pid = Number(b.dataset.for);
      const pr = state.products[pid];
      if (!pr) return;
      const inCart = state.cart.some((i) => i.brand === pr.brand && i.aroma === pr.aroma && Number(i.ml) === Number(b.dataset.vol));
      const mark = b.querySelector('.vinc');
      b.classList.toggle('incart', inCart);
      if (inCart && !mark) b.insertAdjacentHTML('beforeend', '<span class="vinc">🛒</span>');
      if (!inCart && mark) mark.remove();
    });
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
    state.cart.sort((a, b) =>
      String(a.brand).localeCompare(String(b.brand), 'uk') ||
      String(a.aroma).localeCompare(String(b.aroma), 'uk') ||
      (a.ml - b.ml));
    const body = $('cartBody');
    if (!state.cart.length) {
      body.innerHTML = '<div class="cart-empty"><strong>Кошик порожній</strong>Додайте аромат і оберіть обʼєм.</div>';
      $('cartTotal').textContent = money(0);
      return;
    }
    body.innerHTML = state.cart.map((x) => {
      const p = productFor(x);
      const vols = p ? allowedVols(p) : [x.ml];
      const items = vols.map((ml) => {
        const price = p ? priceFor(p, ml) : x.unit;
        return `<button type="button" class="cv-opt${ml === x.ml ? ' on' : ''}" data-vol-pick="${esc(x.key)}" data-ml="${ml}">${ml} мл — ${money(price)}</button>`;
      }).join('');
      const qty = Number(x.qty) || 1;
      return `
      <div class="cart-item" data-key="${esc(x.key)}">
        <div class="cart-thumb"><img src="${esc(x.image || 'images/placeholder.svg')}" alt=""></div>
        <div class="cart-main">
          <div class="cart-name">${esc(x.brand)}</div>
          <div class="cart-aroma">${esc(x.aroma)}</div>
          <div class="cv" data-cv="${esc(x.key)}">
            <button type="button" class="cv-btn" data-vol-open="${esc(x.key)}">
              <span>${x.ml} мл — ${money(x.unit * qty)}</span>
              <span class="cv-ar" aria-hidden="true">▾</span>
            </button>
            <div class="cv-menu" data-vol-menu="${esc(x.key)}" hidden>${items}</div>
          </div>
        </div>
        <div class="cart-side">
          <div class="cart-line">${money(x.unit * qty)}</div>
          <button class="cart-remove" type="button" data-cart-remove="${esc(x.key)}">прибрати</button>
        </div>
      </div>`;
    }).join('');
    body.insertAdjacentHTML('beforeend',
      '<div class="cart-clear-row"><button class="clear-cart-all" id="clearCart" type="button">Очистити кошик</button></div>');
    $('cartTotal').textContent = money(cartTotal());
    const cc = $('clearCart');
    if (cc) cc.addEventListener('click', () => {
      if (!state.cart.length) return;
      if (!window.confirm('Очистити кошик повністю?')) return;
      state.cart = [];
      saveCart(); updateCartUI();
      showToast('Кошик очищено');
    });
  }

  function orderText() {
    if (!state.cart.length) return '';
    const items = state.cart.slice().sort((a, b) =>
      String(a.brand).localeCompare(String(b.brand), 'uk') ||
      String(a.aroma).localeCompare(String(b.aroma), 'uk') || (a.ml - b.ml));

    let totalMl = 0, tara = 0, sum = 0;
    const blocks = items.map((x) => {
      const unit = Number(x.unit) || 0;
      totalMl += Number(x.ml) || 0;
      tara += BOTTLES[x.ml] || 0;
      sum += unit;
      const { name, concentration } = splitConcentration(x.aroma);
      const title = `${x.brand} ${name}`.trim() + (concentration ? ` (${concentration})` : '');
      return `${title}\n${x.ml} мл — ${Math.round(unit)} грн`;
    });

    return blocks.join('\n\n') +
      `\n\nЗагалом у замовленні: ${fmtNum(totalMl)} мл\n` +
      `Тара: ${Math.round(tara)} грн\n` +
      `До сплати: ${Math.round(sum)} грн`;
  }

  /** «Парфумована вода» з назви → окремо */
  function splitConcentration(aroma) {
    const re = /\s*[,(]?\s*(парфумована вода|туалетна вода|парфуми|одеколон|екстракт)\s*\)?\s*$/i;
    const m = String(aroma || '').match(re);
    if (!m) return { name: String(aroma || '').trim(), concentration: '' };
    return {
      name: String(aroma).replace(re, '').trim(),
      concentration: m[1].toLowerCase()
    };
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
  function showToast(text, kind) {
    toastEl.innerHTML = (kind === 'ok'
      ? '<svg class="toast-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.3L19 7"/></svg>'
      : '') + '<span>' + esc(text) + '</span>';
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- events ---------- */
  function bind() {
    if (state.bound) return;
    state.bound = true;
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
    typeFilter.addEventListener('change', () => { state.type = typeFilter.value; apply(true); });
    priceFilter.addEventListener('change', () => { state.price = priceFilter.value; apply(true); });
    sortFilter.addEventListener('change', () => { state.sort = sortFilter.value; apply(true); });
    moreBtn.addEventListener('click', () => { state.limit += PAGE; renderGrid(); });

    $('viewGrid').addEventListener('click', () => { state.view = 'grid'; applyView(); });
    $('viewList').addEventListener('click', () => { state.view = 'list'; applyView(); });
    $('resetFilters').addEventListener('click', resetAllFilters);
    $('activeFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-clear]');
      if (!b) return;
      const k = b.dataset.clear;
      if (k === 'query') { searchInput.value = ''; clearSearch.hidden = true; state.query = ''; }
      if (k === 'cat') { state.cat = 'all'; renderCats(); }
      if (k === 'type') { state.type = 'all'; typeFilter.value = 'all'; }
      if (k === 'price') { state.price = 'all'; priceFilter.value = 'all'; }
      if (k === 'brand') { state.brand = 'all'; brandFilter.value = 'all'; }
      if (k === 'sort') { state.sort = 'brand'; sortFilter.value = 'brand'; }
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
    $('modalAdd').addEventListener('click', () => {
      if (!state.modal) return;
      const p = state.products[state.modal.id];
      const { vol } = state.modal;
      addToCart(p, vol, 1);
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
      if (!e.target.closest('[data-vol-open]') && !e.target.closest('[data-vol-menu]')) {
        $('cartBody').querySelectorAll('[data-vol-menu]').forEach((m) => { m.hidden = true; });
      }
      const rem = e.target.closest('[data-cart-remove]');
      if (rem) {
        state.cart = state.cart.filter((i) => i.key !== rem.dataset.cartRemove);
        saveCart(); updateCartUI();
      }
    });

    $('cartBody').addEventListener('click', (e) => {
      const open = e.target.closest('[data-vol-open]');
      if (open) {
        const key = open.dataset.volOpen;
        const menu = Array.from($('cartBody').querySelectorAll('[data-vol-menu]'))
          .find((m) => m.dataset.volMenu === key);
        const wasHidden = menu && menu.hidden;
        $('cartBody').querySelectorAll('[data-vol-menu]').forEach((m) => { m.hidden = true; });
        if (menu) {
          menu.hidden = !wasHidden;
          if (!menu.hidden && menu.scrollIntoView) menu.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      const pick = e.target.closest('[data-vol-pick]');
      if (pick) {
        const item = state.cart.find((i) => i.key === pick.dataset.volPick);
        if (!item) return;
        const ml = Number(pick.dataset.ml);
        if (!ml) return;
        const p = productFor(item);
        const unit = p ? priceFor(p, ml) : item.unit;
        const base = item.base || item.key.slice(0, item.key.lastIndexOf('|'));
        item.base = base;
        item.ml = ml;
        item.unit = unit;
        item.key = `${base}|${ml}|${Date.now()}`;
        saveCart(); updateCartUI();
      }
    });


    $('copyOrder').addEventListener('click', async () => {
      const ok = await copyText(orderText());
      showToast(ok ? 'Замовлення скопійовано' : 'Не вдалося скопіювати', ok ? 'ok' : '');
    });
    $('viberOrder').addEventListener('click', async (e) => {
      if (!state.cart.length) { e.preventDefault(); return; }
      await copyText(orderText());
      showToast('Текст скопійовано — вставте у Viber', 'ok');
    });
    $('tgOrder').addEventListener('click', (e) => {
      if (!state.cart.length) { e.preventDefault(); return; }
      if (!reducedMotion) showToast('Відкриваю Telegram…');
    });
  }

  function resetAllFilters() {
    state.query = ''; state.cat = 'all'; state.type = 'all'; state.brand = 'all'; state.sort = 'brand';
    searchInput.value = ''; clearSearch.hidden = true;
    brandFilter.value = 'all'; typeFilter.value = 'all'; priceFilter.value = 'all'; state.price = 'all'; sortFilter.value = 'brand';
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
    if (state.live) { updatedEl.textContent = 'Онлайн'; updatedEl.title = 'Дані з таблиці в реальному часі'; return; }
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

