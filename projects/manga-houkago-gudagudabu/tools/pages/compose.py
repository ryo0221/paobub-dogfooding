#!/usr/bin/env python3
"""第1話のページを組む：コマごとの絵（3D のカメラの絵・ラフ・線画・仕上げ）をコマの枠に敷き、
吹き出しを、人物の頭（3D の舞台で写る位置と大きさ）を避けて置く（手本：gulliver-manga の avoidFigures）。

usage: compose.py STAGE {name|rough|ink|finish} OUT_DIR
  name   ：3D のカメラの絵を濃さ 50% で敷き、コマの番号・カメラ・絵のメモを書く
  rough  ：assets/ep01/rough/panels/<PN>.png を敷く（下に 3D の絵を 20%）
  ink    ：assets/ep01/ink/panels/<PN>.png
  finish ：assets/ep01/finish/panels/<PN>.png
OUT_DIR/page-NN.png と OUT_DIR/balloons.json（吹き出しの位置と台詞、写植の記録に使う）を書く。
"""
import json, math, os, re, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
stage_kind, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
sb = json.load(open(f'{ROOT}/docs/storyboard-pages.json'))
st = {r['panel']: r for r in json.load(open(f'{ROOT}/assets/ep01/stage/ep01-stage.json'))['panels']}
script = open(f'{ROOT}/docs/script-doc.md').read()
LINES = {}
for m in re.finditer(r'#### (DL-\d+) (\S+)\n(.*?)(?=\n####|\n### |\Z)', script, re.S):
    body = m.group(3)
    who = re.search(r'話す人物：(CH-\d+)', body)
    text = re.search(r'台詞：「(.*)」', body)
    if text: LINES[m.group(1)] = (who.group(1) if who else None, text.group(1))
FONT = '/usr/share/fonts/truetype/ipafont-gothic/ipag.ttf' if os.path.exists('/usr/share/fonts/truetype/ipafont-gothic/ipag.ttf') else '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
FS = 34
font = ImageFont.truetype(FONT, FS)
small = ImageFont.truetype(FONT, 22)


def wrap(text, n):
    # 行の長さをそろえる（最後の行に1〜2字だけ残さない）。読点・句点の直後で切れるなら、そこで切る
    if len(text) <= 8: return [text]
    k = max(1, math.ceil(len(text) / n)); n = math.ceil(len(text) / k)
    out, cur = [], ''
    for i, ch in enumerate(text):
        cur += ch
        if len(cur) >= n - 2 and ch in '、。！？…' and i < len(text) - 2:
            out.append(cur); cur = ''; continue
        if len(cur) >= n + 1 and ch not in '、。！？…」』）ー':
            out.append(cur); cur = ''
    if cur: out.append(cur)
    return _fix(out)


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
        if l: fixed.append(l)
    return fixed


def balloon_size(text):
    n = 7 if len(text) > 14 else 6
    lines = wrap(text, n)
    w = max(font.getlength(l) for l in lines) + 2 * 34
    h = len(lines) * FS * 1.25 + 2 * 26
    return lines, w, h


def ink_density(pid, w, h):
    """線画の人物レイヤー（LY-05）の濃さを 1/8 の格子に。吹き出しが人物の線に被るほど高くつく。"""
    p = f"{ROOT}/assets/ep01/ink/layers/{pid}/fig.png"
    if not os.path.exists(p): return None
    g = Image.open(p).convert('L').resize((max(1, w // 8), max(1, h // 8)), Image.BOX)
    return g


PLACE = json.load(open(f'{ROOT}/assets/ep01/lettering-notes.json')) if os.path.exists(f'{ROOT}/assets/ep01/lettering-notes.json') else {}


def place(panel_w, panel_h, heads, items, dens=None, beam=40):
    """items: [(dl, who, text)] を読む順に。heads: [(x, y, r, who)]（px）。右上から左下へ読む（rtl）。
    読む順・顔・人物の線・話す人への近さの合計が小さい並びを、ビーム探索で選ぶ（先の吹き出しが後の場所を塞がないように）。"""
    def cands(i, placed):
        dl, who, text = items[i]
        lines, bw, bh = balloon_size(text)
        bw, bh = min(bw, panel_w - 24), min(bh, panel_h - 24)
        sp = [h for h in heads if h[3] == who]
        if dl in PLACE:  # 作者の確認で決めた位置（assets/ep01/lettering-notes.json、コマの幅・高さに対する割合）
            grid = [(PLACE[dl]['at'][0] * panel_w, PLACE[dl]['at'][1] * panel_h)]
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
                d_ = math.hypot(hx - cx, hy - cy) or 1
                stop = max(d_ - hr * 1.2, min(bw, bh) / 2 + 30)  # 頭の手前で止め、短くても枠の外へ出す
                stop = min(stop, max(bw, bh) / 2 + 90)
                tail = (cx + (hx - cx) / d_ * stop, cy + (hy - cy) / d_ * stop)
            out.append((score, {'dl': dl, 'who': who, 'text': text, 'lines': lines, 'x': x, 'y': y, 'w': bw, 'h': bh, 'tail': tail, 'overlap': face >= 300}))
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
    if b['tail']:
        tx, ty = ox + b['tail'][0], oy + b['tail'][1]
        cx, cy = x + w / 2, y + h / 2
        ang = math.atan2(ty - cy, tx - cx); L = math.hypot(tx - cx, ty - cy)
        ex, ey = cx + math.cos(ang) * L, cy + math.sin(ang) * L
        px, py = -math.sin(ang) * 18, math.cos(ang) * 18
        d.polygon([(cx + px, cy + py), (cx - px, cy - py), (ex, ey)], fill='white', outline='black', width=3)
    d.ellipse([x, y, x + w, y + h], fill='white', outline='black', width=3)
    if b['tail']:
        d.polygon([(x + w / 2 + px * 0.8, y + h / 2 + py * 0.8), (x + w / 2 - px * 0.8, y + h / 2 - py * 0.8), (ex - math.cos(ang) * 6, ey - math.sin(ang) * 6)], fill='white')
    ty0 = y + (h - len(b['lines']) * FS * 1.25) / 2
    for i, l in enumerate(b['lines']):
        d.text((x + (w - font.getlength(l)) / 2, ty0 + i * FS * 1.25), l, font=font, fill='black')


pages = sb['page'][:8]
record = []
for n, pg in enumerate(pages, 1):
    page = Image.new('RGB', (2000, 2828), 'white')
    d = ImageDraw.Draw(page)
    for pn in [p for p in sb['panel'] if p['in'] == pg['id']]:
        x, y, w, h = pn['frame']
        rec = st.get(pn['id'])
        under = f"{ROOT}/assets/ep01/stage/underlay/{pn['id']}.jpg"
        art = {'rough': f"{ROOT}/assets/ep01/rough/panels/{pn['id']}.png", 'ink': f"{ROOT}/assets/ep01/ink/panels/{pn['id']}.png", 'finish': f"{ROOT}/assets/ep01/finish/panels/{pn['id']}.png"}.get(stage_kind)
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
        bl = place(w, h, heads, panel_items(pn), ink_density(pn['id'], w, h))
        for b in bl: draw_balloon(d, x, y, b)
        if stage_kind == 'name':
            d.text((x + 10, y + 8), f"{pn['id']}  {pn.get('枠の形と大きさ','')[:24]}", font=small, fill='#1a4fa0')
            memo = (pn.get('描く内容') or pn['name'])[:40]
            d.text((x + 10, y + h - 32), f"絵：{memo}", font=small, fill='#555555')
        record.append({'page': pg['id'], 'panel': pn['id'], 'frame': pn['frame'], 'balloons': [{k: v for k, v in b.items()} for b in bl]})
    d.text((990, 2770), f'{n:02d}', font=small, fill='#666666')
    page.save(f'{out}/page-{n:02d}.png')
json.dump(record, open(f'{out}/balloons.json', 'w'), ensure_ascii=False, indent=1)
print('pages', len(pages), 'balloons over a face:', [(r['panel'], b['dl']) for r in record for b in r['balloons'] if b['overlap']])
