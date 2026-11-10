#!/usr/bin/env python3
"""Lions Den league feed.

Reads the Central Skittle League website and writes feed.json for the app:
  - the Division 2 league table (from the league's published Google Sheet)
  - the pictures posted on the cup pages (to spot new cup draws)
  - a fingerprint of the Lions fixtures PDF (to spot changes)
Run by the GitHub job every few hours. Usage: feed.py OUTPUT.json [PREVIOUS.json]
Each season: check the addresses in CONFIG still match the league website.
"""
import csv, hashlib, html, io, json, os, re, sys, urllib.parse, urllib.request
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

UA = 'LionsDen/2.0 (skittles team app; checks every few hours)'

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
ROUND_RE = re.compile(r'(ROUND\s*\d+|R\s*\d+\b|QUARTER[\s-]*FINALS?|SEMI[\s-]*FINALS?|FINALS?|PRELIM\w*|TOURNAMENT\s*\d*)', re.I)
DATE_RE = re.compile(r'(\d{1,2})\s*(?:ST|ND|RD|TH)?\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*', re.I)

def season_date(day, mon):
    now = datetime.now(timezone.utc)
    start = now.year if now.month >= 8 else now.year - 1
    year = start if mon >= 8 else start + 1
    try:
        return '%04d-%02d-%02d' % (year, mon, int(day))
    except Exception:
        return None

def ocr_words(img):
    """Run Tesseract on an enlarged copy of the picture; returns text lines as lists of (x, word)."""
    if not shutil.which('tesseract'):
        return None
    with tempfile.TemporaryDirectory() as d:
        src, big = os.path.join(d, 'in'), os.path.join(d, 'big.png')
        open(src, 'wb').write(img)
        conv = shutil.which('magick') or shutil.which('convert')
        if conv:
            subprocess.run([conv, src, '-resize', '300%', '-colorspace', 'Gray', '-sharpen', '0x1', big], check=False, capture_output=True)
        if not os.path.exists(big):
            big = src
        r = subprocess.run(['tesseract', big, 'stdout', '--psm', '6', 'tsv'], capture_output=True, text=True)
    lines = {}
    for row in r.stdout.splitlines()[1:]:
        c = row.split('\t')
        if len(c) < 12 or not c[11].strip():
            continue
        try:
            if float(c[10]) < 0:
                continue
        except ValueError:
            continue
        key = (int(c[2]), int(c[3]), int(c[4]))
        lines.setdefault(key, []).append((int(c[6]), c[11].strip()))
    return [sorted(v) for k, v in sorted(lines.items())]

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
    """lines: [[(x, word), ...], ...] from ocr_words. Returns sections with fixtures and byes."""
    secs, cur, venue_x, v_x = [], None, None, None
    for ln in lines:
        text = ' '.join(w for _, w in ln)
        up = text.upper()
        rm = ROUND_RE.search(up)
        if rm and ('VENUE' in up or 'CUP' in up or 'SHIELD' in up or DATE_RE.search(up)):
            dm = DATE_RE.search(up)
            rd = re.sub(r'\s+', ' ', rm.group(1)).title().replace('Semi-Final', 'Semi Final')
            rd = re.sub(r'^R\s*(\d+)$', r'Round \1', rd)
            rd = re.sub(r'(?i)^(?:round|r)\s*(\d+)$', r'Round \1', rd.strip())
            rd = re.sub(r'(?i)quarter\s*-?\s*final', 'Quarter Final', rd)
            rd = re.sub(r'(?i)semi\s*-?\s*final', 'Semi Final', rd)
            cur = {'round': rd, 'date': season_date(dm.group(1), MONTHS[dm.group(2).upper()[:3]]) if dm else None, 'rows': [], 'byes': []}
            secs.append(cur)
            venue_x = next((x for x, w in ln if w.upper().startswith('VENUE')), None)
            continue
        if cur is None:
            continue
        if up.startswith('BYE'):
            rest = re.sub(r'^BYE[\'’S]*\s*[-:–]?\s*', '', text, flags=re.I)
            cur['byes'] += [best_team(n, teams) for n in re.split(r'[,&]| and ', rest) if n.strip()]
            continue
        vi = next((i for i, (x, w) in enumerate(ln) if re.fullmatch(r'[vV]{1,2}[sS]?\.?|[yY]', w)), None)
        if vi is None:
            continue
        home = ' '.join(w for _, w in ln[:vi])
        after = ln[vi + 1:]
        if venue_x is not None:
            away = ' '.join(w for x, w in after if x < venue_x - 15)
            venue = ' '.join(w for x, w in after if x >= venue_x - 15)
        else:
            away, venue = ' '.join(w for _, w in after), ''
        cur['rows'].append({'home': best_team(home, teams), 'away': best_team(away, teams), 'venue': venue.strip(' |')})
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

def main(out_path, prev_path=None):
    out = {'ok': True, 'at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S+00:00'), 'errors': []}

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
    draws = []
    for c in out['cups']:
        for im in c['images']:
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

    # ---- fixtures PDF fingerprint ----
    pdf = grab(SITE + FIXTURES_PDF)
    if pdf:
        out['fixtures'] = {'url': SITE + FIXTURES_PDF, 'page': SITE + FIXTURES_PAGE, 'hash': hashlib.md5(pdf).hexdigest(), 'bytes': len(pdf)}
    else:
        out['errors'].append('Could not read the fixtures PDF')

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
