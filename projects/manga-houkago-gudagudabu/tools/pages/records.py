#!/usr/bin/env python3
"""漫画ページ（ラフ・線画・仕上げ）の記録を、成果物の見出しの順に書く：assets/ep01/{kind}-record.json。
Design 原稿の「記録」のフレームに入る（build-design.py）。中身は assets/ep01/{kind}/{kind}.json（道具・参照・sha256）から作る。
usage: records.py {rough|ink|finish}
"""
import hashlib, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
kind = sys.argv[1]
sb = json.load(open(f'{ROOT}/docs/storyboard-pages.json'))
cs = {r['id']: r['name'] for r in json.load(open(f'{ROOT}/docs/character-sheet.json'))['rows']}
rec = json.load(open(f'{ROOT}/assets/ep01/{kind}/{kind}.json'))
sha = lambda p: hashlib.sha256(open(f'{ROOT}/{p}', 'rb').read()).hexdigest()[:12]
pages = sb['page'][:8]
pan = {pg['id']: [p for p in sb['panel'] if p['in'] == pg['id']] for pg in pages}
figs = {}
for f in sb['figure']: figs.setdefault(f['in'], []).append(f)
SHEET = {'CH-01': 'nemu', 'CH-02': 'suzu', 'CH-03': 'takeshi', 'CH-04': 'reika', 'CH-05': 'tanahashi'}
TOOL = rec['tool']
LIC = '出典：自作（このプロジェクトの 3D の舞台・設定画・前の段階の絵だけを渡した。外部の作品・写真は渡していない）。利用条件：このプロジェクトの作品に使う'


def per_page(fn):
    return '\n'.join(f"{pg['id']}（{pg['name'].split('：')[-1]}）：" + fn(pg) for pg in pages)


def ids(pg): return '・'.join(p['id'] for p in pan[pg['id']])


def who_in(pg):
    s = []
    for p in pan[pg['id']]:
        for f in figs.get(p['id'], []):
            if f['who'] not in s: s.append(f['who'])
    return s


sheets = '、'.join(f"{cs[c]}（assets/character/{SHEET[c]}.png sha256 {sha(f'assets/character/{SHEET[c]}.png')}…）" for c in SHEET)
if kind == 'rough':
    title = '第1話 ラフの記録'
    sections = [
        ('ページごとのラフ', per_page(lambda pg: f"{ids(pg)}。コマの ID と枠はネームのまま。人物の配置（FG）ごとに、3D の舞台で決めたアングル・ポーズで描いた。同じ絵を別のコマで使ったところは無い。仮の吹き出しは、3D で写る頭の位置と線画の人物の線を避けて置いた（tools/pages/compose.py）")),
        ('使う資料', per_page(lambda pg: '設定画：' + '、'.join(cs[c] for c in who_in(pg)) + f"。3D の舞台：assets/ep01/stage/underlay/（{ids(pg)}）。作画の方法：3D の下絵をもとに AI（Codex）で描く") + f"\n設定画の固定した版：{sheets}"),
        ('レイヤー', f"どのページも LY-01 下描き（3D のカメラの絵を薄く、その上に AI のラフ）と、仮の LY-07 吹き出し・LY-08 文字。\nAI の提案を採ったレイヤー：LY-01 のラフの絵（全36コマ）。人が描いた・直したレイヤーは無い。作者の確認で直した所：生徒会室の8コマ（部室の家具が入った）、PN-010（すずの髪型）を描き直した（記録の retakes）。\n道具と版：{TOOL}。渡した参照：1枚目に 3D のカメラの絵、続けてそのコマの人物の設定画（上の固定した版）。コマごとの生の出力の sha256・プロンプト：assets/ep01/rough/rough.json と prompts/。\n{LIC}"),
    ]
elif kind == 'ink':
    nobg = [p for p, v in sorted(rec['panels'].items()) if not v['layers'].get('bg')]
    fx = [p for p, v in sorted(rec['panels'].items()) if v['layers'].get('fx')]
    title = '第1話 線画の記録'
    sections = [
        ('ページごとの線画', per_page(lambda pg: f"{ids(pg)}。ラフをなぞり、3D のカメラの絵で部屋の遠近と家具の比率を合わせた")),
        ('レイヤー', f"どのページも LY-01 下描き（ラフと 3D の絵。非表示で残す）・LY-02 背景・LY-05 線画。LY-06 効果は効果の線のあるコマだけ（{'・'.join(fx)}）。\n分け方：AI に三色のペン（黒＝人物、青＝背景、赤＝効果）で描かせ、色で分けた（tools/art/panel-assets.py）。\nAI の提案を採ったレイヤー：LY-02・LY-05・LY-06（全36コマ）。人が描いた・直したレイヤーは無い。\n道具と版：{TOOL}。渡した参照：1枚目にそのコマのラフ（assets/ep01/rough/panels、rough.json の sha256）、2枚目に 3D のカメラの絵、続けて設定画（{sheets}）。生の出力の sha256・プロンプト：assets/ep01/ink/ink.json と prompts/。\n{LIC}"),
        ('背景の線の無いコマ', ('\n'.join(f'{p}：理由を書く' for p in nobg) if nobg else 'なし。36コマすべてに背景の線がある（寄りのコマも、部屋の窓・棚・廊下の線を残した）。') + '\n続く状態：脚本の「続く状態」（SC-001〜SC-005：れいかの腕章、入部届の判子の有無、こたつの席順、湯のみの数、光の向きなど）を、コマごとの説明に入れて描かせた（assets/ep01/continuity.json）。'),
    ]
else:
    title = '第1話 仕上げの記録'
    sections = [
        ('ページごとの仕上げ', per_page(lambda pg: f"{ids(pg)}。白黒。ベタは黒髪（ねむ・すず・れいか・棚橋先生）、トーンは網点1種類を制服と影に。たけしは黒を使わず薄いトーン（AR-08）")),
        ('レイヤー', f"どのページも LY-02 背景・LY-03 ベタ・LY-04 トーン・LY-05 線画・LY-06 効果（効果の線のあるコマ）・LY-07 吹き出し・LY-08 文字。LY-01 下描きは非表示で残す。\n分け方：AI の仕上げの絵と線画の差から、増えた濃い所をベタ、中間をトーンに分けた（tools/art/panel-assets.py）。\nAI の提案を採ったレイヤー：LY-02〜LY-06。人が置いたレイヤー：LY-07 吹き出し・LY-08 文字（台詞は脚本の DL から引用、写植の記録は lettering-record）。\n道具と版：{TOOL}。渡した参照：そのコマの線画（assets/ep01/ink/panels、ink.json の sha256）だけ。生の出力の sha256・プロンプト：assets/ep01/finish/finish.json と prompts/。\n{LIC}"),
    ]
json.dump({'title': title, 'sections': sections}, open(f'{ROOT}/assets/ep01/{kind}-record.json', 'w'), ensure_ascii=False, indent=1)
print(kind, [s[0] for s in sections])
