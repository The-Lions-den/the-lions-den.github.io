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
