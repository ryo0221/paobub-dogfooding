#!/usr/bin/env python3
"""コマごとの Codex への説明を作る（手本：gulliver-manga part1/rough/src/rough-briefs.py）。
usage: briefs.py {rough|ink|finish} WORK_DIR
WORK_DIR/<PN>/ に head.txt・brief.txt・layout.png（生成の大きさに灰色の余白で合わせた絵）・refs.txt・frame.json を書く。
- rough ：layout は 3D のカメラの絵。人物の設定画を渡す。
- ink   ：layout は採ったラフ（assets/{EP}/rough/panels）。2枚目に 3D のカメラの絵、続けて設定画。
- finish：layout は線画（assets/{EP}/ink/panels）。トーンとベタだけを足す。
"""
import json, os, re, sys
from PIL import Image
EP = os.environ.get('EP', 'ep01'); EPN = int(EP[2:])  # 話（ep01・ep02…）。ページは 1 話 8 ページずつ

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
kind, work = sys.argv[1], sys.argv[2]
sb = json.load(open(f'{ROOT}/docs/storyboard-pages.json'))
st = {r['panel']: r for r in json.load(open(f'{ROOT}/assets/{EP}/stage/{EP}-stage.json'))['panels']}
cs = {r['id']: r for r in json.load(open(f'{ROOT}/docs/character-sheet.json'))['rows']}
SHEET = {'CH-01': 'nemu', 'CH-02': 'suzu', 'CH-03': 'takeshi', 'CH-04': 'reika', 'CH-05': 'tanahashi'}
SHEETS = f'{ROOT}/assets/character'
figs = {}
for f in sb['figure']: figs.setdefault(f['in'], []).append(f)
CONT = json.load(open(f'{ROOT}/assets/{EP}/continuity.json'))
ONLY = os.environ.get('ONLY', '').split(',') if os.environ.get('ONLY') else None
NOTES = json.load(open(f'{ROOT}/assets/{EP}/{kind}-notes.json')) if os.path.exists(f'{ROOT}/assets/{EP}/{kind}-notes.json') else {}

HEAD = {
 'rough': """Use your image generation tool. Make ONE image: a manga ROUGH (ラフ) for one panel of a Japanese school gag-comedy manga, drawn the way a manga artist roughs a panel before inking.
Style: loose but clear grey pencil lines on white paper, monochrome only, no colour, no finished rendering. Characters are cute super-deformed, exactly 4 heads tall (4頭身), big heads, small simple hands and feet. Faces must show the direction of the face and the expression; bodies must show the pose with readable joints; hands and contacts must be clear.
The FIRST attached image fixes the composition: it is a 3D stand-in made of blocks seen through the panel's camera. Keep its camera angle, horizon, perspective, and where each figure and object sits and how big it is in the frame. Redraw the blocky stand-ins as the real characters and a real Japanese high-school room (walls, windows, furniture, floor) — draw the background too, not only the people. Grey margins around the image are padding: leave them empty.
""",
 'ink': """Use your image generation tool. Make ONE image: the clean INK LINE ART (線画) of one panel of a Japanese school gag-comedy manga.
Style: professional manga line art on pure white, drawn with THREE pure pen colours so the layers can be separated afterwards (手本：gulliver-manga の三色の線画):
- PURE BLACK (#000000) for the characters and everything they wear or hold (outlines thicker and slightly rounded, inner lines thinner); solid black only on hair that the model sheet shows as black;
- PURE BLUE (#0000FF) for the whole background: room, walls, windows, furniture, floor, props not held by a character (thin, clean lines, simpler than the figures, AR-03);
- PURE RED (#FF0000) only for manga effect marks (speed lines, impact or emotion marks, sweat drops, steam); omit red if the panel needs no effect.
Never mix the colours on one object; no grey, no screentone, no shading, no other colours (tone comes later). Characters are cute super-deformed, exactly 4 heads tall.
The FIRST attached image is the approved pencil ROUGH of this panel: trace it — keep exactly its composition, poses, faces and expressions, and where everything sits. The SECOND attached image is the 3D camera view of the same panel: use it for perspective and proportions of the room and furniture. Draw the background (room, windows, furniture) in every panel unless told otherwise. Grey margins are padding: leave them empty.
""",
 'finish': """Use your image generation tool. Make ONE image: the FINISHED black-and-white manga panel (仕上げ) from the attached ink line art, for a Japanese school gag-comedy manga printed in monochrome.
Keep EVERY line of the FIRST attached image exactly where it is (same drawing, same size, same composition); only add: solid black fills (ベタ) on black hair, and ONE kind of light dot screentone (網点) on the dark school blazers and on shadows where it helps the mood. Per character (model sheets, AR-04/AR-08): Nemu, Suzu, Reika and Tanahashi have solid black hair; the tall boy Takeshi (long fringe hiding his eyes) has NO black at all, only a lighter dot tone on his hair and uniform. Keep faces, skin, shirts and most of the background white. No colour, no grey gradients, no new objects, no text. Grey margins are padding: leave them empty.
""",
}
TAIL = "No text, no letters, no speech balloons, no sound effects, no panel border, no signature, no watermark. No likeness to any existing anime, manga, game or illustration character."
ROOM = {
 'council': "this is the STUDENT COUNCIL ROOM (生徒会室), NOT the clubroom: conference desks in a U shape (コの字) opening to the east, the president's seat at the west end with the west windows behind her, chairs along the desks, steel shelves of club files along the north wall, a whiteboard on the east wall. There is NO kotatsu, NO cushions and NO sink in this room",
 'club': "this is the CLUBROOM (部室, a former science prep room): a kotatsu in the middle with floor cushions on its four sides, a sink on the west wall, a steel shelf on the east wall, two notices on the north wall, the sliding door at the west end of the north wall, two windows on the south wall",
 'corridor': "this is the old school building's 3rd-floor CORRIDOR (旧校舎3階の廊下): a long corridor with windows along the north side, classroom sliding doors along the south side; the clubroom door is slightly open with a paper notice taped on it",
}
os.makedirs(work, exist_ok=True)
for pn in sb['panel']:
    if pn['in'] not in [p['id'] for p in sb['page'][(EPN - 1) * 8:EPN * 8]]: continue
    if ONLY and pn['id'] not in ONLY: continue
    D = f"{work}/{pn['id']}"; os.makedirs(D, exist_ok=True)
    rec = st[pn['id']]
    fw, fh = pn['frame'][2], pn['frame'][3]
    a = fw / fh
    cw, chh = (1536, 1024) if a > 1.25 else ((1024, 1536) if a < 0.8 else (1024, 1024))
    src = {'rough': f"{ROOT}/assets/{EP}/stage/underlay/{pn['id']}.jpg", 'ink': f"{ROOT}/assets/{EP}/rough/panels/{pn['id']}.png", 'finish': f"{ROOT}/assets/{EP}/ink/panels/{pn['id']}.png"}[kind]
    im = Image.open(src).convert('RGB')
    s = min(cw / fw, chh / fh); w, h = round(fw * s), round(fh * s)
    canvas = Image.new('RGB', (cw, chh), (128, 128, 128)); ox, oy = (cw - w) // 2, (chh - h) // 2
    canvas.paste(im.resize((w, h)), (ox, oy)); canvas.save(f'{D}/layout.png')
    json.dump({'canvas': [cw, chh], 'box': [ox, oy, ox + w, oy + h], 'frame': [fw, fh]}, open(f'{D}/frame.json', 'w'))
    refs = []
    if kind == 'ink':
        u = Image.open(f"{ROOT}/assets/{EP}/stage/underlay/{pn['id']}.jpg").convert('RGB'); c2 = Image.new('RGB', (cw, chh), (128, 128, 128)); c2.paste(u.resize((w, h)), (ox, oy)); c2.save(f'{D}/camera.png')
        refs.append((f'{D}/camera.png', 'the 3D camera view of this panel (perspective and proportions only)'))
    whos = []
    for p in rec['people']:
        if p['who'] not in whos: whos.append(p['who'])
    if kind != 'finish':
        for w_ in whos: refs.append((f"{SHEETS}/{SHEET[w_]}.png", f"the model sheet (front, side, back) of {cs[w_]['name']}"))
    # 人物ごとの説明：3D のカメラに写る位置と向き
    lines = []
    for f in figs.get(pn['id'], []):
        p = next((x for x in rec['people'] if x['fg'] == f['id']), None)
        where = ''
        if p and p['head_at']:
            hx, hy = p['head_at']
            where = f"head at {round(hx*100)}% from the left and {round(hy*100)}% from the top of the panel"
            if not p['head_in_frame']: where += ' (outside the frame: draw only the part inside)'
        name = cs[f['who']]['name']
        lines.append(f"- {f['id']} {name}: {where}. 向き：{f.get('向き')}。姿勢：{f.get('姿勢')}。表情：{f.get('表情')}。描写する範囲：{f.get('描写する範囲')}。")
    extra = [x for x in rec['people'] if not x['fg'] and x['head_in_frame']]
    for x in extra:
        lines.append(f"- (also in the room, small, not the subject) {cs[x['who']]['name']}: head at {round(x['head_at'][0]*100)}% / {round(x['head_at'][1]*100)}%.")
    scene = pn.get('描くシーン'); cont = CONT.get(scene, {})
    say = re.sub(r'DL-\d+ ', '', pn.get('入れる台詞') or '')
    brief = f"""Panel {pn['id']}（{pn['name']}）. Place: {pn.get('描く場所')}. Scene {scene}.
What the panel shows: {pn.get('描く内容') or pn['name']}. Pacing: {pn.get('間')}.
Camera: exactly as in the 3D camera view ({pn.get('画角')}){'; ' + rec['note'] if rec.get('note') else ''}.
Dialogue in this panel (do NOT write it; leave some calm space for balloons, away from faces): {say}
People:
""" + '\n'.join(lines) + f"""
Continuity for this scene（続く状態）: {cont.get('state','')}
Art rules: AR-02 4頭身; AR-05 {ROOM.get(rec['set'].rstrip('0123456789') if pn.get('描く場所','').find('LO-02') < 0 else 'corridor')}; AR-06 gag faces only where the 表情 says 崩し顔.
""" + (NOTES.get(pn['id'], '') and f"Correction from the author's check: {NOTES[pn['id']]}\n") + TAIL + f"\n{'Landscape' if cw > chh else ('Portrait' if cw < chh else 'Square')} {cw}x{chh}."
    open(f'{D}/head.txt', 'w').write(HEAD[kind]); open(f'{D}/brief.txt', 'w').write(brief)
    open(f'{D}/refs.txt', 'w').write(''.join(f'{p}\t{w}\n' for p, w in refs))
print('briefs written to', work)
