import subprocess
# Still pictures for the promo video: cards drawn here, and the Playground stills framed.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys, json
HERE=os.path.dirname(os.path.abspath(__file__))
A=os.path.normpath(os.path.join(HERE,'..','..','assets'))+'/'
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)
FD=FONT_DIR.rstrip('/')+'/'
os.makedirs('img',exist_ok=True)
def font(w,s): return ImageFont.truetype(FD+{4:'400Regular/NotoSansJP_400Regular.ttf',5:'500Medium/NotoSansJP_500Medium.ttf',7:'700Bold/NotoSansJP_700Bold.ttf',9:'900Black/NotoSansJP_900Black.ttf'}[w], s)
W,H=1920,1080; BG=(244,246,248); INK=(28,32,40); ACC=(37,99,235); SUB=(90,96,110)
def canvas(bg=BG): return Image.new('RGB',(W,H),bg)
def label(c,x,y,t,s=34,fill=INK,anchor='mm',w=7): ImageDraw.Draw(c).text((x,y),t,font=font(w,s),fill=fill,anchor=anchor)
def fit(im,bw,bh):
    im=im.convert('RGB'); r=min(bw/im.width,bh/im.height); return im.resize((int(im.width*r),int(im.height*r)),Image.LANCZOS)
def shadow_paste(c,im,x,y):
    sh=Image.new('RGBA',(im.width+40,im.height+40),(0,0,0,0)); ImageDraw.Draw(sh).rectangle([20,24,20+im.width,24+im.height],fill=(0,0,0,60))
    sh=sh.filter(ImageFilter.GaussianBlur(10)); c.paste(sh,(x-20,y-20),sh); c.paste(im,(x,y))
def save(c,n): c.save('img/'+n+'.png')
NOTE='公開の情報からの近似です。実物の図面・施工計画ではなく、塔の所有者・施工者とは関係ありません。'

# Title
c=canvas((250,250,248))
label(c,W//2,330,'634 m の塔を、日付ごとに建てる',84,w=9)
label(c,W//2,450,'東京スカイツリーを題材にした近似のデジタルツイン',48,w=5)
label(c,W//2,540,'施工計画（construction-planning 1.0.0）・クレーンと搬入の模擬',34,fill=SUB,w=4)
label(c,W//2,880,NOTE,28,fill=SUB,w=4)
save(c,'title')

# Phases
names=['進め方','与条件の整理','施工用のモデル','施工方法の選定','工程計画','揚重と搬入','施工の模擬','安全の確認','施工中の構造','計画の承認','説明と記録']
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,140,'施工計画 construction-planning 1.0.0 の 11 の工程',52,w=7)
bw,bh,g=270,120,16
for i,nm in enumerate(names):
    if i<6: x=(W-6*bw-5*g)//2+i*(bw+g); y=320
    else: x=(W-5*bw-4*g)//2+(i-6)*(bw+g); y=520
    skipped = nm=='施工中の構造'
    d.rounded_rectangle([x,y,x+bw,y+bh],18,fill=(255,255,255),outline=(170,170,180) if skipped else ACC,width=4)
    label(c,x+bw//2,y+40,f'{i+1}',26,fill=(150,150,160) if skipped else ACC,w=7); label(c,x+bw//2,y+82,nm,32,fill=(150,150,160) if skipped else INK,w=7)
label(c,W//2,760,'工程ごとに成果物と確かめる条件。項目（条件・作業・揚重機・模擬の事項・判断…）を引用でつなぐ',32,fill=SUB,w=5)
label(c,W//2,820,'この版では「施工中の構造」を省いた（解析の道具が無い環境だったため）',32,fill=SUB,w=5)
save(c,'phases')

# Checks: D1 -> TT5
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,130,'吊り 2,208 回の検査（届く範囲・荷重表・干渉・昇りの支え・旋回の重なり）',44,w=7)
rows=[('最初の計画（D1）',3573,(220,38,38)),('直した計画（TT5）',9,(234,140,20))]
x0,x1=520,1480
for k,(nm,n,col) in enumerate(rows):
    y=330+k*230
    label(c,x0-30,y+50,nm,40,anchor='rm',w=7)
    w=max(8,int((x1-x0)*n/3573)); d.rounded_rectangle([x0,y,x0+w,y+100],12,fill=col)
    label(c,x0+w+24,y+50,f'{n:,} 件',48,anchor='lm',w=9)
label(c,W//2,800,'残る 9 件は、クレーンどうしの旋回の範囲が重なるという注意（意図したもの）',36,fill=SUB,w=5)
label(c,W//2,870,'道具に足した機能：昇るクレーン・引き上げ・搬入と吊りのつながり・検査の索引・支えの許し',32,fill=SUB,w=5)
save(c,'checks')

# Stills from the Playground (crop the 3D view and the panel as they are)
# The Playground's outputs (TT5_OUT, PNG) when given, else the copies committed in assets/ (JPEG).
SRC=os.environ.get('TT5_OUT')
ASSETS=os.path.join(HERE,'..','..','assets')
def source(name):
    for p in ([f'{SRC}/{name}.png'] if SRC else [])+[os.path.join(ASSETS,f'{name}.jpg')]:
        if os.path.exists(p): return p
    exit(f'{name} が見つかりません（TT5_OUT か assets/ に置いてください）')
def still(name,crop=None,cap=None):
    p=source(name)
    im=Image.open(p).convert('RGB')
    if crop: im=im.crop(crop)
    c=canvas((230,233,237)); f=fit(im,W-120,H-120-(70 if cap else 0)); x=(W-f.width)//2; y=60+(H-120-(70 if cap else 0)-f.height)//2
    shadow_paste(c,f,x,y)
    if cap: label(c,W//2,y+f.height+50,cap,32,w=5)
    save(c,name)
for n in ['tt5-crawlers','tt5-tower-cranes','tt5-gain-tower','tt5-634m']: still(n)
# The trucks: their trips and the dangers on the clock (the panel; in the 3D view they are too small to see).
still('tt5-trucks',crop=(950,240,1430,890))
# The crane check's result: the notices left and the cranes (the panel only).
still('tt5-cranes-checked',crop=(950,540,1430,880))
# The whole tower at 634 m: the last frame of the schedule video, around the tower.
v=os.path.join(WORK,'src','tt5-schedule.mp4')
if os.path.exists(v):
    subprocess.run(['ffmpeg','-v','error','-y','-sseof','-0.1','-i',v,'-frames:v','1','-update','1','-vf','crop=1049:590:115:130,scale=1920:1080:flags=lanczos','img/tt5-634m-full.png'],check=True)
p=source('tt5-634m-render')
if p: c=canvas((20,22,26)); f=fit(Image.open(p),W,H); c.paste(f,((W-f.width)//2,(H-f.height)//2)); save(c,'render')

# End
c=canvas((250,250,248))
label(c,W//2,360,'計画・模型・検査の記録は PaoBub の Project に',56,w=9)
label(c,W//2,460,'工程の定義 construction-planning は open-workflow-definitions に',40,w=5)
label(c,W//2,540,'模型と模擬：Editor Platform（建物・工事の工程）',40,w=5)
label(c,W//2,860,NOTE,28,fill=SUB,w=4)
save(c,'end')
print(sorted(os.listdir('img')))
