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
label(c,W//2,760,'使いながら気づいたこと 87 件を記録し、直せるものはその場で直す',36,w=7)
save(c,'tools')

# End
c=canvas((250,250,248))
label(c,W//2,380,'PaoBub',120,fill=ACC,w=9)
label(c,W//2,520,'進め方・道具・記録を、ひとつのプロジェクトに',48,w=5)
label(c,W//2,700,'架空の会社と事業です。実在の会社・事業とは関係ありません。',28,fill=SUB,w=4)
save(c,'end')

# Phases of the editor-development definition
names=['進め方','目的と範囲','データ形式','操作と履歴','画面と入力','実装','検証','配布と取り込み','学び']
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,150,'新しい Editor の開発（editor-development）9 の工程',52,w=7)
bw,bh,g=300,120,18
for i,nm in enumerate(names):
    if i<5: x=(W-5*bw-4*g)//2+i*(bw+g); y=320
    else: x=(W-4*bw-3*g)//2+(i-5)*(bw+g); y=500
    d.rounded_rectangle([x,y,x+bw,y+bh],18,fill=(255,255,255),outline=ACC,width=4)
    label(c,x+bw//2,y+38,f'{i}',26,fill=ACC,w=7); label(c,x+bw//2,y+82,nm,32,w=7)
label(c,W//2,720,'マインドマップの道具・収支の道具・生きた引用の 3 つを、この定義で作る',32,fill=SUB,w=5)
save(c,'a-phases')

# Where the numbers came from
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,110,'収支はどう出てきたか：6 つの前提（どれも仮定）',52,w=7)
rows=[('FA-01','年間売上','2 年目 500 万 → 10 年目 3.2 億バーツ','市場の見積もり MS-04・立ち上げの順 ML-01'),
      ('FA-02','年間費用','年 0.8 億 → 9.2 億円','実行の計画 ML-02・財務 OR-05'),
      ('FA-03','初期設備投資','12 億円','e-Axle 再製造の試作 ML-03'),
      ('FA-04','為替','4.3 円 / バーツ','財務 OR-05'),
      ('FA-05','法人税率','20 %','法務 OR-04'),
      ('FA-06','割引率','8 %','社内の投資審査の目安 OR-05')]
y=200
for i,(a,b,v,src) in enumerate(rows):
    d.rounded_rectangle([160,y,1760,y+92],14,fill=(255,255,255),outline=(210,214,220),width=2)
    label(c,230,y+46,a,30,fill=ACC,w=7); label(c,420,y+46,b,32,w=7); label(c,640,y+46,v,32,w=5,anchor='lm'); label(c,1230,y+46,src,26,fill=SUB,w=5,anchor='lm')
    y+=108
label(c,W//2,880,'売上 × 為替 − 費用 − 税 → 年ごとの税引後キャッシュフロー → 8 % で割り引く → NPV・IRR',32,w=7)
save(c,'fin-chain')

# Digital twin: not connected (next)
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,170,'最初の版：費用と設備投資は仮定のまま',56,w=7)
for i,(t,a) in enumerate([('最初の版','費用・設備投資は 石田・佐藤 の仮定（FA-02・FA-03）'),('このあと','見送りのあと、拠点の模型（デジタルツイン）の結果を引用して作り直す')]):
    y=330+i*200; d.rounded_rectangle([260,y,1660,y+150],22,fill=(255,255,255),outline=ACC if i else (200,80,40),width=4)
    label(c,420,y+75,t,40,fill=ACC if i else (200,80,40),w=9); label(c,600,y+75,a,34,w=5,anchor='lm')
save(c,'twin')

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

# More screens (shots2: thread = 対話面, -f = 成果物)
S2=os.path.join(WORK,'shots2')
def st2(out,name,crop=(0,0,1920,1080),cap=None):
    global SHOTS
    old=SHOTS; SHOTS=S2; still(out,name,crop=crop,cap=cap); SHOTS=old
MAIN=(280,0,1920,1080)
for n,cap in [('a-process','対話面：人が頼み、AI が作業して、変えたことと確かめていないことを返す'),('a-process-f','進め方の表（工程・成果物・受け入れる人）'),
  ('a-purpose-f','目的と代表操作：使う人 UR と操作 OP'),('a-format-f','データ形式の仕様'),('a-commands-f','操作の表'),('a-screen-f','画面の設計 SC-01〜'),
  ('a-build','実装：AI がコードを書き、ゲートを通るまで直す'),('a-verify-f','試験の対応表'),('a-package','配布と取り込み：配布版のハッシュを記録'),('a-package-f','配布と取り込みの記録'),
  ('b-process','進め方：AI が地図から工程の定義を作る'),('b-process-f','進め方の地図（マインドマップ）'),('b-opportunity','機会の探索の対話面'),
  ('b-hypothesis-f','事業の仮説 HY-01〜05'),('b-hypothesis','事業の仮説の対話面'),('b-market-f','市場の大きさ MS-01〜06'),('b-market','市場と顧客の対話面'),
  ('b-business-model-f','事業モデルの地図'),('b-execution-f','実行の計画：体制 OR と節目 ML'),('b-execution','実行の計画の対話面'),
  ('b-financial-plan','収支計画の対話面'),('b-risk-f','リスクの表 RK-01〜'),('b-risk','リスクと対策の対話面'),('b-investment-f','投資の判断の記録 IC-01〜06'),
  ('b-business-plan','事業計画書の対話面'),('b-presentation','説明の資料の対話面'),('b-management-decision','経営の判断の対話面'),('b-management-decision-f','経営の判断の記録 MD-01'),
  ('b-learning','学びの対話面'),('b-learning-f','学びの記録 LE-01〜09'),
  ('fin-fa01','前提 FA-01 年間売上：10 年分をバーツ建てで'),('fin-0','シナリオ比較：基本・楽観・悲観'),('fin-sens','年ごとの現金の流れと感応度（基本シナリオ）')]:
    st2(n,n,crop=MAIN,cap=cap)
print('ok2')

# ---- 見直す：拠点の模型（デジタルツイン）から収支を作り直す ----
import json
TWIN=os.environ.get('TWIN_JSON', os.path.join(WORK,'twin','plant-model.json'))
S3=os.path.join(WORK,'shots3')
def st3(out,name,crop=(280,0,1920,1080),cap=None):
    global SHOTS
    old=SHOTS; SHOTS=S3; still(out,name,crop=crop,cap=cap); SHOTS=old
RED=(200,80,40)

# Phases with the revise section
names=['進め方','機会の探索','事業の仮説','市場と顧客','事業モデル','実行の計画','収支計画','リスクと対策','投資の判断','事業計画書','説明の資料','経営の判断','学び']
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,120,'見送りのあと：「見直す」に拠点の模型を足す（定義 3.6）',50,w=7)
bw,bh,g=200,96,12
for i,nm in enumerate(names):
    x=(W-13*bw-12*g)//2+i*(bw+g)+0; x=60+i*(140) ; 
for i,nm in enumerate(names):
    if i<7: x=(W-7*bw-6*g)//2+i*(bw+g); y=230
    else: x=(W-6*bw-5*g)//2+(i-7)*(bw+g); y=390
    d.rounded_rectangle([x,y,x+bw,y+bh],16,fill=(255,255,255),outline=(170,176,186),width=3)
    label(c,x+bw//2,y+bh//2,nm,28,fill=SUB,w=7)
    if i==11: label(c,x+bw//2,y+bh+26,'MD-01 本投資は見送り',22,fill=RED,w=7)
x0=(W-3*440-2*80)//2
for k,(nm,sub) in enumerate([('拠点の模型','デジタルツイン（新しい工程）'),('収支計画を開き直す','収支の道具・2 回目の版'),('再審査','リスク・投資・計画書・資料・経営')]):
    x=x0+k*520; y=620
    d.rounded_rectangle([x,y,x+440,y+150],20,fill=(255,255,255),outline=ACC,width=5)
    label(c,x+220,y+58,nm,36,fill=ACC,w=9); label(c,x+220,y+110,sub,24,w=5)
    if k<2: label(c,x+480,y+75,'→',48,fill=ACC,w=9)
label(c,W//2,815,'最初の収支（pin/financial-plan/2）と判断（MD-01）は消さずに残し、新しい版を重ねる',30,fill=SUB,w=5)
save(c,'revise')

tw=json.load(open(TWIN)); m=tw['model']; T={x['id']:x for x in tw['twin-result']}
# The plant model as a flow (2030 set-up)
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,90,'拠点の模型：タイの回収・再製造の拠点（工場のデジタルツイン）',48,w=7)
cnt={o['id']:o.get('count') or 1 for o in m['objects'] if o['kind']=='parallel'}
pt=tw['twin-result'][0]['calculationBasis'].get('processTimes',{}).get('minutesByStation',{})
def flow(y,col,title,steps,end):
    label(c,120,y-95,title,32,fill=col,w=9,anchor='lm')
    n=len(steps); bw=200; g2=(W-240-n*bw)//(n-1)
    for k,(sid,nm) in enumerate(steps):
        x=120+k*(bw+g2); d.rounded_rectangle([x,y-60,x+bw,y+60],16,fill=(255,255,255),outline=col,width=4)
        label(c,x+bw//2,y-18,nm,26,fill=col,w=7); label(c,x+bw//2,y+24,f"{pt.get(sid,'')} 分" + (f" ×{cnt.get(sid,1)}" if cnt.get(sid,1)>1 else ''),22,fill=SUB,w=5)
        if k<n-1: label(c,x+bw+g2//2,y,'→',34,fill=col,w=9)
    label(c,W-120,y+95,end,24,fill=SUB,w=5,anchor='rm')
flow(330,ACC,'電池',[('b-receive','受け入れ'),('b-safety','安全検査'),('b-prep','診断準備'),('b-diagnose','自動診断機'),('b-sort','選別'),('b-reuse-ship','出荷')],'再利用 30 %／材料回収 70 %（仮定）')
flow(640,(40,90,170),'e-Axle',[('a-receive','受け入れ'),('a-strip','分解'),('a-wash','洗浄'),('a-parts','部品検査'),('a-rebuild','再組立'),('a-test','最終検査'),('a-ship','出荷')],'2030 年の構成（台数は年ごとに探す）')
label(c,W//2,770,'作業者 4 種（荷役・電池技術・e-Axle 技術・検査）／共用 AGV 1 台／年 250 日 × 8 時間（仮定）／離散事象シミュレーション',28,w=5)

save(c,'twin-layout')

# Years: staff, equipment, capacity vs demand
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,100,'年ごとの量で流す：足りる最小の台数と人数（TR-01・TR-02）',48,w=7)
summ=[T['TR-01']['annualSummary'][0]]+T['TR-02']['annualSummary']
dem={2030:(1203.01,2406.02),2035:(3000,6000)}
def demand(y): return (1203.01+(3000-1203.01)*(y-2030)/5, 2406.02+(6000-2406.02)*(y-2030)/5)
hdr=['年','回収量（電池 t / e-Axle 台）','能力（電池 t / e-Axle 台）','診断機','人（現場 / 計）']
xs=[180,330,830,1330,1560]
for x,h in zip(xs,hdr): label(c,x,210,h,26,fill=SUB,w=7,anchor='lm')
for k,r in enumerate(summ):
    y=280+k*86; yr=r['year']; bd,ad=demand(yr)
    d.rounded_rectangle([150,y-34,W-150,y+34],12,fill=(255,255,255) if yr!=2031 else (255,244,236),outline=(210,214,220),width=2)
    label(c,xs[0],y,str(yr),32,w=9,anchor='lm')
    label(c,xs[1],y,f'{bd:,.0f} / {ad:,.0f}',30,w=5,anchor='lm')
    label(c,xs[2],y,f"{r['batteryCapacityTonnes']:,.0f} / {r['axleCapacityUnits']:,}",30,fill=ACC,w=7,anchor='lm')
    label(c,xs[3],y,f"{r['diagnosticStations']} 台",30,w=7,anchor='lm')
    label(c,xs[4],y,f"{r['operatingStaff']} / {r['totalStaff']} 人",30,w=7,anchor='lm')
label(c,W//2,775,'2031 年は能力の余裕が両系列とも約 0.5 %（電池技術員と再組立台が制約）',32,fill=RED,w=7)
label(c,W//2,820,'流し直して結果が合うかは、検査「模型の検算」で毎回確かめる',28,fill=SUB,w=5)
save(c,'twin-years')

# Costs and capex build-up
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,100,'費用と設備投資の積み上げ（TR-03・TR-04、単価は出所か仮定の印つき）',46,w=7)
op=T['TR-03']['annual']; names_op=[('laborJpy','人件費'),('equipmentMaintenanceJpy','保守'),('rentJpy','賃料'),('electricityJpy','電力'),('logisticsJpy','物流'),('consumablesAndPartsJpy','消耗品・部品'),('batteryExternalProcessingJpy','電池の外部処理'),('facilityServicesJpy','施設サービス')]
cols=[(7,95,89),(40,120,110),(90,150,140),(140,180,170),(40,90,170),(100,130,200),(200,120,60),(170,176,186)]
bx,by,bh2=200,800,500; mx=2.4e8; bwid=150
for k,a in enumerate(op):
    x=bx+k*210; y=by; oc=a['operatingCost']['annualOpex']
    for j,(key,nm) in enumerate(names_op):
        h=int(oc[key]/mx*bh2); d.rectangle([x,y-h,x+bwid,y],fill=cols[j]); y-=h
    label(c,x+bwid//2,y-24,f"{oc['totalJpy']/1e8:.2f}",26,w=9); label(c,x+bwid//2,by+30,str(a['year']),26,w=7)
for j,(key,nm) in enumerate(names_op):
    yy=260+j*44; d.rectangle([1500,yy-14,1528,yy+14],fill=cols[j]); label(c,1545,yy,nm,24,w=5,anchor='lm')
label(c,bx+3*210,215,'拠点の年間運営費（億円）',30,fill=SUB,w=7)
capx=[(a['year'],a['capex']['annualJpy']) for a in T['TR-04']['annual']]
label(c,1650,690,'設備投資（億円）',28,fill=SUB,w=7)
label(c,1650,740,'2030 立ち上げ '+f"{capx[0][1]/1e8:.2f}",28,w=7)
label(c,1650,785,'2031〜35 増設 計 '+f"{sum(v for _,v in capx[1:])/1e8:.2f}",28,w=7)
label(c,W//2,150,'人件費は職種 × 月給（公開の給与の目安）、賃料は工業団地の募集水準、診断機・検査ベンチは市場資料の価格帯',26,fill=SUB,w=5)
save(c,'twin-cost')

# Before / after
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,100,'収支の道具で入れ直した結果（前の版 → 見直した版）',50,w=7)
rows=[('年間費用（2035 年）','9.20 億円','3.57 億円','拠点の運営費 TR-03 ＋ 増設 TR-04 ＋ 本社・営業・コア買い取り・保険'),
      ('初期設備投資','12.00 億円','1.71 億円','立ち上げ設備・改装 TR-04 ＋ 実証・試作の設備'),
      ('年間売上（2035 年）','3.20 億 THB','1.50 億 THB','処理量（TR）× 単価：回収手数料・材料・再製造品'),
      ('基本の NPV / IRR','−12.81 億円 / −8.15 %','+0.37 億円 / 9.46 %','AR-01 → AR-07、9 年で回収'),
      ('楽観 / 悲観の NPV','−6.80 / −19.03 億円','+2.73 / −1.99 億円','売上の単価を ±20 %')]
for k,(a,b2,c2,e) in enumerate(rows):
    y=170+k*120; d.rounded_rectangle([110,y,W-110,y+108],16,fill=(255,255,255),outline=(210,214,220),width=2)
    label(c,150,y+38,a,30,w=7,anchor='lm'); label(c,150,y+80,e,22,fill=SUB,w=5,anchor='lm')
    label(c,1080,y+55,b2,32,fill=SUB,w=5,anchor='mm'); label(c,1290,y+55,'→',36,fill=ACC,w=9); label(c,1560,y+55,c2,34,fill=ACC if k!=4 else INK,w=9,anchor='mm')
label(c,W//2,810,'基本の余裕は 0.37 億円。単価が約 3 % 下がると NPV は正でなくなる',34,fill=RED,w=7)
save(c,'twin-compare')

# Re-review screens
for n,cap in [('c-plant-twin','拠点の模型の対話面：AI が模型を作り、年ごとの量で流した'),('c-plant-twin-f','拠点の模型（docs/plant-model.json）：年ごとの case と結果 TR-01〜05'),
  ('c-financial-plan-2','収支計画を開き直す：AI が模型の結果から前提の案を返す'),('c-fin-sc','見直した収支：基本 NPV +0.37 億円・IRR 9.46 %（AR-07〜09）'),
  ('c-risk-f','リスクの表：能力の余裕 RK-10・コアの買い取り価格 RK-11 を足す'),('c-investment-f','投資の判断：再審査の条件 IC-07〜14'),('c-investment','投資委員会の推奨：本投資は保留を続け、電池の実証を進める'),
  ('c-business-plan-f','事業計画書 PC-08「再審査に向けた見直し」'),('c-presentation','説明の資料に再審査の 5 枚を足す'),('c-md-f','経営の判断 MD-02：保留の継続と、実測で模型を更新する方法'),('c-learning-f','学び LE-10〜14')]:
    if os.path.exists(os.path.join(S3,n+'.png')): st3(n,n,cap=cap)
st3('c-plant-twin-f2','c-plant-twin-f2',cap='模型の結果 TR-01〜05：人・設備・能力と、費用・設備投資の積み上げ')
# slides grid of the re-review chapter
SL=os.environ.get('SLIDES_DIR', os.path.join(WORK,'sl'))
if os.path.exists(os.path.join(SL,'s9.png')):
    c=canvas((230,233,237)); label(c,W//2,60,'説明の資料：再審査の章（SL-09〜SL-13）',40,w=7)
    for k,i in enumerate([9,10,11,12,13]):
        im=fit(Image.open(os.path.join(SL,f's{i}.png')),560,316); x=90+(k%3)*590; y=110+(k//3)*350
        shadow_paste(c,im,x,y)
    save(c,'c-slides')
print('ok3')
