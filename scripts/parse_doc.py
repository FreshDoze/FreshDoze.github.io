#!/usr/bin/env python3
"""Parse the full Google Docs HTML export into structured items + images."""
import base64, io, json, re, sys, unicodedata
from pathlib import Path
from urllib.parse import unquote
from lxml import html
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/freshdoze-full.html')
OUT_JSON = ROOT / 'content.json'
IMG_DIR = ROOT / 'images'

SECTION_MARKERS = [
    ('чоловіча парфумерія', 'Чоловічі'),
    ('жіноча парфумерія', 'Жіночі'),
    ('нішева парфумерія', 'Нішеві'),
    ('арабська парфумерія', 'Арабські'),
]

PRICE_RE = re.compile(r'(\d+(?:[.,]\d+)?)\s*₴')
VOL_LINE_RE = re.compile(r'^\s*\d+\s*мл', re.I)
NOISE_RE = re.compile(
    r'пошук по брендах|до вибору брендів|на головну|ціна флакончиков|'
    r'оригінальний міні|огигінальний міні|дізнатись більше|більше про аромат',
    re.I)


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).lower()
    s = re.sub(r'[^a-zа-яіїєґ0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    for w in ('парфумована вода', 'туалетна вода', 'парфуми', 'одеколон', 'екстракт',
              'парфюм', 'унісекс', 'чоловічі', 'жіночі', 'чоловіча', 'жіноча',
              'духи', 'женский', 'жіночий', 'чоловічий'):
        s = s.replace(w, ' ')
    s = re.sub(r'\b\d+\s*(мл|ml)\b', ' ', s)
    s = re.sub(r'(\d)([a-z])', r'\1 \2', s)
    return re.sub(r'\s+', ' ', s).strip()


def real_url(href):
    """Unwrap Google's redirect: https://www.google.com/url?q=<real>&sa=..."""
    if not href:
        return ''
    m = re.search(r'[?&]q=([^&]+)', href)
    if m:
        return unquote(m.group(1))
    return href if href.startswith('http') else ''


def main():
    raw = SRC.read_bytes()
    doc = html.document_fromstring(raw)
    body = doc.xpath('//body')[0]

    blocks, cur = [], []
    for el in body.iterchildren():
        if el.tag == 'hr':
            if cur:
                blocks.append(cur)
                cur = []
        else:
            cur.append(el)
    if cur:
        blocks.append(cur)

    IMG_DIR.mkdir(exist_ok=True)
    for old in IMG_DIR.glob('doc-*.jpg'):
        old.unlink()

    items, cat, img_n = [], '', 0
    seen = set()

    for block in blocks:
        texts = []
        for el in block:
            for line in el.text_content().split('\n'):
                line = ' '.join(line.split())
                if line:
                    texts.append(line)

        joined = ' '.join(texts)
        low = joined.lower()
        # section header block: contains exactly one section marker + "пошук по брендах"
        if 'пошук по брендах' in low or low.count('парфумерія') == 1:
            hits = [name for marker, name in SECTION_MARKERS if marker in low]
            if len(hits) == 1:
                cat = hits[0]

        # item name = first text line containing a price
        name, price = '', None
        for line in texts:
            m = PRICE_RE.search(line)
            if not m:
                continue
            candidate = line[:m.start()].strip(' —–\t✅🔥+:;,')
            candidate = re.sub(r'\s*(NEW!?|Новинка\s*\d*р?)\s*$', '', candidate, flags=re.I).strip()
            if VOL_LINE_RE.match(line) or NOISE_RE.search(candidate):
                continue
            if not re.search(r'[A-Za-zА-Яа-яІіЇїЄєґ]', candidate):
                continue
            name = candidate
            price = float(m.group(1).replace(',', '.'))
            break
        if not name:
            continue

        # description: text lines after the name, minus noise/volume/links
        desc = []
        started = False
        for line in texts:
            if not started:
                if line.startswith(name[:20]) or PRICE_RE.search(line):
                    started = True
                continue
            if PRICE_RE.search(line):
                continue
            if VOL_LINE_RE.match(line):
                continue
            if NOISE_RE.search(line):
                continue
            if line.startswith('http'):
                continue
            if line in ('✅', '+', '—', '-'):
                continue
            if len(line) < 25:
                continue
            desc.append(line)

        links = []
        for el in block:
            for a in el.xpath('.//a'):
                u = real_url(a.get('href', ''))
                if u:
                    links.append(u)
        tg_post = next((u for u in links if re.search(r'(t\.me|telegram\.me)/[^/]+/\d+', u)), '')
        tg_any = next((u for u in links if 't.me' in u or 'telegram.me' in u), '')
        telegra = next((u for u in links if 'telegra.ph' in u), '')
        telegram = tg_post or telegra or tg_any or ''

        image = ''
        imgs = [i.get('src', '') for el in block for i in el.xpath('.//img')]
        imgs = [s for s in imgs if s.startswith('data:image/')]
        if imgs:
            try:
                data = base64.b64decode(imgs[0].split(',', 1)[1])
                im = Image.open(io.BytesIO(data)).convert('RGB')
                im.thumbnail((640, 640))
                fn = f'doc-{len(items):03d}.jpg'
                im.save(IMG_DIR / fn, 'JPEG', quality=82, optimize=True)
                image = 'images/' + fn
                img_n += 1
            except Exception:
                pass

        key = (norm(name), round(price, 2))
        if key in seen:
            continue
        seen.add(key)

        items.append({
            'docName': name.strip(),
            'desc': ' '.join(desc)[:900],
            'category': cat or 'Чоловічі',
            'telegram': telegram,
            'image': image,
            'priceDoc': price,
        })

    print(json.dumps({
        'items': len(items),
        'images': img_n,
        'postLinks': sum(1 for x in items if re.search(r'/\d+$', x['telegram'])),
        'telegra': sum(1 for x in items if 'telegra.ph' in x['telegram']),
        'noLink': sum(1 for x in items if not x['telegram']),
        'sections': {c: sum(1 for x in items if x['category'] == c) for _, c in SECTION_MARKERS},
    }, ensure_ascii=False))

    (ROOT / '_doc_items.json').write_text(
        json.dumps(items, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
