#!/usr/bin/env python3
"""Codex の生の出力（WORK/<PN>/raw.png）を、余白を除いてコマの枠に切り戻し、assets/{EP}/<kind>/panels/<PN>.png にする。
記録（道具と版・渡した参照・生の出力の sha256・プロンプト）を assets/{EP}/<kind>/<kind>.json に書く（手本：rough-assets.py）。
usage: panel-assets.py {rough|ink|finish} WORK
"""
import hashlib, json, os, subprocess, sys
from PIL import Image
EP = os.environ.get('EP', 'ep01'); EPN = int(EP[2:])  # 話（ep01・ep02…）。ページは 1 話 8 ページずつ

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
kind, work = sys.argv[1], sys.argv[2]
OUT = f'{ROOT}/assets/{EP}/{kind}'
os.makedirs(f'{OUT}/panels', exist_ok=True); os.makedirs(f'{OUT}/prompts', exist_ok=True)
rec_path = f'{OUT}/{kind}.json'
rec = json.load(open(rec_path)) if os.path.exists(rec_path) else {'tool': None, 'panels': {}}
ver = subprocess.run(['codex', '--version'], capture_output=True, text=True).stdout.strip()
rec['tool'] = f'{ver}（Codex CLI の画像生成。画像のモデル名は出力に出ない）'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
done = []


def save_layer(pn, key, mask, size):
    """mask（L、255＝線）を白地に黒の線の PNG にする。中身が無ければ None。"""
    if mask.getbbox() is None or sum(1 for v in mask.get_flattened_data() if v > 128) < 40: return None
    os.makedirs(f'{OUT}/layers/{pn}', exist_ok=True)
    out = mask.point(lambda v: 255 - v)
    out.save(f'{OUT}/layers/{pn}/{key}.png', optimize=True)
    return f'assets/{EP}/{kind}/layers/{pn}/{key}.png'


def split(kind, pn, rgb):
    """ink：三色のペン（黒＝人物 LY-05、青＝背景 LY-02、赤＝効果 LY-06）で分ける。
    finish：線画（assets/{EP}/ink/panels）との差で、増えた暗い所を ベタ（ほぼ黒）と トーン（中間）に分ける。"""
    w, h = rgb.size
    px = rgb.load()
    if kind == 'ink':
        m = {k: Image.new('L', (w, h), 0) for k in ('fig', 'bg', 'fx')}
        P = {k: m[k].load() for k in m}
        for y in range(h):
            for x in range(w):
                r, g, b = px[x, y]
                dark = 255 - min(r, g, b)
                if max(r, g, b) < 110: P['fig'][x, y] = 255  # 黒
                elif b > r + 60 and b > g + 60: P['bg'][x, y] = min(255, (b - max(r, g)) + 40)  # 青
                elif r > g + 60 and r > b + 60: P['fx'][x, y] = min(255, (r - max(g, b)) + 40)  # 赤
                elif dark > 60: P['fig'][x, y] = dark  # 色の付かない灰色の線は人物へ寄せる
        return {k: save_layer(pn, k, m[k], (w, h)) for k in m}
    if kind == 'finish':
        import numpy as np
        from PIL import ImageFilter
        ink = Image.open(f'{ROOT}/assets/{EP}/ink/panels/{pn}.png').convert('L').resize((w, h))
        near_line = np.array(ink.filter(ImageFilter.MinFilter(5))) < 150  # 線画の線の近く（少しのずれを許す）
        g = rgb.convert('L')
        dark = np.array(g) < 140
        blur = lambda m, r: np.array(Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.BoxBlur(r))) / 255
        beta = dark & (blur(dark, 4) > 0.85)  # ほぼ塗りつぶしの面＝ベタ（線画で塗った黒髪も含む。太い線は入らない）
        tone = (np.array(g) < 210) & ~near_line & ~beta  # 仕上げで増えた、塗りつぶしでない濃い所＝網点のトーン
        to_img = lambda m: Image.fromarray((m * 255).astype('uint8'))
        # LY-05 線画：線画の人物の線から、ベタに移した面を抜く（輪郭は残す）
        fig_p = f'{ROOT}/assets/{EP}/ink/layers/{pn}/fig.png'
        fig = None
        if os.path.exists(fig_p):
            f = np.array(Image.open(fig_p).convert('L').resize((w, h))) < 128
            inner = np.array(to_img(beta).filter(ImageFilter.MinFilter(5))) > 128
            fig = save_layer(pn, 'fig', to_img(f & ~inner), (w, h))
        return {'beta': save_layer(pn, 'beta', to_img(beta), (w, h)), 'tone': save_layer(pn, 'tone', to_img(tone), (w, h)), 'fig': fig}
    return {}
for pn in sorted(os.listdir(work)):
    D = f'{work}/{pn}'
    if not os.path.exists(f'{D}/raw.png'): continue
    raw_sha = sha(f'{D}/raw.png')
    if rec['panels'].get(pn, {}).get('raw_sha256') == raw_sha: continue
    fr = json.load(open(f'{D}/frame.json'))
    im = Image.open(f'{D}/raw.png').convert('RGB')
    cw, ch = fr['canvas']; sx, sy = im.size[0] / cw, im.size[1] / ch
    x0, y0, x1, y1 = fr['box']
    rgb = im.crop((round(x0 * sx), round(y0 * sy), round(x1 * sx), round(y1 * sy))).resize(tuple(fr['frame']), Image.LANCZOS)
    rgb.convert('L').point(lambda v: 0 if v < 200 else v).save(f'{OUT}/panels/{pn}.png', optimize=True) if kind == 'ink' else rgb.convert('L').save(f'{OUT}/panels/{pn}.png', optimize=True)
    layers = split(kind, pn, rgb)
    open(f'{OUT}/prompts/{pn}.txt', 'w').write(open(f'{D}/prompt.txt').read())
    refs = [l.split('\t') for l in open(f'{D}/refs.txt').read().splitlines() if l.strip()] if os.path.exists(f'{D}/refs.txt') else []
    old = rec['panels'].get(pn)
    rec['panels'][pn] = {
        'image': f'assets/{EP}/{kind}/panels/{pn}.png', 'sha256': sha(f'{OUT}/panels/{pn}.png'), 'raw_sha256': raw_sha,
        'prompt': f'assets/{EP}/{kind}/prompts/{pn}.txt',
        'inputs': [{'what': '構図（1枚目）', 'path': {'rough': f'assets/{EP}/stage/underlay/{pn}.jpg', 'ink': f'assets/{EP}/rough/panels/{pn}.png', 'finish': f'assets/{EP}/ink/panels/{pn}.png'}[kind]}] + [{'what': w, 'path': os.path.relpath(p, ROOT) if p.startswith(ROOT) else f'（3D のカメラの絵）assets/{EP}/stage/underlay/{pn}.jpg'} for p, w in refs],
        'license': '自作（このプロジェクトの 3D の舞台・設定画・ラフから生成。外部の作品・写真は渡していない）',
        'layers': layers,
        'retakes': (old.get('retakes', []) + [{'raw_sha256': old['raw_sha256']}]) if old else [],
    }
    done.append(pn)
json.dump(rec, open(rec_path, 'w'), ensure_ascii=False, indent=1)
print(kind, 'updated', done)
