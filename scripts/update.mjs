#!/usr/bin/env node
/**
 * GitHub Action: published Google Sheet CSV -> data.json
 * Required repo variable: SHEET_CSV_URL
 */
import { writeFile, readFile } from 'node:fs/promises';

const url = (process.env.SHEET_CSV_URL || '').trim();
if (!url) {
  console.log('SHEET_CSV_URL is empty — skip. Add it in Settings → Secrets and variables → Actions → Variables.');
  process.exit(0);
}

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
    } else if (c === '"') {
      quote = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (c !== '\r') {
      cell += c;
    }
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

const normHeader = (s) => String(s || '')
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const num = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
const text = await res.text();
if (/^\s*</.test(text)) throw new Error('Google returned HTML instead of CSV — check that the tab is published to the web as CSV.');

const rows = parseCsv(text);
if (rows.length < 2) throw new Error('CSV is empty.');

const headers = rows[0].map(normHeader);
const find = (...needles) => {
  for (const n of needles) {
    const i = headers.findIndex((h) => h.includes(n));
    if (i >= 0) return i;
  }
  return -1;
};

const iBrand = find('бренд', 'brand');
const iAroma = find('аромат', 'aroma');
const iPrice = find('олх', 'price');
const iArt = find('артикул', 'article', 'art');
const iStock = find('залишок', 'остаток', 'stock');
const iAvail = find('наявність', 'наявн', 'availability', 'available');

if (iBrand < 0 || iAroma < 0 || iPrice < 0) {
  throw new Error('CSV headers not found. Need: Бренд, Аромат, Ціна ОЛХ, Наявність. Headers: ' + headers.join(' | '));
}

const products = [], seen = new Set();
for (const r of rows.slice(1)) {
  const brand = String(r[iBrand] ?? '').trim();
  const aroma = String(r[iAroma] ?? '').trim();
  const price = num(r[iPrice]);
  const stock = iStock >= 0 ? num(r[iStock]) : 1;
  if (!brand || !aroma || !(price > 0)) continue;
  if (/^test\b/i.test(brand) || /^test\b/i.test(aroma)) continue;
  if (iAvail >= 0) {
    const a = String(r[iAvail] ?? '').trim().toLowerCase();
    if (a !== 'так' && a !== 'yes' && a !== 'true' && a !== '1') continue;
  } else if (iStock >= 0 && Math.abs(stock) < 0.001) {
    continue;
  }
  const art = iArt >= 0 ? String(r[iArt] ?? '').trim() : '';
  const key = art || (brand + '|' + aroma);
  if (seen.has(key)) continue;
  seen.add(key);
  products.push({ art, brand, aroma, priceMl: Math.round(price * 100) / 100, stock: 1 });
}

if (!products.length) throw new Error('No valid products in CSV — refusing to overwrite data.json.');

const current = await readFile('data.json', 'utf8').catch(() => '');
let old = '';
try { old = JSON.stringify(JSON.parse(current).products || []); } catch (e) {}
const nextProducts = JSON.stringify(products);
if (old === nextProducts && current) {
  console.log('No product changes; data.json untouched.');
  process.exit(0);
}

products.sort((a, b) => a.brand.localeCompare(b.brand, 'uk') || a.aroma.localeCompare(b.aroma, 'uk'));
const out = {
  updated: new Date().toISOString(),
  demo: false,
  source: 'google-sheets',
  products
};
await writeFile('data.json', JSON.stringify(out, null, 0) + '\n', 'utf8');
console.log(`Updated ${products.length} products.`);
