# Still pictures for the promo video: cards drawn here, and the Playground screens framed.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys, csv, json
HERE=os.path.dirname(os.path.abspath(__file__))
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
# The FT7 outputs (FT7_OUT: PNG screens, experiment-table.csv, results.json) when given, else assets/ (JPEG) and data/.
SRC=os.environ.get('FT7_OUT')
PROJ=os.path.normpath(os.path.join(HERE,'..','..'))
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
NOTE='架空の工場です。実在の会社・工場・製品とは関係がありません。'
def source(name):
    for p in ([f'{SRC}/{name}.png'] if SRC else [])+[os.path.join(PROJ,'assets',f"{name.replace('/','-')}.jpg")]:
        if os.path.exists(p): return p
    exit(f'{name} が見つかりません（FT7_OUT か assets/ に置いてください）')
def still(out,name,crop=None,cap=None,full=False):
    im=Image.open(source(name)).convert('RGB')
    if crop: im=im.crop(crop)
    if full: c=canvas(); f=fit(im,W,H); c.paste(f,((W-f.width)//2,(H-f.height)//2)); save(c,out); return
    # keep the bottom 220 px free for the subtitles
    c=canvas((230,233,237)); ch=60 if cap else 0; f=fit(im,W-120,H-280-ch); x=(W-f.width)//2; y=60+(H-280-ch-f.height)//2
    shadow_paste(c,f,x,y)
    if cap: label(c,W//2,y+f.height+42,cap,32,w=5)
    save(c,out)

# Title
c=canvas((250,250,248))
label(c,W//2,330,'工場を、流して確かめる',88,w=9)
label(c,W//2,450,'架空の e-Axle の工場のデジタルツイン',50,w=5)
label(c,W//2,540,'生産システム計画（production-system-planning 1.0.0）・物の流れの模擬',34,fill=SUB,w=4)
label(c,W//2,700,NOTE,28,fill=SUB,w=4)
save(c,'title')

# Phases
names=['進め方','生産の要件','工程の設計','ラインの設計','入力のデータ','配置の計画','モデルの妥当性','実験と比較','制御の確認','計画の承認','説明と記録']
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,140,'生産システム計画 production-system-planning 1.0.0 の 11 の工程',52,w=7)
bw,bh,g=270,120,16
for i,nm in enumerate(names):
    if i<6: x=(W-6*bw-5*g)//2+i*(bw+g); y=320
    else: x=(W-5*bw-4*g)//2+(i-6)*(bw+g); y=520
    d.rounded_rectangle([x,y,x+bw,y+bh],18,fill=(255,255,255),outline=ACC,width=4)
    label(c,x+bw//2,y+40,f'{i+1}',26,fill=ACC,w=7); label(c,x+bw//2,y+82,nm,32,w=7)
label(c,W//2,760,'工程ごとに成果物と確かめる条件。項目（要件・作業・資源・データ・案・所見・判断…）を引用でつなぐ',32,fill=SUB,w=5)
label(c,W//2,820,'この Project：項目 128・引用 275、定義の規則の検査で問題 0',32,fill=SUB,w=5)
save(c,'phases')

# Screens from the Playground
still('hall','01-hall-bim',crop=(200,250,1620,1000),cap='建屋（BIM）：平屋 72 × 36 m、12 m の格子の柱、搬入の扉 3 つ')
still('plan','02-plan-planned',crop=(490,185,1330,615),cap='平面：南の加工から東の最終組立・検査・出荷へ。北のキッティングから AGV の環')
still('planned-3d','clips/planned-still',full=True)
still('adopted-3d','clips/adopted-still',full=True)
still('result-planned','03-result-planned',crop=(212,645,1610,1050),cap='計画案（AGV 2 台・作業者 3 人）：8 日で 2,640 台、13.8 台/時')
still('result-adopted','05-result-adopted',crop=(212,645,1610,1050),cap='採用案（AGV 6 台・作業者 4 人）：8 日で 6,601 台、34.4 台/時')
still('bottlenecks','03b-bottlenecks-planned',cap='ボトルネックの順位（計画案）：1 位は検査台。AGV と作業者は比べに入らない')
still('experiment','04b-experiment-surface',crop=(212,425,1160,1045),cap='実験：AGV 2・4・6・8 台 × 作業者 3・4 人、5 回ずつ 40 回（Worker で 13.5 秒）')

# Cards with numbers from the run
DATA=SRC or os.path.join(PROJ,'data')
R=json.load(open(f'{DATA}/results.json'))
def bars(c,y0,title,rows,total=100):
    d=ImageDraw.Draw(c); label(c,200,y0,title,40,anchor='lm',w=7)
    x0,x1=200,1720; x=x0
    for nm,v,col in rows:
        w=int((x1-x0)*v/total); d.rectangle([x,y0+50,x+w,y0+150],fill=col)
        if w>140: label(c,x+w//2,y0+85,nm,26,fill=(255,255,255),w=7); label(c,x+w//2,y0+122,f'{v:.0f}%',30,fill=(255,255,255),w=9)
        x+=w
pl=R['planned']
c=canvas(); label(c,W//2,130,'計画案：最終組立は部品を待ち、AGV は休まない',52,w=9)
s=pl['states']['assembly-2']
bars(c,280,'最終組立の時間',[('働く',s['working'],(22,163,74)),('部品を待つ',s['waiting'],(148,163,184)),('人を待つ',s.get('unstaffed',0),(245,158,11)),('シフトの外',s['paused'],(168,85,247))])
f=pl['fleet']['shares']
bars(c,560,'AGV の時間',[('空で走る',f['empty'],(14,116,144)),('積んで走る',f['loaded'],(8,145,178)),('積み降ろし',f['handling'],(34,211,238)),('降ろせず待つ',f['blocked'],(220,38,38))])
label(c,W//2,800,'降ろせず待つ：最終組立に同じ部品が先に届いていて、置けない',32,fill=SUB,w=5)
save(c,'planned-states')

c=canvas(); label(c,W//2,130,'手計算：AGV 2 台の上限',56,w=9)
for i,t in enumerate(['環の長さ 155.6 m ÷ 1 m/s ＋ 積み降ろし 30 秒 ＝ 1 回 186 秒','1 台に部品 2 つ（電動機とインバーター）','2 台 × 3,600 秒 ÷ 186 秒 ÷ 2 ＝ 19.4 台/時',f"降ろせず待つ {f['blocked']}% を引くと 19.4 × {1-f['blocked']/100:.3f} ＝ 13.8 台/時"]):
    label(c,W//2,330+i*120,t,44,w=7 if i==3 else 5,fill=ACC if i==3 else INK)
label(c,W//2,800,'模型の 13.8 台/時と合う（妥当性の確認 VC-02）',36,fill=SUB,w=5)
save(c,'agv-calc')

# Experiment chart: per hour vs AGVs, for 3 and 4 assemblers
rows=list(csv.DictReader(open(f'{DATA}/experiment-table.csv')))
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,110,'実験：AGV の台数と、1 時間の生産数（5 回の平均）',50,w=9)
X0,X1,Y0,Y1=300,1700,780,280; ymax=40
def px(a): return X0+(a-2)/6*(X1-X0)
def py(v): return Y0-(v/ymax)*(Y0-Y1)
for v in range(0,41,10):
    d.line([X0,py(v),X1,py(v)],fill=(210,214,220),width=2); label(c,X0-30,py(v),str(v),28,anchor='rm',fill=SUB,w=5)
d.line([X0,py(30),X1,py(30)],fill=(220,38,38),width=3); label(c,X1+10,py(30),'目標 30',28,anchor='lm',fill=(220,38,38),w=7)
for a in (2,4,6,8): label(c,px(a),Y0+40,f'{a} 台',30,fill=SUB,w=5)
for w,col in ((3,(245,158,11)),(4,ACC)):
    pts=[(px(int(r['fleet-count:agv'])),py(float(r['throughputPerHour_mean']))) for r in rows if int(r['pool-count:assemblers'])==w]
    d.line(pts,fill=col,width=8)
    for x,y in pts: d.ellipse([x-12,y-12,x+12,y+12],fill=col)
    label(c,pts[-1][0]+30,pts[-1][1]-30,f'作業者 {w} 人',32,anchor='lm',fill=col,w=7)
label(c,W//2,185,'AGV 6 台・作業者 4 人で 34.2 台/時。それより AGV を増やしても変わらない',32,fill=SUB,w=5)
save(c,'experiment-chart')

ctl=R['control']
c=canvas(); label(c,W//2,130,'制御の確認：検査のコンベヤに PLC のはしご図',52,w=9)
for i,(t,a,col) in enumerate([('制御なし',f"2 日で {ctl['none']['produced']:,} 台",SUB),('正しいはしご',f"2 日で {ctl['ok']['produced']:,} 台（流れは同じ）",(22,163,74)),('わざと誤ったはしご','1 日目 6:09 にコンベヤが止まり、それを知らせる',(220,38,38))]):
    y=330+i*170; d=ImageDraw.Draw(c); d.rounded_rectangle([200,y-60,1720,y+60],18,fill=(255,255,255),outline=col,width=4)
    label(c,260,y,t,40,anchor='lm',fill=col,w=9); label(c,760,y,a,38,anchor='lm',w=5)
label(c,W//2,800,'走査 100 ミリ秒・2 日。シフトの終わりを止まりと知らせる誤報は、道具の課題として記録',32,fill=SUB,w=5)
save(c,'control')

c=canvas((250,250,248))
label(c,W//2,340,'要件から承認までの記録は PaoBub の Project に',56,w=9)
label(c,W//2,450,'工程の定義 production-system-planning は open-workflow-definitions に',40,w=5)
label(c,W//2,530,'模型と模擬：Editor Platform（工場・建物）',40,w=5)
label(c,W//2,680,NOTE,28,fill=SUB,w=4)
save(c,'end')
print(sorted(os.listdir('img')))
