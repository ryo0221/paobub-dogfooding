#!/usr/bin/env python3
"""写植の記録（docs/lettering-record.json）を、仕上げの吹き出し（compose.py の balloons.json）に合わせて書き直す。
台詞の引用・話す人物・書体・組み方とその理由は今の行を引き継ぎ、文字の組み・大きさ・図形の ID・置き方だけを新しくする。
usage: lettering.py BALLOONS_JSON
"""
import json, os, sys

VERTICAL = os.environ.get('WRITING', 'vertical') == 'vertical'  # compose.py と同じ
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bl = json.load(open(sys.argv[1]))
p = f'{ROOT}/docs/lettering-record.json'
doc = json.load(open(p))
by_dl = {r['台詞']: r for r in doc['rows']}
mine = {r['page'] for r in bl}
keep = [r for r in doc['rows'] if r['ページ'] not in mine]  # ほかの話の行はそのまま残す
TEMPLATE = {k: doc['rows'][0][k] for k in ('書体', '組み方', '組み方の理由', '台詞の版')} if doc['rows'] else {}
NAMES = {'CH-01': 'ねむ', 'CH-02': 'すず', 'CH-03': 'たけし', 'CH-04': 'れいか', 'CH-05': '棚橋先生'}
FACE_NOTE = {  # 3D の頭の丸に掛かると出たが、線画で見て顔は隠していない所（作者が確かめる）
}
rows, n = [], max([int(r['id'][3:]) for r in keep if r['ページ'] < min(mine)] or [0])
for r in bl:
    for b in r['balloons']:
        n += 1
        old = by_dl.get(b['dl'], {})
        gid = f"{r['panel']}-LY07-{b['dl']}"
        row = dict(old) if old else {**TEMPLATE, '話す人物': NAMES.get(b['who'], b['who']), '台詞の全文': ''.join(b['lines'])}
        row.update({
            'id': f'BL-{n:03d}', 'ページ': r['page'], 'コマ': r['panel'], '台詞': b['dl'],
            '組み方': '縦書き（行は右から左へ）' if VERTICAL else '横書き',
            '組み方の理由': ('画作りガイドと作者の依頼のとおり。Design の文字の writingMode: vertical-rl で組む（2026-11-22、作者が「Design に縦書きを足す」を選び、Editor Platform に縦書きが既にあった）。看板・名札など絵の中の字は横書きのまま'
                        if VERTICAL else row.get('組み方の理由', '')),
            '文字の大きさ': '34（全ページ同じ）', '文字の組み': '／'.join(b['lines']),
            '吹き出しの形': ('雲形（心の声）、話す人物へ向けた小さな丸2つ' if b.get('thought') else 'なめらかな楕円形、話す人物へ向けたしっぽ（吹き出しの縁から短く出し、頭の手前で止める）') if b.get('tail') else ('雲形（心の声）、しっぽ無し' if b.get('thought') else 'なめらかな楕円形、しっぽ無し（話す人物がコマに写らないか、同じ人物の前の吹き出しに続く）'),
            '図形': [f'{gid}-shape', f'{gid}-text'],
            '置き方': ('人物の頭（3D の舞台で写る位置）と線画の人物の線を避けて置いた（tools/pages/compose.py）。'
                    + ('3D の頭の丸には掛かるが、寄りのコマで顔ではなく胸元に置いた。作者が確かめる' if b.get('overlap') else '')),
        })
        row['name'] = f"BL-{n:03d} {row.get('話す人物', b['who'])}の吹き出し（{b['dl']}）"
        rows.append(row)
missing = [d for d in by_dl if d not in {r['台詞'] for r in rows} and by_dl[d]['ページ'] in mine]
doc['rows'] = sorted(keep + rows, key=lambda r: (r['ページ'], int(r['id'][3:])))
json.dump(doc, open(p, 'w'), ensure_ascii=False, indent=1)
print('balloons', len(rows), 'dialogue lines without a balloon:', missing)
