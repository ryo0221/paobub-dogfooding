#!/usr/bin/env python3
"""3D の舞台の書き出し（STAGE_OUT）から、ネームの材料を作る（手本：gulliver-manga part1/name/src/stage-assets.py）。
- コマの枠の形に切り抜いたカメラの絵：OUT/underlay/<PN>.jpg
- 真上からの配置図：OUT/plans/<PN>.svg
- コマごとの記録（カメラ・人物・主役が枠に入るか）：OUT/ep01-stage.json
usage: stage-assets.py STAGE_OUT STORYBOARD_JSON OUT
"""
import json, math, os, sys
from PIL import Image
stage_dir, sb_path, out = sys.argv[1:4]
VFOV = 35.0
sb = json.load(open(sb_path))
panels = {p['id']: p for p in sb['panel']}
figs = {}
for f in sb['figure']: figs.setdefault(f['in'], []).append(f)
os.makedirs(f'{out}/underlay', exist_ok=True); os.makedirs(f'{out}/plans', exist_ok=True)
FIG2CH = {'nemu': 'CH-01', 'suzu': 'CH-02', 'takeshi': 'CH-03', 'reika': 'CH-04', 'tanahashi': 'CH-05'}
HIPZ = {}  # pose → (sitting?)
SIT = ('kotatsu', 'seiza', 'chair')

def sub(a, b): return [a[i] - b[i] for i in range(3)]
def dot(a, b): return sum(a[i] * b[i] for i in range(3))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def nrm(a):
    n = math.sqrt(dot(a, a)); return [x / n for x in a]

def project(cam, look, p, cw, ch):
    f = nrm(sub(look, cam)); r = nrm(cross(f, [0, 0, 1])); u = cross(r, f)
    d = sub(p, cam); z = dot(d, f)
    if z <= 0: return None
    t = math.tan(math.radians(VFOV / 2))
    x = dot(d, r) / (z * t) * (ch / cw); y = dot(d, u) / (z * t)
    return ((x + 1) / 2 * cw, (1 - y) / 2 * ch)

def head(place, h):
    pose = place['pose']
    if pose.startswith('kotatsu'): base = 0.06 * h + 60
    elif pose.startswith('seiza'): base = 0.16 * h + 60
    elif pose.startswith('chair'): base = 470
    else: base = 0.38 * h
    return [place['at'][0], place['at'][1], base + 0.475 * h]

records = []
for set_id in ['council', 'club']:
    st = json.load(open(f'{stage_dir}/{set_id}/stage.json'))
    cw, ch = st['canvas']['width'], st['canvas']['height']
    heights = {a['id']: a['heightMm'] for a in st['actors']}
    for s in st['shots']:
        pn = panels[s['panel']]; fw, fh = pn['frame'][2], pn['frame'][3]
        im = Image.open(f"{stage_dir}/{set_id}/{s['panel']}.png").convert('RGB')
        iw, ih = im.size; aspect = fw / fh
        if aspect >= iw / ih: w, hh = iw, iw / aspect
        else: w, hh = ih * aspect, ih
        box = ((iw - w) / 2, (ih - hh) / 2, (iw + w) / 2, (ih + hh) / 2)
        im.crop(tuple(round(v) for v in box)).resize((round(fw / 2), round(fh / 2))).save(f"{out}/underlay/{s['panel']}.jpg", quality=88)
        hfov = 2 * math.degrees(math.atan(math.tan(math.radians(VFOV / 2)) * w / ih)); vfov = 2 * math.degrees(math.atan(math.tan(math.radians(VFOV / 2)) * hh / ih))
        sx, sy = iw / cw, ih / ch
        people = []
        fgs = figs.get(s['panel'], [])
        for p in s['places']:
            hc = head(p, heights[p['fig']]); hp = project(s['cam'], s['look'], hc, iw, ih)
            top = project(s['cam'], s['look'], [hc[0], hc[1], hc[2] + 0.13 * heights[p['fig']]], iw, ih)
            hr = round(math.dist(hp, top) / hh, 3) if hp and top else None
            inside = bool(hp) and box[0] <= hp[0] <= box[2] and box[1] <= hp[1] <= box[3]
            fg = [f['id'] for f in fgs if f['who'] == FIG2CH[p['fig']]]
            people.append({'fg': fg[0] if fg else None, 'who': FIG2CH[p['fig']], 'at_mm': p['at'], 'facing_deg': round(math.degrees(p['facing']), 1), 'pose': p['pose'],
                           'head_in_frame': inside, 'head_at': [round((hp[0] - box[0]) / w, 3), round((hp[1] - box[1]) / hh, 3)] if hp else None, 'head_r': hr})
        HANDS = {f['id'] for f in fgs if f.get('描写する範囲') in ('手元',)}  # 手元だけを描く配置は顔を枠に入れない（描写する範囲）
        missing = [f['id'] for f in fgs if not any(x['fg'] == f['id'] for x in people)]
        records.append({'panel': s['panel'], 'set': set_id, 'model': st['model'], 'cam_mm': s['cam'], 'look_mm': s['look'], 'fov_deg': [round(hfov, 1), round(vfov, 1)], 'note': s.get('note'),
                        'people': people, 'fg_not_staged': missing, 'subjects_framed': all(x['head_in_frame'] or x['fg'] in HANDS for x in people if x['fg']), 'hands_only': [x['fg'] for x in people if x['fg'] in HANDS]})
        # 配置図
        pts = [s['cam'][:2], s['look'][:2]] + [p['at'][:2] for p in s['places']]
        xs = [q[0] for q in pts]; ys = [q[1] for q in pts]
        span = max(max(xs) - min(xs), max(ys) - min(ys), 3000) * 1.4; cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        S = 360; k = S / span; X = lambda x: (x - cx) * k + S / 2; Y = lambda y: S / 2 - (y - cy) * k
        el = [f'<rect width="{S}" height="{S}" fill="#fff"/>']
        for b in st['set']['boxes']:
            if b['s'][2] < 60 and b['name'] not in ('こたつの天板',): continue
            if b['c'][2] - b['s'][2] / 2 > 2500: continue
            x0, y0 = b['c'][0] - b['s'][0] / 2, b['c'][1] + b['s'][1] / 2
            el.append(f'<rect x="{X(x0):.1f}" y="{Y(y0):.1f}" width="{b["s"][0]*k:.1f}" height="{b["s"][1]*k:.1f}" fill="#ddd" stroke="#999" stroke-width="0.5"/>')
        cam, look = s['cam'], s['look']
        ang = math.atan2(look[1] - cam[1], look[0] - cam[0]); L = span
        for a in (ang - math.radians(hfov / 2), ang + math.radians(hfov / 2)):
            el.append(f'<line x1="{X(cam[0]):.1f}" y1="{Y(cam[1]):.1f}" x2="{X(cam[0]+L*math.cos(a)):.1f}" y2="{Y(cam[1]+L*math.sin(a)):.1f}" stroke="#2b6cb0" stroke-width="1"/>')
        el.append(f'<rect x="{X(cam[0])-5:.1f}" y="{Y(cam[1])-5:.1f}" width="10" height="10" fill="#2b6cb0"/>')
        el.append(f'<circle cx="{X(look[0]):.1f}" cy="{Y(look[1]):.1f}" r="3" fill="none" stroke="#2b6cb0"/>')
        for p, rec in zip(s['places'], people):
            x, y = X(p['at'][0]), Y(p['at'][1]); fx, fy = -math.sin(p['facing']), math.cos(p['facing'])
            el.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="#c53030"/><line x1="{x:.1f}" y1="{y:.1f}" x2="{x+14*fx:.1f}" y2="{y-14*fy:.1f}" stroke="#c53030" stroke-width="2"/>')
            el.append(f'<text x="{x+9:.1f}" y="{y-9:.1f}" font-size="11" font-family="sans-serif">{rec["who"]}</text>')
        el.append(f'<text x="6" y="16" font-size="12" font-family="sans-serif">{s["panel"]}（北が上・青がカメラと水平の視野）</text>')
        open(f"{out}/plans/{s['panel']}.svg", 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}">{"".join(el)}</svg>')
json.dump({'sets': ['council', 'club'], 'panels': records}, open(f'{out}/ep01-stage.json', 'w'), ensure_ascii=False, indent=1)
bad = [r['panel'] for r in records if not r['subjects_framed']]
print(len(records), 'panels; subjects not framed:', bad, '; FG not staged:', [(r['panel'], r['fg_not_staged']) for r in records if r['fg_not_staged']])
