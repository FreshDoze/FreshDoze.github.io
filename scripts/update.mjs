#!/usr/bin/env node
/**
 * GitHub Action: published Google Sheet CSVs -> data.json
 *   SHEET_CSV_URL          — ціни (Бренд, Аромат, Ціна ОЛХ, Наявність)
 *   SHEET_CONTENT_CSV_URL  — контент (Бренд, Аромат, Стать, Тип, Опис, Telegram)
 */
import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const PRICE_URL = (process.env.SHEET_CSV_URL || '').trim();
const CONTENT_URL = (process.env.SHEET_CONTENT_CSV_URL || '').trim();

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quote = false;
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

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const headerIndex = (headers, ...needles) => {
  for (const n of needles) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
};

async function fetchCsv(url, label) {
  const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
  const text = await res.text();
  if (/^\s*</.test(text)) throw new Error(`${label}: отримано HTML замість CSV — перевір публікацію аркуша`);
  return parseCsv(text);
}

if (!PRICE_URL) {
  console.log('SHEET_CSV_URL порожній — пропускаю.');
  process.exit(0);
}

/* ---------- ціни ---------- */
const priceRows = await fetchCsv(PRICE_URL, 'Ціни');
const ph = priceRows[0].map((h) => String(h).toLowerCase().trim());
const iBrand = headerIndex(ph, 'бренд', 'brand');
const iAroma = headerIndex(ph, 'аромат', 'aroma');
const iPrice = headerIndex(ph, 'олх', 'price');
const iAvail = headerIndex(ph, 'наявність', 'наявн', 'available');
const iStock = headerIndex(ph, 'залишок', 'остаток', 'stock');
if (iBrand < 0 || iAroma < 0 || iPrice < 0) {
  throw new Error('Заголовки CSV не знайдено. Треба: Бренд, Аромат, Ціна ОЛХ, Наявність. Є: ' + ph.join(' | '));
}

const products = [];
const seen = new Set();
for (const r of priceRows.slice(1)) {
  const brand = String(r[iBrand] ?? '').trim();
  const aroma = String(r[iAroma] ?? '').trim();
  const price = num(r[iPrice]);
  if (!brand || !aroma || !(price > 0)) continue;
  if (/^test\b/i.test(brand) || /^test\b/i.test(aroma)) continue;
  if (iAvail >= 0) {
    const a = String(r[iAvail] ?? '').trim().toLowerCase();
    if (!['так', 'yes', 'true', '1'].includes(a)) continue;
  } else if (iStock >= 0 && Math.abs(num(r[iStock])) < 0.001) continue;
  const key = norm(brand + '|' + aroma);
  if (seen.has(key)) continue;
  seen.add(key);
  products.push({ art: '', brand, aroma, priceMl: Math.round(price * 100) / 100, stock: 1 });
}

if (!products.length) throw new Error('Жодної позиції в CSV — data.json не перезаписую.');

/* ---------- контент ---------- */
let contentMap = {};
if (CONTENT_URL) {
  try {
    const rows = await fetchCsv(CONTENT_URL, 'Контент');
    const h = rows[0].map((x) => String(x).toLowerCase().trim());
    const cB = headerIndex(h, 'бренд', 'brand');
    const cA = headerIndex(h, 'аромат', 'aroma');
    const cG = headerIndex(h, 'стать', 'gender');
    const cT = headerIndex(h, 'тип', 'type');
    const cD = headerIndex(h, 'опис', 'описание', 'description');
    const cL = headerIndex(h, 'telegram', 'посилання', 'link');
    const cP = headerIndex(h, 'фото', 'photo', 'image');
    for (const r of rows.slice(1)) {
      const b = String(r[cB] ?? '').trim();
      const a = String(r[cA] ?? '').trim();
      if (!b || !a) continue;
      contentMap[norm(b + '|' + a)] = {
        gender: cG >= 0 ? String(r[cG] ?? '').trim() : '',
        type: cT >= 0 ? String(r[cT] ?? '').trim() : '',
        desc: cD >= 0 ? String(r[cD] ?? '').trim() : '',
        tg: cL >= 0 ? String(r[cL] ?? '').trim() : '',
        photo: cP >= 0 ? String(r[cP] ?? '').trim() : '',
      };
    }
    console.log(`Контент: ${Object.keys(contentMap).length} рядків.`);
  } catch (e) {
    console.log('Контент не завантажено: ' + e.message);
  }
}

for (const p of products) {
  const c = contentMap[norm(p.brand + '|' + p.aroma)] || {};
  p.gender = c.gender || '';
  p.type = c.type || '';
  if (c.desc) p.desc = c.desc;
  if (c.tg) p.tg = c.tg;
  if (c.photo) p.photo = c.photo;
}

/* ---------- фотографії з таблиці ---------- */
await mkdir('images', { recursive: true });
let photoOk = 0, photoFail = 0;
const photoCache = new Map();
for (const p of products) {
  const url = String(p.photo || '').trim();
  if (!/^https?:\/\//i.test(url)) { delete p.photo; continue; }
  if (photoCache.has(url)) { p.image = photoCache.get(url); delete p.photo; continue; }
  try {
    const hash = createHash('sha1').update(url).digest('hex').slice(0, 12);
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 FreshdozeBot' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const type = String(res.headers.get('content-type') || '');
    if (!/^image\//i.test(type)) throw new Error('not an image: ' + type);
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
    const file = `images/sheet-${hash}.${ext}`;
    try { await access(file); }
    catch (e) { await writeFile(file, Buffer.from(await res.arrayBuffer())); }
    p.image = file;
    photoCache.set(url, file);
    photoOk++;
  } catch (e) {
    console.log(`Фото не завантажено (${p.brand} ${p.aroma}): ${e.message}`);
    photoFail++;
  }
  delete p.photo;
}
if (photoOk || photoFail) console.log(`Фото: ${photoOk} ок, ${photoFail} помилок.`);

/* ---------- запис ---------- */
products.sort((a, b) => a.brand.localeCompare(b.brand, 'uk') || a.aroma.localeCompare(b.aroma, 'uk'));
const next = JSON.stringify(products);
const current = await readFile('data.json', 'utf8').catch(() => '');
let prev = '';
try { prev = JSON.stringify(JSON.parse(current).products || []); } catch (e) {}

if (current && prev === next) {
  console.log('Змін немає — data.json не чіпаю.');
  process.exit(0);
}

await writeFile('data.json', JSON.stringify({
  updated: new Date().toISOString(), demo: false, source: 'google-sheets', products,
}, null, 0) + '\n', 'utf8');
console.log(`Оновлено ${products.length} позицій.`);
