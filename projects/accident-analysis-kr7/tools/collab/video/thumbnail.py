# YouTube のサムネイル（1280x720）。2 人の録画から、相手の引用が見えた瞬間の画面を 1 枚ずつ取り出して並べる。
# 使い方: VIDEO_WORK=<録画の置き場（DEMO_OUT）> FONT_DIR=<noto-sans-jp package> python thumbnail.py out.png
import os, sys, glob, json, subprocess, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1280, 720
WORK = os.environ['VIDEO_WORK']; FONT_DIR = os.environ['FONT_DIR']; os.chdir(WORK)
F = lambda w, s: ImageFont.truetype(glob.glob(f'{FONT_DIR}/{w}/*.ttf')[0], s)
M = json.load(open('marks.json')); MK = dict(M['marks']); OFF = M['off']
def frame(side, mark, out):
    v = glob.glob(f'{side}/*.webm')[0]
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{MK[mark] - OFF[side] + 0.3:.3f}', '-i', v, '-frames:v', '1', out], check=True)
    return out
g = np.linspace(0, 1, W)[None, :] * 0.55 + np.linspace(0, 1, H)[:, None] * 0.45
bg = (np.array([30, 27, 75])[None, None, :] * (1 - g[..., None]) + np.array([67, 56, 202])[None, None, :] * g[..., None]).astype(np.uint8)
def inset(path, size, angle, col, name):
    s = Image.open(path).convert('RGBA').crop((0, 0, 1600, 900)).resize(size, Image.LANCZOS)
    fr = Image.new('RGBA', (size[0] + 12, size[1] + 12), col + (255,)); fr.paste(s, (6, 6))
    d = ImageDraw.Draw(fr); t = name; w = d.textlength(t, font=F('800ExtraBold', 26)) + 32
    d.rounded_rectangle((6, 6, 6 + w, 50), 10, fill=col + (255,)); d.text((22, 28), t, font=F('800ExtraBold', 26), fill='white', anchor='lm')
    sh = Image.new('RGBA', (fr.width + 40, fr.height + 40), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle((20, 20, fr.width + 20, fr.height + 20), fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(12)); sh.paste(fr, (14, 10), fr)
    return sh.rotate(angle, expand=True, resample=Image.BICUBIC)
a = inset(frame('a', 'a-sees', 'thumb-a.png'), (560, 315), 3, (219, 39, 119), '森さんの画面')
b = inset(frame('b', 'b-sees', 'thumb-b.png'), (560, 315), -3, (2, 132, 199), '工藤さんの画面')
im = Image.fromarray(bg).convert('RGBA')
im.alpha_composite(a, (660, 30)); im.alpha_composite(b, (610, 345))
d = ImageDraw.Draw(im)
d.text((52, 60), '2社で', font=F('900Black', 112), fill='white')
d.text((52, 200), '同時に', font=F('900Black', 150), fill=(253, 224, 71))
x, y = 56, 430
for i, (t, c) in enumerate([('FMEA', (219, 234, 254)), ('FTA', (224, 231, 255))]):
    w = d.textlength(t, font=F('700Bold', 34)) + 36
    d.rounded_rectangle((x, y, x + w, y + 58), 14, fill=c); d.text((x + 18, y + 29), t, font=F('700Bold', 34), fill=(30, 27, 75), anchor='lm')
    x += w + 16
d.text((56, 530), '話しながら根拠を選ぶ', font=F('700Bold', 38), fill=(224, 231, 255))
d.text((56, 584), '選んだ人と版が残る', font=F('700Bold', 38), fill=(224, 231, 255))
d.text((56, 676), 'PaoBub', font=F('800ExtraBold', 30), fill=(199, 210, 254))
im.convert('RGB').save(sys.argv[1] if len(sys.argv) > 1 else 'thumbnail.png')
