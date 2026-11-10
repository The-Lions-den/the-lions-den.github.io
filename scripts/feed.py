#!/usr/bin/env python3
"""Lions Den league feed.

Reads the Central Skittle League website and writes feed.json for the app:
  - the Division 2 league table (from the league's published Google Sheet)
  - the pictures posted on the cup pages (to spot new cup draws)
  - a fingerprint of the Lions fixtures PDF (to spot changes)
Run by the GitHub job every few hours. Usage: feed.py OUTPUT.json [PREVIOUS.json]
Each season: check the addresses in CONFIG still match the league website.
"""
import csv, hashlib, html, io, json, os, re, sys, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone

# ---------------- CONFIG ----------------
SITE = os.environ.get('LH_SITE', 'https://centralskittleleague.co.uk')
TABLE_PAGE = '/428938392/'   # Division 2 "League Table and Results" page (holds the Google Sheet link)
TABLE_SHEET_FALLBACK = os.environ.get('LH_SHEET', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ9AHOUyQBdRDz60Ev9ky71R1EDx_9UWesAccHwhdKLodBGpSJ4Fm2belNMMdf7OG_xwOQ3GJFH-DlK/pubhtml?gid=1111662164&single=true')
CUP_PAGES = [  # key, name shown in the app, page address
    ('fp', 'Front Pin Cup (Div 2)', '/428938392/428938381'),
    ('ko', 'Knock Out Cup (Div 2)', '/428938392/428937908'),
    ('gd', 'George Davis Cup', '/428938455/428938473'),
    ('cs', 'Chairmans Shield', '/428938455/428938412'),
    ('gdt', 'George Davis Tournament', '/428938455/george-davis-tournament'),
]
FIXTURES_PAGE = '/428938704/429541040'   # Division 2 fixture lists page
FIXTURES_PDF = '/onewebmedia/LIONS.pdf'  # the Lions fixtures PDF
# ----------------------------------------

UA = 'LionsDen/2.0 (skittles team app; checks every 6 hours, only downloads what changed)'

def grab_cond(url, etag=None, lastmod=None):
    """Download only if changed. Returns ('new', body, etag, lastmod), ('same', None, ...) or ('fail', None, ...)."""
    h = {'User-Agent': UA}
    if etag: h['If-None-Match'] = etag
    if lastmod: h['If-Modified-Since'] = lastmod
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=25) as r:
            return 'new', r.read(), r.headers.get('ETag'), r.headers.get('Last-Modified')
    except urllib.error.HTTPError as e:
        if e.code == 304:
            return 'same', None, etag, lastmod
        print('  could not read', url, '-', e)
    except Exception as e:
        print('  could not read', url, '-', e)
    return 'fail', None, None, None

def grab(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=25) as r:
            if 200 <= r.status < 400:
                return r.read()
    except Exception as e:
        print('  could not read', url, '-', e)
    return None


# ---------------- reading the cup draw pictures ----------------
import difflib, shutil, subprocess, tempfile
MONTHS = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}
ROUND_RE = re.compile(r'(ROUND\s*\d+|\bR\s*\d+\b|QUARTER[\s-]*FINALS?|SEMI[\s-]*FINALS?|FINALS?|PRELIM\w*|TOURNAMENT\s*\d*)', re.I)
DATE_RE = re.compile(r'(\d{1,2})\s*(?:ST|ND|RD|TH)?\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*', re.I)

def season_date(day, mon):
    now = datetime.now(timezone.utc)
    start = now.year if now.month >= 8 else now.year - 1
    year = start if mon >= 8 else start + 1
    try:
        return '%04d-%02d-%02d' % (year, mon, int(day))
    except Exception:
        return None

def _tess(path, psm):
    r = subprocess.run(['tesseract', path, 'stdout', '--psm', str(psm), 'tsv'], capture_output=True, text=True)
    words = []
    for row in r.stdout.splitlines()[1:]:
        c = row.split('\t')
        if len(c) < 12 or not c[11].strip():
            continue
        try:
            if float(c[10]) < 0:
                continue
        except ValueError:
            continue
        words.append((int(c[6]), c[11].strip()))
    return sorted(words)

def ocr_words(img):
    """Read a spreadsheet-style picture row by row.
    Rubs out the table's grid lines, finds each text row, and reads it on its own.
    Returns rows as lists of (column number, x, text) for parse_draw."""
    if not shutil.which('tesseract'):
        return None
    try:
        from PIL import Image, ImageOps
    except ImportError:
        return None
    im = Image.open(io.BytesIO(img)).convert('L')
    w, h = im.size
    px = im.load()
    def runs(flags):
        out, start = [], None
        for i, f in enumerate(flags + [False]):
            if f and start is None:
                start = i
            elif not f and start is not None:
                out.append((start, i)); start = None
        return out
    # grid lines: thin rows/columns clearly darker than the pixels just either side (coloured header bands are even, so they don't count)
    rmean = [sum(px[x, y] for x in range(0, w, 2)) / (w / 2) for y in range(h)]
    cmean = [sum(px[x, y] for y in range(0, h, 2)) / (h / 2) for x in range(w)]
    def lines(mean, n):
        out = []
        for i in range(n):
            nb = [mean[j] for j in (i - 3, i - 2, i + 2, i + 3) if 0 <= j < n]
            if nb and mean[i] < min(nb) - 10:
                out.append(i)
        return out
    rfull = [sum(1 for x in range(0, w, 2) if px[x, y] < 235) / (w / 2) for y in range(h)]
    cfull = [sum(1 for y in range(0, h, 2) if px[x, y] < 235) / (h / 2) for x in range(w)]
    hl = [y for y in lines(rmean, h) if rfull[y] > 0.85]
    vl = [x for x in lines(cmean, w) if cfull[x] > 0.85]
    vr = runs([x in set(vl) for x in range(w)])
    clean = im.copy()
    cp = clean.load()
    for y in hl:
        for x in range(w):
            cp[x, y] = 255
    for x in vl:
        for y in range(h):
            cp[x, y] = 255
    clean = clean.point(lambda v: 0 if v < 150 else 255)
    cpx = clean.load()
    textf = [any(cpx[x, y] == 0 for x in range(0, w)) for y in range(h)]
    bands = [(max(0, a0 - 2), min(h, b0 + 2)) for a0, b0 in runs(textf) if b0 - a0 >= 5]
    edges = [(a0 + b0) / 2 for a0, b0 in vr]
    out = []
    with tempfile.TemporaryDirectory() as d:
        for i, (y0, y1) in enumerate(bands):
            strip = clean.crop((0, y0, w, y1))
            strip = ImageOps.expand(strip.resize((w * 3, (y1 - y0) * 3)), border=20, fill=255)
            path = os.path.join(d, 'r%d.png' % i)
            strip.save(path)
            words = [((x - 20) / 3, t) for x, t in _tess(path, 7)]
            if not words:
                continue
            row, col, last = [], 0, None
            for x, t in words:
                if len(edges) >= 3:
                    col = sum(1 for e in edges if e < x)
                elif last is not None and x - last > 40:
                    col += 1
                last = x + 7 * len(t)
                row.append((col, x, t))
            out.append(row)
    return out

def best_team(name, teams):
    name = re.sub(r'[^A-Za-z0-9&\' ]', ' ', name).strip()
    if not name:
        return ''
    if not teams:
        return name
    low = {t.lower(): t for t in teams}
    m = difflib.get_close_matches(name.lower(), list(low), n=1, cutoff=0.72)
    return low[m[0]] if m else name

def is_lions(name):
    return difflib.SequenceMatcher(None, re.sub(r'[^a-z]', '', name.lower()), 'lions').ratio() >= 0.8

def parse_draw(lines, teams):
    """lines: rows of (column, x, word) from ocr_words. Returns sections with fixtures and byes."""
    secs, cur = [], None
    for ln in lines:
        text = ' '.join(t for _, _, t in ln)
        up = text.upper()
        rm = ROUND_RE.search(up)
        vi = next((i for i, (c, x, t) in enumerate(ln) if re.fullmatch(r'[vV][vVsSoOyY]?\.?|[yY]', t)), None)
        if rm and vi is None:
            dm = DATE_RE.search(up)
            rd = re.sub(r'\s+', ' ', rm.group(1)).title()
            rd = re.sub(r'(?i)^(?:round|r)\s*(\d+)$', r'Round \1', rd.strip())
            rd = re.sub(r'(?i)quarter\s*-?\s*final', 'Quarter Final', rd)
            rd = re.sub(r'(?i)semi\s*-?\s*final', 'Semi Final', rd)
            cur = {'round': rd, 'date': season_date(dm.group(1), MONTHS[dm.group(2).upper()[:3]]) if dm else None, 'rows': [], 'byes': []}
            secs.append(cur)
            continue
        if cur is None:
            continue
        if re.match(r'^\W*[B3]YE', up):
            rest = re.sub(r'^\W*[B3]YE[\'’S]*\s*[-:–]?\s*', '', text, flags=re.I)
            cur['byes'] += [best_team(n, teams) for n in re.split(r'[,&]| and ', rest) if n.strip()]
            continue
        if vi is None:
            continue
        vcol = ln[vi][0]
        home_col = min(c for c, _, _ in ln[:vi]) if vi else None
        home = ' '.join(t for c, _, t in ln[:vi] if c == home_col) if home_col is not None else ''
        right = ln[vi + 1:]
        away_col = min((c for c, _, _ in right), default=None)
        away = ' '.join(t for c, _, t in right if c == away_col)
        last_col = max((c for c, _, _ in right), default=None)
        venue = ' '.join(t for c, _, t in right if c == last_col) if last_col is not None and last_col != away_col else ''
        if re.fullmatch(r'[\d+ ]*', venue or '') or venue.strip(' |[]“"\'').upper() in ('TBC', 'TBA', 'BC', 'TB'):
            venue = ''
        cur['rows'].append({'home': best_team(home, teams), 'away': best_team(away, teams), 'venue': venue.strip(' |[]')})
    return secs

def lions_draws(key, img_file, secs):
    out = []
    for sc in secs:
        for r in sc['rows']:
            if is_lions(r['home']) or is_lions(r['away']):
                home = is_lions(r['home'])
                out.append({'cup': key, 'round': sc['round'], 'date': sc['date'], 'home': home, 'opp': r['away'] if home else r['home'], 'venue': r['venue'], 'bye': False, 'file': img_file})
        if any(is_lions(b) for b in sc['byes']):
            out.append({'cup': key, 'round': sc['round'], 'date': sc['date'], 'home': True, 'opp': '', 'venue': '', 'bye': True, 'file': img_file})
    return out

def table_positions(rows):
    """League positions from the table sheet: {'asOf': text, 'pos': {team: position}}."""
    as_of, pi, ni, pos = '', -1, -1, {}
    for row in rows:
        low = [c.strip().lower() for c in row]
        for c in row:
            m = re.search(r'as of\s*(.+)', c, re.I)
            if m and not as_of:
                as_of = m.group(1).strip()
        if pi < 0 and 'pos' in low and ('name' in low or 'team' in low):
            pi = low.index('pos'); ni = low.index('name') if 'name' in low else low.index('team')
            continue
        if pi >= 0 and len(row) > max(pi, ni):
            p, n = row[pi].strip(), row[ni].strip()
            if p.isdigit() and n and 'vacant' not in n.lower() and n not in pos:
                pos[n] = int(p)
    return {'asOf': as_of, 'pos': pos} if as_of and pos else None

def main(out_path, prev_path=None):
    out = {'ok': True, 'at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00'), 'errors': []}
    prev = {}
    if prev_path and os.path.exists(prev_path):
        try:
            prev = json.load(open(prev_path, encoding='utf-8'))
        except Exception:
            prev = {}
    prev_cups = {c.get('key'): c for c in prev.get('cups', [])}
    prev_draws = prev.get('draws', [])

    # ---- league table ----
    sheet = TABLE_SHEET_FALLBACK
    page = grab(SITE + TABLE_PAGE)
    if page:
        m = re.search(r'https://docs\.google\.com/spreadsheets/d/e/[A-Za-z0-9_-]+/pubhtml[^"\'<\s]*', page.decode('utf-8', 'replace'))
        if m:
            sheet = html.unescape(m.group(0))
    csv_url = sheet.replace('/pubhtml', '/pub')
    csv_url += ('&' if '?' in csv_url else '?') + 'output=csv'
    data = grab(csv_url)
    if data:
        text = data.decode('utf-8-sig', 'replace')
        rows = [[c.strip() for c in row] for row in csv.reader(io.StringIO(text))]
        out['table'] = {'source': sheet, 'rows': rows}
    else:
        out['errors'].append('Could not read the league table sheet')

    # ---- cup pages: pictures posted (draws) ----
    imgs, count = {}, {}
    pat = re.compile(r'(?:https?://[^"\'\s<>]*)?/onewebmedia/([^"\'\s<>?]+\.(?:jpe?g|png|gif|webp))[^"\'\s<>]*', re.I)
    for key, name, path in CUP_PAGES:
        found = {}
        page = grab(SITE + path)
        if page:
            for mm in pat.finditer(page.decode('utf-8', 'replace')):
                f = urllib.parse.unquote(mm.group(1))
                if f in found:
                    continue
                url = html.unescape(mm.group(0))
                if not url.startswith('http'):
                    url = SITE + url
                url = re.sub(r'([&?])resize=[^&]*&?', r'\1', url)
                url = re.sub(r'([&?])ignoreAspectRatio&?', r'\1', url)
                found[f] = url
        else:
            out['errors'].append('Could not read ' + name)
            # league site unreachable: keep the pictures we knew about last time
            for im in (prev_cups.get(key) or {}).get('images', []):
                found[im['file']] = im['url']
        for f in found:
            count[f] = count.get(f, 0) + 1
        imgs[key] = found
    out['cups'] = [{'key': k, 'name': n, 'page': SITE + p,
                    'images': [{'file': f, 'url': u} for f, u in imgs[k].items() if count[f] == 1]}  # logos on every page aren't draws
                   for k, n, p in CUP_PAGES]

    # read the draw pictures (team names checked against the league table)
    teams = []
    for row in (out.get('table') or {}).get('rows', []):
        if len(row) > 2 and row[0].strip().isdigit() and row[1].strip() and 'vacant' not in row[1].lower():
            teams.append(row[1].strip())
    draws, reused, readnow = [], 0, 0
    for c in out['cups']:
        old_imgs = {i['file']: i for i in (prev_cups.get(c['key']) or {}).get('images', [])}
        for im in c['images']:
            old = old_imgs.get(im['file'])
            if old and old.get('url') == im['url'] and 'read' in old:
                # same picture as last time (the address carries its version): reuse what we read before
                im['read'] = old['read']
                if 'rounds' in old: im['rounds'] = old['rounds']
                draws += [d for d in prev_draws if d.get('cup') == c['key'] and d.get('file') == im['file']]
                reused += 1
                continue
            readnow += 1
            img = grab(im['url'])
            lines = ocr_words(img) if img else None
            if lines is None:
                im['read'] = False
                continue
            secs = parse_draw(lines, teams)
            im['read'] = bool(secs)
            im['rounds'] = [s['round'] + (' ' + s['date'] if s['date'] else '') for s in secs]
            draws += lions_draws(c['key'], im['file'], secs)
    out['draws'] = draws
    print('draw pictures: %d read now, %d unchanged (reused)' % (readnow, reused))
    print('cup draws read:', [(d['cup'], d['round'], d['date'], 'bye' if d['bye'] else d['opp']) for d in draws])

    # ---- fixtures PDF fingerprint ----
    pf = prev.get('fixtures') or {}
    st, pdf, et, lm = grab_cond(SITE + FIXTURES_PDF, pf.get('etag'), pf.get('lastmod'))
    if st == 'new' and pdf:
        out['fixtures'] = {'url': SITE + FIXTURES_PDF, 'page': SITE + FIXTURES_PAGE, 'hash': hashlib.md5(pdf).hexdigest(), 'bytes': len(pdf), 'etag': et, 'lastmod': lm}
    elif pf.get('hash'):
        out['fixtures'] = pf   # unchanged (or site down): keep last time's fingerprint
        print('fixtures PDF:', 'unchanged' if st == 'same' else 'not reachable, kept last check')
        if st == 'fail':
            out['errors'].append('Could not read the fixtures PDF')
    else:
        out['errors'].append('Could not read the fixtures PDF')

    # ---- our own position changes (+/-) since the last "As of" table ----
    cur = table_positions((out.get('table') or {}).get('rows', []))
    if cur:
        pc = prev.get('posCur')
        base = pc if (pc and pc.get('asOf') != cur['asOf']) else prev.get('posBase')
        out['posCur'] = cur
        if base:
            out['posBase'] = base
            out['move'] = {n: base['pos'][n] - p for n, p in cur['pos'].items() if n in base['pos']}
        print('positions as of', cur['asOf'], '- changes:', out.get('move', 'no earlier table yet'))

    # league site down: keep the last good copy, marked stale
    if 'table' not in out and prev_path and os.path.exists(prev_path):
        try:
            old = json.load(open(prev_path, encoding='utf-8'))
            if old.get('table'):
                old['stale'] = True
                old['errors'] = out['errors']
                out = old
        except Exception:
            pass
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print('feed.json written:', 'table' in out, len(out.get('errors', [])), 'problems', out.get('errors'))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
