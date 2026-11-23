# Still pictures for the promo video: cards drawn here, and the PaoBub screens framed.
# SHOTS: the folder of PaoBub screenshots (1920×1080) taken by tools/video/shots.mjs.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, sys
HERE=os.path.dirname(os.path.abspath(__file__))
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)
SHOTS=os.environ.get('SHOTS', os.path.join(WORK,'shots'))
FD=FONT_DIR.rstrip('/')+'/'
os.makedirs('img',exist_ok=True)
def font(w,s): return ImageFont.truetype(FD+{4:'400Regular/NotoSansJP_400Regular.ttf',5:'500Medium/NotoSansJP_500Medium.ttf',7:'700Bold/NotoSansJP_700Bold.ttf',9:'900Black/NotoSansJP_900Black.ttf'}[w], s)
W,H=1920,1080; BG=(244,246,248); INK=(28,32,40); ACC=(7,95,89); SUB=(90,96,110)
def canvas(bg=BG): return Image.new('RGB',(W,H),bg)
def label(c,x,y,t,s=34,fill=INK,anchor='mm',w=7): ImageDraw.Draw(c).text((x,y),t,font=font(w,s),fill=fill,anchor=anchor)
def fit(im,bw,bh):
    im=im.convert('RGB'); r=min(bw/im.width,bh/im.height); return im.resize((int(im.width*r),int(im.height*r)),Image.LANCZOS)
def shadow_paste(c,im,x,y):
    sh=Image.new('RGBA',(im.width+40,im.height+40),(0,0,0,0)); ImageDraw.Draw(sh).rectangle([20,24,20+im.width,24+im.height],fill=(0,0,0,60))
    sh=sh.filter(ImageFilter.GaussianBlur(10)); c.paste(sh,(x-20,y-20),sh); c.paste(im,(x,y))
def save(c,n): c.save('img/'+n+'.png')
def still(out,name,crop=None,cap=None):
    im=Image.open(os.path.join(SHOTS,name+'.png')).convert('RGB')
    if crop: im=im.crop(crop)
    # keep the bottom 220 px free for the subtitles
    c=canvas((230,233,237)); ch=60 if cap else 0; f=fit(im,W-120,H-280-ch); x=(W-f.width)//2; y=60+(H-280-ch-f.height)//2
    shadow_paste(c,f,x,y)
    if cap: label(c,W//2,y+f.height+42,cap,32,w=5)
    save(c,out)

# Title
c=canvas((250,250,248))
label(c,W//2,320,'新規事業を、工程で進める',88,w=9)
label(c,W//2,440,'タイの使用済み EV 電池・e-Axle 循環事業の企画',50,w=5)
label(c,W//2,530,'架空の総合商社 東雲物産 × PaoBub',36,fill=SUB,w=5)
label(c,W//2,700,'架空の会社と事業です。数字は公開の統計と仮定から作った試算です。',28,fill=SUB,w=4)
save(c,'title')

# Phases
names=['進め方','機会の探索','事業の仮説','市場と顧客','事業モデル','実行の計画','収支計画','リスクと対策','投資の判断','事業計画書','説明の資料','経営の判断','学び']
gates={3:'G1',9:'G2 投資委員会',12:'G3 経営会議'}
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,130,'新規事業の企画 13 の工程（マインドマップ → 工程の定義）',52,w=7)
bw,bh,g=250,120,16
for i,nm in enumerate(names):
    if i<7: x=(W-7*bw-6*g)//2+i*(bw+g); y=290
    else: x=(W-6*bw-5*g)//2+(i-7)*(bw+g); y=520
    d.rounded_rectangle([x,y,x+bw,y+bh],18,fill=(255,255,255),outline=ACC,width=4)
    label(c,x+bw//2,y+38,f'{i}',26,fill=ACC,w=7); label(c,x+bw//2,y+82,nm,32,w=7)
    if i in gates: label(c,x+bw//2,y+bh+30,'▲ '+gates[i],26,fill=(200,80,40),w=7)
label(c,W//2,780,'工程ごとに成果物と確かめる条件。受け入れると版（pin）が固定され、後の工程はその版を引用する',32,fill=SUB,w=5)
save(c,'phases')

# Tools built on the way
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,140,'企画を進めながら、道具も PaoBub で作る',56,w=7)
tools=[('マインドマップの道具','機会・事業モデル・進め方の地図','外部 Editor（配布版を信頼して読み込み）'),
       ('収支の道具','10 年・年次・3 つのシナリオ\nNPV・IRR・キャッシュフロー','外部 Editor（引用の口つき）'),
       ('生きた引用','受け入れた版の値と図を\n文書とスライドに引用','Editor Platform に追加（公開）')]
bw,bh=520,380
for i,(t,a,b) in enumerate(tools):
    x=(W-3*bw-2*40)//2+i*(bw+40); y=270
    d.rounded_rectangle([x,y,x+bw,y+bh],24,fill=(255,255,255),outline=ACC,width=4)
    label(c,x+bw//2,y+70,t,42,fill=ACC,w=9)
    for k,ln in enumerate(a.split('\n')): label(c,x+bw//2,y+170+k*52,ln,32,w=5)
    label(c,x+bw//2,y+bh-60,b,26,fill=SUB,w=5)
label(c,W//2,760,'使いながら気づいたこと 84 件を記録し、直せるものはその場で直す',36,w=7)
save(c,'tools')

# End
c=canvas((250,250,248))
label(c,W//2,380,'PaoBub',120,fill=ACC,w=9)
label(c,W//2,520,'進め方・道具・記録を、ひとつのプロジェクトに',48,w=5)
label(c,W//2,700,'架空の会社と事業です。実在の会社・事業とは関係ありません。',28,fill=SUB,w=4)
save(c,'end')

# Screens
still('opportunity','opportunity',crop=(330,150,1920,1080),cap='機会の地図（マインドマップの道具 0.1.4）')
still('model','model',crop=(330,150,1920,1080),cap='事業モデルの地図：回収・診断・再製造・販売の流れ')
still('financial','financial',crop=(330,80,1920,1080),cap='収支のモデル：基本 NPV −12.81 億円・IRR −8.15%（楽観・悲観と比べる）')
still('investment','investment',crop=(330,80,1920,1080),cap='投資の判断：G2 投資委員会で経理と法務が承認')
still('plan','plan',crop=(330,150,1920,1080),cap='事業計画書（文書の JSON）：NPV・IRR・図は収支のモデル pin/financial-plan/1 からの引用')
still('cite','cite-dialog',crop=(330,100,1600,830),cap='引用の挿入：成果物 → 受け入れた版 → 値 → 書式')
still('slides','slides',crop=(470,330,1470,1000),cap='説明の資料 SL-06：NPV・IRR・キャッシュフロー図を引用')
still('decision','decision',crop=(600,150,1600,1060),cap='経営の判断の記録 MD-01：投資の判断の条件を引用')
still('learning','learning',crop=(600,240,1700,1080),cap='学びの記録 LE-01〜09')
print('ok')
