#!/usr/bin/env python3
"""Merge parsed doc items (_doc_items.json) with the CRM products into content.json + data.json."""
import json, re, unicodedata
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
XLSX = Path(__file__).resolve().parents[2] / 'CRM-FreshDoze-копия.xlsx'


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).lower()
    s = re.sub(r'[^a-zа-яіїєґ0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    for w in ('парфумована вода', 'туалетна вода', 'парфуми', 'одеколон', 'екстракт',
              'парфюм', 'унісекс', 'чоловічі', 'жіночі', 'чоловіча', 'жіноча',
              'духи', 'женский', 'жіночий', 'чоловічий'):
        s = s.replace(w, ' ')
    s = re.sub(r'\b\d+\s*(мл|ml)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


items = json.loads((ROOT / '_doc_items.json').read_text(encoding='utf-8'))

# ---------- products ----------
wb = load_workbook(XLSX, read_only=True, data_only=True)
ws = wb['Товари']
products, seen = [], set()
for r in list(ws.iter_rows(values_only=True))[1:]:
    brand, aroma = str(r[0] or '').strip(), str(r[1] or '').strip()
    if not brand or not aroma:
        continue
    if re.match(r'^test\b', brand, re.I) or re.match(r'^test\b', aroma, re.I):
        continue
    stock = float(r[2] or 0)
    price = float(r[4] or 0)
    if abs(stock) < 0.001 or price <= 0:
        continue
    key = norm(brand + ' ' + aroma)
    if key in seen:
        continue
    seen.add(key)
    products.append({'art': '', 'brand': brand, 'aroma': aroma,
                     'priceMl': round(price, 2), 'stock': stock})

# ---------- match doc items to products ----------
sheet_index = {}
for i, p in enumerate(products):
    for k in (norm(p['brand'] + ' ' + p['aroma']), norm(p['aroma'])):
        if k:
            sheet_index.setdefault(k, i)

used = {}
unmatched = []
for it in items:
    k = norm(it['docName'])
    idx = sheet_index.get(k)
    if idx is None:
        toks = set(k.split())
        best, score = None, 0.0
        for sk, si in sheet_index.items():
            st = set(sk.split())
            ov = len(toks & st) / max(1, len(toks | st))
            if ov > score:
                best, score = si, ov
        idx = best if score >= 0.6 else None
    if idx is None:
        unmatched.append(it['docName'])
        continue
    if idx in used:
        continue
    used[idx] = it

entries, index = [], {}


def entry_id(it):
    key = json.dumps([it['docName'], it['desc'], it['category'], it['telegram'], it['image']],
                     ensure_ascii=False)
    if key not in index:
        index[key] = len(entries)
        entries.append({'n': it['docName'], 'd': it['desc'], 'c': it['category'],
                        't': it['telegram'], 'i': it['image']})
    return index[key]


by_name = {}
for it in items:
    k = norm(it['docName'])
    if k and k not in by_name:
        by_name[k] = entry_id(it)

by_art = {}
for idx, it in used.items():
    pr = products[idx]
    eid = entry_id(it)
    key = norm(pr['brand'] + ' ' + pr['aroma'])
    by_art[key] = eid
    by_name.setdefault(key, eid)          # products are keyed by brand+aroma
    by_name.setdefault(norm(pr['aroma']), eid)

meta = {
    'docItems': len(items),
    'withImages': sum(1 for x in items if x['image']),
    'products': len(products),
    'matched': len(used),
    'entries': len(entries),
    'sections': dict(Counter(x['category'] for x in items)),
}
(ROOT / 'data.json').write_text(json.dumps({
    'updated': datetime.now(timezone.utc).isoformat(), 'demo': True, 'products': products,
}, ensure_ascii=False, indent=0), encoding='utf-8')
(ROOT / 'content.json').write_text(json.dumps({
    'e': entries, 'byArt': by_art, 'byName': by_name, 'meta': meta,
}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

print(json.dumps(meta, ensure_ascii=False))
print('unmatched doc items:', len(unmatched))
shorts = [p for i, p in enumerate(products) if i not in used]
print('products without content:', len(shorts))
(ROOT / '_unmatched.json').write_text(json.dumps(
    {'docOnly': unmatched, 'sheetOnly': [f"{p['brand']} {p['aroma']}" for p in shorts]},
    ensure_ascii=False, indent=1), encoding='utf-8')
