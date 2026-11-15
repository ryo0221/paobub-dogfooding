#!/usr/bin/env python3
"""写植の記録（docs/lettering-record.json）を、仕上げの吹き出し（compose.py の balloons.json）に合わせて書き直す。
台詞の引用・話す人物・書体・組み方とその理由は今の行を引き継ぎ、文字の組み・大きさ・図形の ID・置き方だけを新しくする。
usage: lettering.py BALLOONS_JSON
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
bl = json.load(open(sys.argv[1]))
p = f'{ROOT}/docs/lettering-record.json'
doc = json.load(open(p))
by_dl = {r['台詞']: r for r in doc['rows']}
FACE_NOTE = {  # 3D の頭の丸に掛かると出たが、線画で見て顔は隠していない所（作者が確かめる）
}
rows, n = [], 0
for r in bl:
    for b in r['balloons']:
        n += 1
        old = by_dl.get(b['dl'], {})
        gid = f"{r['panel']}-LY07-{b['dl']}"
        row = dict(old)
        row.update({
            'id': f'BL-{n:03d}', 'ページ': r['page'], 'コマ': r['panel'], '台詞': b['dl'],
            '文字の大きさ': '34（全ページ同じ）', '文字の組み': '／'.join(b['lines']),
            '吹き出しの形': 'なめらかな楕円形、話す人物へ向けたしっぽ（頭の手前で止める）' if b.get('tail') else 'なめらかな楕円形、しっぽ無し（話す人物がコマに写らない）',
            '図形': [f'{gid}-shape', f'{gid}-text'],
            '置き方': ('人物の頭（3D の舞台で写る位置）と線画の人物の線を避けて置いた（tools/pages/compose.py）。'
                    + ('3D の頭の丸には掛かるが、寄りのコマで顔ではなく胸元に置いた。作者が確かめる' if b.get('overlap') else '')),
        })
        row['name'] = f"BL-{n:03d} {row.get('話す人物', b['who'])}の吹き出し（{b['dl']}）"
        rows.append(row)
missing = [d for d in by_dl if d not in {r['台詞'] for r in rows}]
doc['rows'] = rows
json.dump(doc, open(p, 'w'), ensure_ascii=False, indent=1)
print('balloons', len(rows), 'dialogue lines without a balloon:', missing)
