# YouTube のサムネイル（1280x720）。録画の確かめの画面（shots/）と Noto Sans JP から作る。
# 使い方: VIDEO_WORK=<録画の置き場（DEMO_OUT）> FONT_DIR=<noto-sans-jp package> python thumbnail.py out.png
import os, sys, glob, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W, H = 1280, 720
WORK = os.environ['VIDEO_WORK']; FONT_DIR = os.environ['FONT_DIR']
F = lambda w, s: ImageFont.truetype(glob.glob(f'{FONT_DIR}/{w}/*.ttf')[0], s)
g = np.linspace(0, 1, W)[None, :] * 0.55 + np.linspace(0, 1, H)[:, None] * 0.45
bg = (np.array([30, 27, 75])[None, None, :] * (1 - g[..., None]) + np.array([67, 56, 202])[None, None, :] * g[..., None]).astype(np.uint8)
# 右：受け入れの窓（規則に無い引用で止まる）と FTA の候補
def inset(path, box, size, angle):
    s = Image.open(path).convert('RGBA').crop(box).resize(size, Image.LANCZOS)
    frame = Image.new('RGBA', (size[0] + 12, size[1] + 12), (255, 255, 255, 255)); frame.paste(s, (6, 6))
    sh = Image.new('RGBA', (frame.width + 40, frame.height + 40), (0, 0, 0, 0)); ImageDraw.Draw(sh).rectangle((20, 20, frame.width + 20, frame.height + 20), fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(12)); sh.paste(frame, (14, 10), frame)
    return sh.rotate(angle, expand=True, resample=Image.BICUBIC)
shots = os.path.join(WORK, 'shots')
a = inset(glob.glob(f'{shots}/*-fta-be01.png')[0], (380, 320, 1900, 1000), (620, 278), 3)
b = inset(glob.glob(f'{shots}/*-rule-blocked.png')[0], (965, 300, 1610, 610), (560, 266), -4)
im2 = Image.fromarray(bg).convert('RGBA')
im2.alpha_composite(a, (640, 70)); im2.alpha_composite(b, (690, 370))
d = ImageDraw.Draw(im2)
d.rounded_rectangle((1010, 610, 1250, 676), 18, fill=(220, 38, 38))
d.text((1130, 642), '規則外は止める', font=F('800ExtraBold', 30), fill='white', anchor='mm')
d.text((52, 60), '事故分析を', font=F('900Black', 112), fill='white')
d.text((52, 200), 'つなぐ', font=F('900Black', 150), fill=(253, 224, 71))
x, y = 56, 430
for i, (t, c) in enumerate([('特性要因図', (254, 243, 199)), ('FMEA', (219, 234, 254)), ('FTA', (224, 231, 255))]):
    w = d.textlength(t, font=F('700Bold', 34)) + 36
    d.rounded_rectangle((x, y, x + w, y + 58), 14, fill=c)
    d.text((x + 18, y + 29), t, font=F('700Bold', 34), fill=(30, 27, 75), anchor='lm')
    x += w
    if i < 2: d.text((x + 10, y + 29), '→', font=F('700Bold', 34), fill='white', anchor='lm'); x += 50
d.text((56, 530), '原因の候補 → 故障原因 → 基本事象', font=F('700Bold', 34), fill=(224, 231, 255))
d.text((56, 580), '明示した引用だけでつなぐ', font=F('700Bold', 34), fill=(224, 231, 255))
d.text((56, 676), 'PaoBub', font=F('800ExtraBold', 30), fill=(199, 210, 254))
im2.convert('RGB').save(sys.argv[1] if len(sys.argv) > 1 else 'thumbnail.png')
