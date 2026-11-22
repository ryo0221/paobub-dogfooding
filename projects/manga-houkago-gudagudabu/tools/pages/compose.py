#!/usr/bin/env python3
"""第1話のページを組む：コマごとの絵（3D のカメラの絵・ラフ・線画・仕上げ）をコマの枠に敷き、
吹き出しを、人物の頭（3D の舞台で写る位置と大きさ）を避けて置く（手本：gulliver-manga の avoidFigures）。

usage: compose.py STAGE {name|rough|ink|finish} OUT_DIR
  name   ：3D のカメラの絵を濃さ 50% で敷き、コマの番号・カメラ・絵のメモを書く
  rough  ：assets/{EP}/rough/panels/<PN>.png を敷く（下に 3D の絵を 20%）
  ink    ：assets/{EP}/ink/panels/<PN>.png
  finish ：assets/{EP}/finish/panels/<PN>.png
OUT_DIR/page-NN.png と OUT_DIR/balloons.json（吹き出しの位置と台詞、写植の記録に使う）を書く。
"""
import json, math, os, re, sys
import balloon_shape
from PIL import Image, ImageDraw, ImageFont
EP = os.environ.get('EP', 'ep01'); EPN = int(EP[2:])  # 話（ep01・ep02…）。ページは 1 話 8 ページずつ

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
stage_kind, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
sb = json.load(open(f'{ROOT}/docs/storyboard-pages.json'))
st = {r['panel']: r for r in json.load(open(f'{ROOT}/assets/{EP}/stage/{EP}-stage.json'))['panels']}
script = open(f'{ROOT}/docs/script-doc.md').read()
LINES = {}
THOUGHT = set()  # 心の声（脚本の「言い方」に（心の声））：雲形の吹き出しにする
for m in re.finditer(r'#### (DL-\d+) (\S+)\n(.*?)(?=\n####|\n### |\Z)', script, re.S):
    body = m.group(3)
    who = re.search(r'話す人物：(CH-\d+)', body)
    text = re.search(r'台詞：「(.*)」', body)
    if text: LINES[m.group(1)] = (who.group(1) if who else None, text.group(1))
    if '心の声' in (re.search(r'言い方：(.*)', body) or [None, ''])[1]: THOUGHT.add(m.group(1))
FONT = f'{ROOT}/assets/fonts/GenEiAntiqueNv6-M.ttf' if os.path.exists(f'{ROOT}/assets/fonts/GenEiAntiqueNv6-M.ttf') else '/usr/share/fonts/truetype/ipafont-gothic/ipag.ttf' if os.path.exists('/usr/share/fonts/truetype/ipafont-gothic/ipag.ttf') else '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
FS = 34
font = ImageFont.truetype(FONT, FS)
small = ImageFont.truetype(FONT, 22)


def kind(c):
    if c == 'ー': return 'x'
    if '぀'<=c<='ゟ': return 'h'
    if '゠'<=c<='ヿ': return 'k'
    if '一'<=c<='鿿' or c in '々〆': return 'K'
    if c in '、。！？…」』）　 ': return 'p'
    return 'o'
PARTICLE = set('のがをにはでともへや')
def segs(text):
    # 文節に近い切れ目：句読点の後、ひらがなから漢字・カタカナ・かぎ括弧に変わる所。
    # ただし送り仮名 1 字のあとの漢字（落ち着く・飲み比べ・3つ目）では切らない（助詞 1 字なら切る）
    out, cur = [], ''
    for i, ch in enumerate(text):
        if cur:
            a, b = kind(cur[-1]), kind(ch)
            run = len(cur) - len(cur.rstrip(''.join(c for c in set(cur) if kind(c) == 'h')))
            ok_h = run >= 2 or cur[-1] in PARTICLE
            if b == 'x' or text.startswith('先輩', i): pass  # 名前と呼び名（たけし先輩）は切らない
            elif (a == 'p' and b != 'p') or (a == 'h' and (b in 'Kk' or ch in '「『（') and ok_h) or (a == 'h' and b == 'o' and cur[-1] in PARTICLE):
                out.append(cur); cur = ''
        cur += ch
    if cur: out.append(cur)
    return out
def chunk(S, lim):
    # 切れ目の無い長い区切り（ひらがなが続く所など）は、真ん中に近い所で 2 つに分ける。
    # 助詞・「て」の後を選び、句読点・長音・小さい字で行を始めない。両側に 3 字以上残す
    out = []
    for x in S:
        if len(x) <= lim: out.append(x); continue
        best = None
        for i in range(3, len(x) - 2):
            if x[i] in '、。！？…」』）ーぁぃぅぇぉっゃゅょ' or x[i] in PARTICLE or x[i - 1] in 'っ': continue
            if x[i] in 'すしらいたるれんよねかさませて' and x[i - 1] not in 'がはにを': continue  # 語の途中。助詞（が・は・に・を）のあとなら切ってよい
            c = abs(i - len(x) / 2) - (3 if x[i - 1] in 'てでがはにをもとゃ' else 0)
            if best is None or c < best[0]: best = (c, i)
        if best: out += chunk([x[:best[1]], x[best[1]:]], lim)
        else: out.append(x)
    return out
def wrap(text, n):
    """吹き出しの行分け。文節に近い切れ目だけで切り、行の長さをそろえる（語の途中で切らない：「貼／り紙」にしない）。"""
    if len(text) <= 8: return [text]
    S = chunk(segs(text), n + 3)
    k = max(1, math.ceil(len(text) / n))
    best = None
    for kk in range(1, k + 3):
        # DP: split S into kk lines minimizing sum of (len - target)^2, each line <= n+3
        tgt = len(text) / kk
        INF = 1e18; m = len(S)
        dp = [[INF] * (kk + 1) for _ in range(m + 1)]; bk = [[None] * (kk + 1) for _ in range(m + 1)]
        dp[0][0] = 0
        for i in range(1, m + 1):
            for j in range(1, kk + 1):
                for s in range(i):
                    L = sum(len(x) for x in S[s:i])
                    if L > n + 5 or dp[s][j - 1] >= INF: continue
                    c = dp[s][j - 1] + (L - tgt) ** 2 + 15 * max(0, L - n - 1) ** 2 + (1000 if L <= 2 and len(text) > 8 else 0)
                    if c < dp[i][j]: dp[i][j] = c; bk[i][j] = s
        if dp[m][kk] < INF:
            lines = []; i, j = m, kk
            while j: s = bk[i][j]; lines.append(''.join(S[s:i])); i, j = s, j - 1
            cand = (dp[m][kk] + abs(kk - k) * 30, lines[::-1])
            if best is None or cand[0] < best[0]: best = cand
    return _fix(best[1]) if best else _old_wrap(text, n)


def _old_wrap(text, n):
    out, cur = [], ''
    for ch in text:
        cur += ch
        if len(cur) >= n and ch not in '、。！？…」』）':
            out.append(cur); cur = ''
    if cur: out.append(cur)
    return _fix(out)


def _fix(out):
    # 句読点で始まる行を前の行へ寄せる
    fixed = []
    for l in out:
        while fixed and l and l[0] in '、。！？…」』）ー':
            fixed[-1] += l[0]; l = l[1:]
        l = l.strip(' 　')  # 行末の空き（「いい？ 」）は縦組みで空きの字になるので取る
        if l: fixed.append(l)
    return fixed


VERTICAL = os.environ.get('WRITING', 'vertical') == 'vertical'  # 写植は縦書き（画作りガイドの文字の決まり）。WRITING=horizontal で横書き


def text_box(lines):
    """台詞の文字の占める大きさ（幅, 高さ）。縦書きは行が右から左へ並ぶ列、横書きは上から下へ並ぶ行。"""
    if VERTICAL: return len(lines) * FS * 1.25, max(len(l) for l in lines) * FS
    return max(font.getlength(l) for l in lines), len(lines) * FS * 1.25


def balloon_size(text, lines=None):
    n = 7 if len(text) > 14 else 6
    lines = lines or wrap(text, n)
    tw, th = text_box(lines)
    if VERTICAL:  # 楕円の内側に文字の四隅が入るよう、縦横とも余白を取る
        return lines, tw + 2 * FS * 1.2, th + 2 * FS * 1.25
    return lines, tw + 2 * 34, th + 2 * 26


def ink_density(pid, w, h):
    """線画の人物レイヤー（LY-05）の濃さを 1/8 の格子に。吹き出しが人物の線に被るほど高くつく。"""
    p = f"{ROOT}/assets/{EP}/ink/layers/{pid}/fig.png"
    if not os.path.exists(p): return None
    g = Image.open(p).convert('L').resize((max(1, w // 8), max(1, h // 8)), Image.BOX)
    return g


SIGNS = json.load(open(f'{ROOT}/assets/{EP}/sign-text.json')) if os.path.exists(f'{ROOT}/assets/{EP}/sign-text.json') else {}  # 絵の中の字（看板など）。コマの幅・高さに対する割合
PLACE = json.load(open(f'{ROOT}/assets/{EP}/lettering-notes.json')) if os.path.exists(f'{ROOT}/assets/{EP}/lettering-notes.json') else {}


def place(panel_w, panel_h, heads, items, dens=None, beam=40):
    """items: [(dl, who, text)] を読む順に。heads: [(x, y, r, who)]（px）。右上から左下へ読む（rtl）。
    読む順・顔・人物の線・話す人への近さの合計が小さい並びを、ビーム探索で選ぶ（先の吹き出しが後の場所を塞がないように）。"""
    def cands(i, placed):
        dl, who, text = items[i]
        lines, bw, bh = balloon_size(text, PLACE.get(dl, {}).get('lines'))  # 行分けを決めた台詞（狭い所に置くため）
        bw, bh = min(bw, panel_w - 24), min(bh, panel_h - 24)
        sp = [h for h in heads if h[3] == who]
        if dl in PLACE:  # 作者の確認で決めた位置（assets/{EP}/lettering-notes.json、コマの幅・高さに対する割合）
            grid = [(min(PLACE[dl]['at'][0] * panel_w, panel_w - bw - 12), min(PLACE[dl]['at'][1] * panel_h, panel_h - bh - 12))]  # 枠からはみ出さない
        else:
            grid = [(12 + (panel_w - bw - 24) * gx / 20, 12 + (panel_h - bh - 24) * gy / 20) for gy in range(21) for gx in range(21)]
        out = []
        for x, y in grid:
            cx, cy = x + bw / 2, y + bh / 2
            face = 0.0
            for hx, hy, hr, _ in heads:  # 頭（顔）に被らない
                dx = max(x - hx, 0, hx - (x + bw)); dy = max(y - hy, 0, hy - (y + bh))
                d = math.hypot(dx, dy)
                if d < hr * 1.15: face += 1000 * (1 - d / (hr * 1.15)) + 300
            score = face
            for p in placed:  # 吹き出しどうし重ならない
                if x < p['x'] + p['w'] + 8 and p['x'] < x + bw + 8 and y < p['y'] + p['h'] + 8 and p['y'] < y + bh + 8: score += 5000
            for p in placed:  # 読む順（右上から左下）：先の吹き出しより右なら下に、上には置かない
                right = cx >= p['x'] + p['w'] / 2 - 20
                below = y > p['y'] + p['h'] * 0.8
                above = y + bh < p['y'] + p['h'] * 0.3
                if (right and not below) or above: score += 3000
            if dens is not None:  # 人物の線（顔・体）を隠さない
                crop = dens.crop((int(x / 8), int(y / 8), int((x + bw) / 8), int((y + bh) / 8)))
                v = list(crop.getdata()) if crop.size[0] and crop.size[1] else [255]
                score += 900 * sum(255 - q for q in v) / (255 * len(v))
            score += cy / panel_h * 120  # 上ほどよい
            if sp:  # 話す人の頭の近く
                hx, hy, hr, _ = sp[0]
                score += math.hypot(cx - hx, cy - (hy - hr * 1.6)) / max(panel_w, panel_h) * 200
            elif i == 0: score += (panel_w - cx) / panel_w * 80  # 右から
            if dl in PLACE: score, face = 0, 0
            tail = None
            if sp:
                hx, hy, hr, _ = sp[0]
                if dl in PLACE and 'tail_to' in PLACE[dl]: hx, hy, hr = PLACE[dl]['tail_to'][0] * panel_w, PLACE[dl]['tail_to'][1] * panel_h, 0  # しっぽの向きを決めた台詞（話す人の持つ物へ向けるなど）
                d_ = math.hypot(hx - cx, hy - cy) or 1
                ang = math.atan2(hy - cy, hx - cx)  # 楕円の縁から短く出す（縦長の吹き出しでも、しっぽが顔や別の人物まで伸びない）
                edge = (bw / 2) * (bh / 2) / math.hypot(bh / 2 * math.cos(ang), bw / 2 * math.sin(ang))
                stop = min(edge + 70, max(edge + 30, d_ - hr * 1.3))
                if dl in PLACE and 'tail_len' in PLACE[dl]: stop = edge + PLACE[dl]['tail_len']  # 絵の物（看板など）を跨がないよう、しっぽを短くする
                tail = (cx + (hx - cx) / d_ * stop, cy + (hy - cy) / d_ * stop)
            out.append((score, {'dl': dl, 'who': who, 'text': text, 'lines': lines, 'x': x, 'y': y, 'w': bw, 'h': bh, 'tail': None if (dl in PLACE and PLACE[dl].get('tail') is False) else tail, 'overlap': face >= 300, **({'thought': True} if dl in THOUGHT else {})}))
        out.sort(key=lambda t: t[0])
        return out[:beam * 6]
    states = [(0.0, [])]
    for i in range(len(items)):
        nxt = []
        for tot, placed in states:
            for sc, b in cands(i, placed): nxt.append((tot + sc, placed + [b]))
        nxt.sort(key=lambda t: t[0]); states = nxt[:beam]
    return states[0][1] if states else []


def panel_items(pn):
    raw = pn.get('入れる台詞') or ''
    return [(dl, *LINES[dl]) for dl in re.findall(r'DL-\d+', raw) if dl in LINES]


def draw_balloon(d, ox, oy, b, narration=False):
    x, y, w, h = ox + b['x'], oy + b['y'], b['w'], b['h']
    if b.get('thought'):
        if b['tail']:
            for qx, qy, r in balloon_shape.dots(x, y, w, h, ox + b['tail'][0], oy + b['tail'][1]):
                d.ellipse([qx - r, qy - r, qx + r, qy + r], fill='white', outline='black', width=3)
        d.polygon(balloon_shape.sample(balloon_shape.cloud(x, y, w, h)), fill='white', outline='black', width=3)
    elif b['tail']:
        tx, ty = ox + b['tail'][0], oy + b['tail'][1]
        cx, cy = x + w / 2, y + h / 2
        ang = math.atan2(ty - cy, tx - cx); L = math.hypot(tx - cx, ty - cy)
        ex, ey = cx + math.cos(ang) * L, cy + math.sin(ang) * L
        px, py = -math.sin(ang) * 18, math.cos(ang) * 18
        d.polygon([(cx + px, cy + py), (cx - px, cy - py), (ex, ey)], fill='white', outline='black', width=3)
    if not b.get('thought'): d.ellipse([x, y, x + w, y + h], fill='white', outline='black', width=3)
    if b['tail'] and not b.get('thought'):
        d.polygon([(x + w / 2 + px * 0.8, y + h / 2 + py * 0.8), (x + w / 2 - px * 0.8, y + h / 2 - py * 0.8), (ex - math.cos(ang) * 6, ey - math.sin(ang) * 6)], fill='white')
    if VERTICAL:  # 下書きの絵（ページの画像の正本は Design から書き出す）：列を右から左へ、字を上から下へ
        tw, th = text_box(b['lines'])
        for i, l in enumerate(b['lines']):
            cx = x + w / 2 + tw / 2 - FS * 1.25 * (i + 0.5); y0 = y + (h - th) / 2
            for j, ch in enumerate(l):
                gy = y0 + j * FS
                if ch in 'ー…〜（）「」『』':
                    g = Image.new('L', (FS, FS), 0); ImageDraw.Draw(g).text((0, 0), ch, font=font, fill=255)
                    g = g.rotate(-90); d.bitmap((cx - FS / 2, gy), g, fill='black')
                elif ch in '、。':
                    d.text((cx - FS / 2 + FS * 0.55, gy - FS * 0.55), ch, font=font, fill='black')
                else:
                    d.text((cx - font.getlength(ch) / 2, gy), ch, font=font, fill='black')
        return
    ty0 = y + (h - len(b['lines']) * FS * 1.25) / 2
    for i, l in enumerate(b['lines']):
        d.text((x + (w - font.getlength(l)) / 2, ty0 + i * FS * 1.25), l, font=font, fill='black')


def draw_sign(d, ox, oy, w, h, sg):
    """絵の中の字（看板・名札）：枠の中に中央ぞろえで書く。吹き出しは付けない。"""
    f = ImageFont.truetype(FONT, sg.get('fontSize', FS))
    sx, sy, sw, sh = ox + sg['at'][0] * w, oy + sg['at'][1] * h, sg['size'][0] * w, sg['size'][1] * h
    fs = sg.get('fontSize', FS); rows = sg['text'].split('\n'); lh = fs * 1.2
    for i, row in enumerate(rows):
        d.text((sx + (sw - f.getlength(row)) / 2, sy + (sh - lh * len(rows)) / 2 + i * lh), row, font=f, fill='black')


pages = sb['page'][(EPN - 1) * 8:EPN * 8]
record = []
for n, pg in enumerate(pages, 1):
    page = Image.new('RGB', (2000, 2828), 'white')
    d = ImageDraw.Draw(page)
    for pn in [p for p in sb['panel'] if p['in'] == pg['id']]:
        x, y, w, h = pn['frame']
        rec = st.get(pn['id'])
        under = f"{ROOT}/assets/{EP}/stage/underlay/{pn['id']}.jpg"
        art = {'rough': f"{ROOT}/assets/{EP}/rough/panels/{pn['id']}.png", 'ink': f"{ROOT}/assets/{EP}/ink/panels/{pn['id']}.png", 'finish': f"{ROOT}/assets/{EP}/finish/panels/{pn['id']}.png"}.get(stage_kind)
        if stage_kind == 'name' or (art and not os.path.exists(art)):
            im = Image.open(under).convert('RGB').resize((w, h))
            page.paste(Image.blend(Image.new('RGB', (w, h), 'white'), im, 0.5), (x, y))
        else:
            im = Image.open(art).convert('RGB').resize((w, h))
            page.paste(im, (x, y))
        d.rectangle([x, y, x + w, y + h], outline='black', width=6)
        heads = []
        if rec:
            for p in rec['people']:
                if p['head_at'] and p['head_in_frame']:
                    heads.append((p['head_at'][0] * w, p['head_at'][1] * h, (p['head_r'] or 0.1) * h, p['who']))
        signs = SIGNS.get(pn['id'], [])
        for sg in signs:  # 吹き出しが絵の中の字に被らないよう、頭と同じく避ける的にする
            sx, sy, sw, sh = sg['at'][0] * w, sg['at'][1] * h, sg['size'][0] * w, sg['size'][1] * h
            heads.append((sx + sw / 2, sy + sh / 2, max(sw, sh) / 2, 'SIGN'))
        bl = place(w, h, heads, panel_items(pn), ink_density(pn['id'], w, h))
        for b in bl: draw_balloon(d, x, y, b)
        for sg in signs: draw_sign(d, x, y, w, h, sg)
        if stage_kind == 'name':
            d.text((x + 10, y + 8), f"{pn['id']}  {pn.get('枠の形と大きさ','')[:24]}", font=small, fill='#1a4fa0')
            memo = (pn.get('描く内容') or pn['name'])[:40]
            d.text((x + 10, y + h - 32), f"絵：{memo}", font=small, fill='#555555')
        record.append({'page': pg['id'], 'panel': pn['id'], 'frame': pn['frame'], 'balloons': [{k: v for k, v in b.items()} for b in bl], **({'signs': signs} if signs else {})})
    d.text((990, 2770), f'{n:02d}', font=small, fill='#666666')
    page.save(f'{out}/page-{n:02d}.png')
json.dump(record, open(f'{out}/balloons.json', 'w'), ensure_ascii=False, indent=1)
print('pages', len(pages), 'balloons over a face:', [(r['panel'], b['dl']) for r in record for b in r['balloons'] if b['overlap']])
