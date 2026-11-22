#!/usr/bin/env python3
"""Design 原稿（漫画ページ）を組む。EPS（例 ep01,ep02）の話を、1 つの原稿に話ごとに 1 段ずつ並べる：rough-pages / ink-pages / finished-pages。
ページとコマの枠は、ネーム（docs/storyboard-pages.json）と同じ ID と位置。コマごとにレイヤーのグループを置き、
絵は画像要素（data URI）、吹き出しは1つずつ動かせるグループ（枠の path と文字）にする（手本：gulliver-manga の線画）。
usage: EPS=ep01,ep02 build-design.py {rough|ink|finish} BALLOONS_JSON OUT_JSON（BALLOONS_JSON の {EP} は話ごとに置き換える）
"""
import base64, io, json, math, os, sys
import balloon_shape
from PIL import Image
EP = os.environ.get('EP', 'ep01'); EPN = int(EP[2:])  # 話（ep01・ep02…）。ページは 1 話 8 ページずつ

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
kind, balloons_path, out_path = sys.argv[1:4]
sb = json.load(open(f'{ROOT}/docs/storyboard-pages.json'))
EPS = os.environ.get('EPS', EP).split(',')
VERTICAL = os.environ.get('WRITING', 'vertical') == 'vertical'  # 写植は縦書き（compose.py と同じ）
LETTER_FONT = 'GenEi Antique v6'  # 写植の書体：源暎アンチック v6（通常版。SIL OFL 1.1。assets/fonts/）。作者が決めた（2026-11-22）


def uri(path, size=None, fmt='PNG', mode=None, alpha_from_dark=False, quality=80):
    im = Image.open(path)
    if alpha_from_dark:  # 黒い線だけを残し、白を透明にする（レイヤーを重ねられるように）
        g = im.convert('L')
        if size: g = g.resize(size, Image.LANCZOS)
        a = g.point(lambda v: 255 - v)
        im = Image.merge('LA', (Image.new('L', g.size, 0), a))
    else:
        if mode: im = im.convert(mode)
        if size: im = im.resize(size, Image.LANCZOS)
    b = io.BytesIO(); im.save(b, fmt, **({'quality': quality} if fmt == 'JPEG' else {'optimize': True}))
    return f"data:image/{'jpeg' if fmt == 'JPEG' else 'png'};base64,{base64.b64encode(b.getvalue()).decode()}"


els = []
def add(e): els.append({'text': '', 'fill': 'none', **e}); return e['id']


def image(id_, name, parent, bounds, src, alt, source, extra=None):
    add({'id': id_, 'type': 'image', 'name': name, 'parentId': parent, 'bounds': bounds, 'src': src, 'alt': alt, 'imageFit': 'fill', 'locked': True, **(extra or {})})


def group(id_, name, parent, bounds, note, hidden=False, locked=True):
    e = {'id': id_, 'type': 'group', 'name': name, 'parentId': parent, 'bounds': bounds, 'text': note, 'locked': locked}
    if hidden: e['hidden'] = True
    add(e); return id_


def balloon(pid, b, ox, oy, n):
    """楕円（4つの cubic）と尾（三角）を1つの path、文字を text にし、グループにまとめる（LY-07・LY-08）。"""
    x, y, w, h = ox + b['x'], oy + b['y'], b['w'], b['h']
    gid = f"{pid}-LY07-{b['dl']}"
    pts = [(x, y, w, h)]
    minx, miny, maxx, maxy = x, y, x + w, y + h
    tail = None
    if b.get('tail'):
        tx, ty = ox + b['tail'][0], oy + b['tail'][1]
        cx, cy = x + w / 2, y + h / 2; ang = math.atan2(ty - cy, tx - cx); L = math.hypot(tx - cx, ty - cy)
        ex, ey = cx + math.cos(ang) * L, cy + math.sin(ang) * L; px, py = -math.sin(ang) * 18, math.cos(ang) * 18
        a1 = (cx + math.cos(ang) * (w / 2 - 4) + px, cy + math.sin(ang) * (h / 2 - 4) + py); a2 = (cx + math.cos(ang) * (w / 2 - 4) - px, cy + math.sin(ang) * (h / 2 - 4) - py)
        tail = [a1, (ex, ey), a2]
        for q in tail: minx, miny, maxx, maxy = min(minx, q[0]), min(miny, q[1]), max(maxx, q[0]), max(maxy, q[1])
    sid = f'b{n}'
    if b.get('thought'):  # 心の声：雲形と、話す人物へ向けた小さな丸 2 つ（balloon_shape.py。ページの画像と同じ形）
        segs = balloon_shape.cloud(x, y, w, h)
        circles = balloon_shape.dots(x, y, w, h, ox + b['tail'][0], oy + b['tail'][1]) if b.get('tail') else []
        xs = [q[0] for sg in segs for q in sg] + [c[0] - c[2] for c in circles] + [c[0] + c[2] for c in circles]
        ys = [q[1] for sg in segs for q in sg] + [c[1] - c[2] for c in circles] + [c[1] + c[2] for c in circles]
        fx, fy = min(xs), min(ys); fw, fh = max(xs) - fx, max(ys) - fy
        P = lambda q: {'x': round(q[0] - fx, 1), 'y': round(q[1] - fy, 1)}
        m = len(segs)
        subs = [{'id': f'{sid}c', 'closed': True, 'anchors': [{'id': f'{sid}c{i}', **P(sg[0]), 'mode': 'corner'} for i, sg in enumerate(segs)],
                 'segments': [{'id': f'{sid}h{i}', 'from': f'{sid}c{i}', 'to': f'{sid}c{(i + 1) % m}', 'type': 'cubic', 'c1': P(sg[1]), 'c2': P(sg[2])} for i, sg in enumerate(segs)]}]
        k = 0.5523
        for j, (qx, qy, r) in enumerate(circles):
            A = [(qx + r, qy), (qx, qy + r), (qx - r, qy), (qx, qy - r)]
            C = [((qx + r, qy + k * r), (qx + k * r, qy + r)), ((qx - k * r, qy + r), (qx - r, qy + k * r)), ((qx - r, qy - k * r), (qx - k * r, qy - r)), ((qx + k * r, qy - r), (qx + r, qy - k * r))]
            subs.append({'id': f'{sid}d{j}', 'closed': True, 'anchors': [{'id': f'{sid}d{j}a{i}', **P(a), 'mode': 'smooth'} for i, a in enumerate(A)],
                         'segments': [{'id': f'{sid}d{j}s{i}', 'from': f'{sid}d{j}a{i}', 'to': f'{sid}d{j}a{(i + 1) % 4}', 'type': 'cubic', 'c1': P(C[i][0]), 'c2': P(C[i][1])} for i in range(4)]})
    else:
        fx, fy, fw, fh = minx, miny, maxx - minx, maxy - miny
        k = 0.5523
        rx, ry, cx, cy = w / 2, h / 2, x + w / 2 - fx, y + h / 2 - fy
        A = [(cx + rx, cy), (cx, cy + ry), (cx - rx, cy), (cx, cy - ry)]
        C = [((cx + rx, cy + k * ry), (cx + k * rx, cy + ry)), ((cx - k * rx, cy + ry), (cx - rx, cy + k * ry)), ((cx - rx, cy - k * ry), (cx - k * rx, cy - ry)), ((cx + k * rx, cy - ry), (cx + rx, cy - k * ry))]
        subs = [{'id': f'{sid}e', 'closed': True, 'anchors': [{'id': f'{sid}e{i}', 'x': round(p[0], 1), 'y': round(p[1], 1), 'mode': 'smooth'} for i, p in enumerate(A)],
                 'segments': [{'id': f'{sid}g{i}', 'from': f'{sid}e{i}', 'to': f'{sid}e{(i + 1) % 4}', 'type': 'cubic', 'c1': {'x': round(C[i][0][0], 1), 'y': round(C[i][0][1], 1)}, 'c2': {'x': round(C[i][1][0], 1), 'y': round(C[i][1][1], 1)}} for i in range(4)]}]
        if tail:
            subs.append({'id': f'{sid}t', 'closed': True, 'anchors': [{'id': f'{sid}t{i}', 'x': round(q[0] - fx, 1), 'y': round(q[1] - fy, 1), 'mode': 'corner'} for i, q in enumerate(tail)],
                         'segments': [{'id': f'{sid}u{i}', 'from': f'{sid}t{i}', 'to': f'{sid}t{(i + 1) % 3}', 'type': 'line'} for i in range(3)]})
    bounds = {'x': round(fx, 1), 'y': round(fy, 1), 'width': round(fw, 1), 'height': round(fh, 1)}
    group(gid, f"LY-07 吹き出し {b['dl']}", pid, bounds, f"{b['dl']}（{b['who']}）の吹き出しと台詞。枠と文字を一緒に動かせる", locked=False)
    add({'id': f'{gid}-shape', 'type': 'shape', 'name': f"LY-07 吹き出しの枠 {b['dl']}", 'parentId': gid, 'bounds': bounds, 'fill': '#ffffff', 'stroke': '#000000', 'strokeWidth': 3,
         'path': {'frame': {'x': 0, 'y': 0, 'width': bounds['width'], 'height': bounds['height']}, 'fillRule': 'nonzero', 'subpaths': subs}})
    if VERTICAL:  # 縦書き：列（行）を右から左へ。文字の箱を楕円の中央に置き、はみ出すときは Editor が字を縮める（overflow: fit）
        tw, th = len(b['lines']) * 34 * 1.25 + 8, max(len(l) for l in b['lines']) * 34 + 8
        tb = {'x': round(x + (w - tw) / 2, 1), 'y': round(y + (h - th) / 2, 1), 'width': round(tw, 1), 'height': round(th, 1)}
        ty = {'fontFamily': LETTER_FONT, 'fontSize': 34, 'lineHeight': 1.25, 'padding': 2, 'overflow': 'fit', 'align': 'center', 'verticalAlign': 'middle', 'writingMode': 'vertical-rl'}
    else:
        tb = {'x': round(x + 20, 1), 'y': round(y + 14, 1), 'width': round(w - 40, 1), 'height': round(h - 28, 1)}
        ty = {'fontFamily': LETTER_FONT, 'fontSize': 34, 'lineHeight': 1.25, 'padding': 2, 'overflow': 'clip', 'align': 'center', 'verticalAlign': 'middle'}
    add({'id': f'{gid}-text', 'type': 'text', 'name': f"LY-08 文字 {b['dl']}", 'parentId': gid, 'bounds': tb,
         'text': '\n'.join(b['lines']), 'fill': '#000000', 'typography': ty})


pag = {'schemaVersion': 1, 'direction': 'rtl', 'pages': [], 'images': []}
n = 0
for EP in EPS:
  EPN = int(EP[2:])
  balloons = {r['panel']: r['balloons'] for r in json.load(open(balloons_path.replace('{EP}', EP)))}
  SIGNS = json.load(open(f'{ROOT}/assets/{EP}/sign-text.json')) if os.path.exists(f'{ROOT}/assets/{EP}/sign-text.json') else {}
  REC = {k: json.load(open(f'{ROOT}/assets/{EP}/{k}/{k}.json')) for k in ('rough', 'ink', 'finish') if os.path.exists(f'{ROOT}/assets/{EP}/{k}/{k}.json')}
  pages = sb['page'][(EPN - 1) * 8:EPN * 8]
  for pg in pages:
      px, py, pw, ph = pg['frame']
      add({'id': pg['id'], 'type': 'frame', 'name': pg['name'], 'bounds': {'x': px, 'y': py, 'width': pw, 'height': ph}, 'fill': '#ffffff', 'stroke': '#000000', 'strokeWidth': 2})
      ids = []
      for pn in [p for p in sb['panel'] if p['in'] == pg['id']]:
          x, y, w, h = pn['frame']; X, Y = px + x, py + y
          B = {'x': X, 'y': Y, 'width': w, 'height': h}
          add({'id': pn['id'], 'type': 'frame', 'name': pn['name'], 'parentId': pg['id'], 'bounds': B, 'stroke': '#000000', 'strokeWidth': 6})
          ids.append(pn['id']); P = pn['id']
          half = (round(w / 2), round(h / 2))
          under = f"{ROOT}/assets/{EP}/stage/underlay/{P}.jpg"
          r_rec = REC.get('rough', {}).get('panels', {}).get(P)
          g1 = group(f'{P}-LY01', 'LY-01 下描き', P, B, f"3D の舞台のカメラの絵（{pn.get('カメラの絵','')}）{'とラフの絵（' + r_rec['image'] + '、Codex）' if r_rec and kind != 'rough' else ''}。" + ('ラフでは見せる。' if kind == 'rough' else '線画・仕上げでは非表示で残す（出力しない）。'), hidden=(kind != 'rough'))
          image(f'{P}-LY01-3d', 'LY-01 下描き：3D のカメラの絵', g1, B, uri(under, half, 'JPEG', 'RGB', quality=70), f'{P} の 3D のカメラの絵', '3D', {'opacity': 0.25 if kind == 'rough' else 0.5})
          if kind == 'rough' and r_rec:
              image(f'{P}-LY01-rough', 'LY-01 下描き：ラフの絵（Codex）', g1, B, uri(f"{ROOT}/{r_rec['image']}", (w, h), 'PNG', 'L'), f'{P} のラフ', 'rough')
          elif kind != 'rough' and r_rec:
              image(f'{P}-LY01-rough', 'LY-01 下描き：ラフの絵（Codex）', g1, B, uri(f"{ROOT}/{r_rec['image']}", half, 'JPEG', 'L', quality=70), f'{P} のラフ', 'rough')
          if kind in ('ink', 'finish'):
              i_rec = REC['ink']['panels'][P]
              for ly, nm, key in (('LY02', 'LY-02 背景', 'bg'), ('LY05', 'LY-05 線画', 'fig'), ('LY06', 'LY-06 効果', 'fx')):
                  pth = i_rec['layers'].get(key)
                  note = f"線画（Codex、{REC['ink']['tool']}）を色のペンで分けたレイヤー。生の出力 sha256 {i_rec['raw_sha256'][:16]}…"
                  if kind == 'finish' and key == 'fig' and REC['finish']['panels'][P]['layers'].get('fig'):
                      pth = REC['finish']['panels'][P]['layers']['fig']; note += '。塗りつぶしの面は LY-03 ベタへ移した'
                  gid = group(f'{P}-{ly}', nm, P, B, note + ('' if pth else '。このコマには無い（記録のページを見る）'))
                  if pth: image(f'{P}-{ly}-img', nm, gid, B, uri(f'{ROOT}/{pth}', (w, h), 'PNG', alpha_from_dark=True), f'{P} の{nm}', 'ink')
          if kind == 'finish':
              f_rec = REC['finish']['panels'][P]
              for ly, nm, key in (('LY03', 'LY-03 ベタ', 'beta'), ('LY04', 'LY-04 トーン', 'tone')):
                  pth = f_rec['layers'].get(key)
                  gid = group(f'{P}-{ly}', nm, P, B, f"仕上げ（Codex）から線画との差で分けた{nm}。生の出力 sha256 {f_rec['raw_sha256'][:16]}…")
                  if pth: image(f'{P}-{ly}-img', nm, gid, B, uri(f'{ROOT}/{pth}', (w, h), 'PNG', alpha_from_dark=True), f'{P} の{nm}', 'finish')
          if kind != 'ink':  # 線画の段階は吹き出しを置かない（画作りガイドのレイヤーの決まり）
              for b in balloons.get(P, []):
                  n += 1; balloon(P, b, X, Y, n)
              for j, sg in enumerate(SIGNS.get(P, []), 1):  # 絵の中の字（assets/{EP}/sign-text.json）：吹き出しの無い文字だけ
                  fs = sg.get('fontSize', 34)
                  add({'id': f'{P}-LY07-SIGN{j}-text', 'type': 'text', 'name': f"LY-08 絵の中の字 {sg['text']}", 'parentId': P,
                       'bounds': {'x': round(X + sg['at'][0] * w, 1), 'y': round(Y + sg['at'][1] * h, 1), 'width': round(sg['size'][0] * w, 1), 'height': round(sg['size'][1] * h, 1)},
                       'text': sg['text'], 'fill': '#000000', 'typography': {'fontFamily': LETTER_FONT, 'fontSize': fs, 'lineHeight': 1.1, 'padding': 2, 'overflow': 'clip', 'align': 'center', 'verticalAlign': 'middle'}})
      pag['pages'].append({'frameId': pg['id'], 'panelIds': ids})
  # 記録のページ（ページ割りの外）：成果物の見出しごとの記録
  NOTES = json.load(open(f'{ROOT}/assets/{EP}/{kind}-record.json'))
  nx, ny = min(p['frame'][0] for p in pages) - 2400, pages[0]['frame'][1]
  NID = f'NOTE-{kind}' if EP == 'ep01' else f'NOTE-{kind}-{EP}'
  add({'id': NID, 'type': 'frame', 'name': NOTES['title'], 'bounds': {'x': nx, 'y': ny, 'width': 2000, 'height': 2828}, 'fill': '#ffffff', 'stroke': '#888888', 'strokeWidth': 2})
  yy = ny + 60
  for i, (hd, body) in enumerate(NOTES['sections']):
      add({'id': f'{NID}-h{i}', 'type': 'text', 'name': f'見出し：{hd}', 'parentId': NID, 'bounds': {'x': nx + 60, 'y': yy, 'width': 1880, 'height': 60}, 'text': hd, 'fill': '#000000', 'typography': {'fontSize': 44, 'lineHeight': 1.2, 'padding': 2, 'overflow': 'clip', 'align': 'left', 'verticalAlign': 'top'}})
      hgt = 40 + 32 * sum(1 + len(l) // 56 for l in body.split('\n'))
      add({'id': f'{NID}-b{i}', 'type': 'text', 'name': f'本文：{hd}', 'parentId': NID, 'bounds': {'x': nx + 60, 'y': yy + 70, 'width': 1880, 'height': hgt}, 'text': body, 'fill': '#000000', 'typography': {'fontSize': 26, 'lineHeight': 1.25, 'padding': 2, 'overflow': 'clip', 'align': 'left', 'verticalAlign': 'top'}})
      yy += 70 + hgt + 40
# 重ね順：ベタ・トーンは線画の下に（要素の並び＝描く順）。並びを LY の順にそろえる
order = {'LY01': 1, 'LY02': 2, 'LY03': 3, 'LY04': 4, 'LY05': 5, 'LY06': 6, 'LY07': 7}
def rank(e):
    for k, v in order.items():
        if f'-{k}' in e['id']: return v
    return 0
els = sorted(els, key=lambda e: (0 if e['type'] == 'frame' else 1, rank(e)))
doc = {'schemaVersion': 3, 'pagination': pag, 'elements': els, 'components': []}
open(out_path, 'w').write(json.dumps(doc, ensure_ascii=False))
print(out_path, len(els), 'elements', round(os.path.getsize(out_path) / 1e6, 1), 'MB')
