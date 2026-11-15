from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import numpy as np, os
import sys
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=os.path.normpath(os.path.join(HERE,'..','..','assets'))+'/'
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)
FD=FONT_DIR.rstrip('/')+'/'
os.makedirs('img',exist_ok=True)
def font(w,s): return ImageFont.truetype(FD+{4:'400Regular/NotoSansJP_400Regular.ttf',7:'700Bold/NotoSansJP_700Bold.ttf',9:'900Black/NotoSansJP_900Black.ttf',5:'500Medium/NotoSansJP_500Medium.ttf'}[w], s)
W,H=1920,1080; BG=(246,245,241); INK=(30,30,36); ACC=(79,70,229)
def canvas(bg=BG): return Image.new('RGB',(W,H),bg)
def fit(im, box_w, box_h):
    im=im.convert('RGB'); r=min(box_w/im.width, box_h/im.height); return im.resize((max(1,int(im.width*r)),max(1,int(im.height*r))), Image.LANCZOS)
def shadow_paste(c, im, x, y, border=True):
    sh=Image.new('RGBA',(im.width+40,im.height+40),(0,0,0,0)); d=ImageDraw.Draw(sh); d.rectangle([20,24,20+im.width,24+im.height],fill=(0,0,0,60)); sh=sh.filter(ImageFilter.GaussianBlur(10))
    c.paste(sh,(x-20,y-20),sh); c.paste(im,(x,y))
    if border: ImageDraw.Draw(c).rectangle([x-1,y-1,x+im.width,y+im.height],outline=(200,200,200))
def label(c, x, y, text, size=34, fill=INK, anchor='mm', w=7):
    ImageDraw.Draw(c).text((x,y),text,font=font(w,size),fill=fill,anchor=anchor)
def autocrop(path, m=40):
    im=Image.open(path).convert('RGB'); a=np.asarray(im).astype(int); bgc=a[5,5]; mask=(np.abs(a-bgc).sum(2)>40)
    ys,xs=np.where(mask); x0,x1,y0,y1=max(0,xs.min()-m),min(im.width,xs.max()+m),max(0,ys.min()-m),min(im.height,ys.max()+m)
    return im.crop((x0,y0,x1,y1))
def grid(files, cols, cell):
    rows=(len(files)+cols-1)//cols; g=Image.new('RGB',(cols*cell[0],rows*cell[1]),'white')
    for i,f in enumerate(files): g.paste(Image.open(f).convert('RGB').resize(cell),((i%cols)*cell[0],(i//cols)*cell[1]))
    return g
def pages_row(kind):
    # 8 pages in reading order, right to left, 2 rows
    ps=[Image.open(A+f'ep01/{kind}/pages/page-0{i}.png').convert('RGB').resize((500,707)) for i in range(1,9)]
    g=Image.new('RGB',(4*500+5*20,2*707+3*20),'white')
    for i,p in enumerate(ps): r,c=divmod(i,4); g.paste(p,(20+(3-c)*520,20+r*727))
    return g
def save(c,n): c.save('img/'+n+'.png')

def single(src, n, margin=70, bg=BG, cap=None):
    c=canvas(bg); SUB=150; im=fit(src if isinstance(src,Image.Image) else Image.open(src), W-2*margin, H-2*margin-SUB-(60 if cap else 0)); x=(W-im.width)//2; y=margin+(H-2*margin-SUB-(60 if cap else 0)-im.height)//2
    shadow_paste(c,im,x,y)
    if cap: label(c, W//2, y+im.height+45, cap, 32, w=5)
    save(c,n)
def row(srcs, caps, n, top=None, margin=60, gap=40, img_h=None):
    c=canvas(); k=len(srcs); bw=(W-2*margin-gap*(k-1))//k; bh=min(img_h or 9999, H-160-220-90)
    ims=[fit(Image.open(s) if isinstance(s,str) else s,bw,bh) for s in srcs]; mh=max(i.height for i in ims); y0=150+(H-150-200-60-mh)//2
    if top: label(c,W//2,90,top,46,w=7)
    for i,(im,cp) in enumerate(zip(ims,caps)):
        x=margin+i*(bw+gap)+(bw-im.width)//2; y=y0+(mh-im.height)//2; shadow_paste(c,im,x,y)
        if cp: label(c,margin+i*(bw+gap)+bw//2,y0+mh+42,cp,30,w=7)
    save(c,n)

# title card
c=canvas((250,249,245)); d=ImageDraw.Draw(c)
pages=[Image.open(A+f'ep01/finish/pages/page-0{i}.png') for i in range(1,9)]
for i,p in enumerate(pages):
    t=fit(p,190,270); c.paste(t,(W-110-(i+1)*215+15, 700)); d.rectangle([W-110-(i+1)*215+14,699,W-110-(i+1)*215+15+t.width,700+t.height],outline=(190,190,190))
label(c,W//2,250,'PaoBubで漫画を1話つくる',84,w=9)
label(c,W//2,370,'「放課後ぐだぐだ部」第1話ができるまで',48,w=5)
label(c,W//2,470,'漫画の制作 1.5.0 ・ 13の工程 ・ 8ページ / 36コマ',34,fill=(90,90,100),w=4)
save(c,'title')

# 13 phases
names=['進め方','企画','人物','世界と舞台','筋と構成','脚本','ネーム','ラフ','線画','仕上げと写植','通読','出版準備','学び']
c=canvas(); d=ImageDraw.Draw(c); label(c,W//2,130,'漫画の制作 1.5.0 の 13の工程',54,w=7)
bw,bh=250,120; pos=[]
for i,nm in enumerate(names):
    bw=230
    if i<7: x=95+i*(bw+20); y=330
    else: x=95+(bw+20)//2+(i-7)*(bw+20); y=560
    d.rounded_rectangle([x,y,x+bw,y+bh],18,fill=(255,255,255),outline=ACC,width=4)
    label(c,x+bw//2,y+42,f'{i+1}',26,fill=ACC,w=7); label(c,x+bw//2,y+82,nm,34,w=7)
label(c,W//2,820,'工程ごとに Thread・成果物・確かめる条件 ・ 作者が受け入れると固定版（git の tag）',32,fill=(80,80,90),w=5)
label(c,W//2,880,'絵の工程（ネーム〜仕上げ）は 3D の舞台と Codex の画像生成で描き、作者が採否を決める',32,fill=(80,80,90),w=5)
save(c,'phases')

# character underlay 3-view and turnaround
for ch in ['nemu']:
    row([autocrop(A+f'character/underlay/{ch}-{v}.png') for v in ('front','side','back')],['正面','横','後ろ'],'underlay_'+ch, top='3D の 4頭身の体から作った下絵')
single(A+'character/nemu.png','art_nemu',cap='Codex で描いた三面図：朝比奈ねむ')
single(A+'character/suzu.png','art_suzu',cap='小鳥遊すず')
single(A+'character/reika.png','art_reika',cap='西園寺れいか')
single(A+'character/lineup.png','art_lineup',cap='背の比べ（全員）')
# stage
single(grid([A+f'ep01/stage/underlay/PN-{i:03d}.jpg' for i in range(1,37)],6,(460,222)),'stage36',cap='36コマ分の 3D のカメラの絵')
row([A+'ep01/stage/underlay/PN-001.jpg',A+'ep01/stage/underlay/PN-020.jpg'],['PN-001','PN-020'],'stage_two',top='コマごとのカメラの絵')
# name pages
row([A+'ep01/name/pages/page-01.png',A+'ep01/name/pages/page-02.png',A+'ep01/name/pages/page-03.png'],['1ページ','2ページ','3ページ'],'name_pages',top='ネーム：3D のカメラの絵を敷いたページ',img_h=800)
single(A+'ep01/name/pages/page-01.png','name_p1',margin=40,cap='ネーム 1ページ')
# rough
row([A+'ep01/stage/underlay/PN-012.jpg',A+'ep01/rough/panels/PN-012.png'],['3D のカメラの絵','Codex のラフ'],'rough_cmp',top='同じコマを、3D の絵からラフへ')
single(pages_row('rough'),'rough_pages',cap='ラフ：第1話 8ページ')
# ink three colors
lay=A+'ep01/ink/layers/PN-005/'
def colorize(files_colors, size):
    out=np.full((size[1],size[0],3),255,np.uint8)
    for f,col in files_colors:
        m=np.array(Image.open(f).convert('L').resize(size))<128; out[m]=col
    return Image.fromarray(out)
sz=Image.open(lay+'fig.png').size
three=colorize([(lay+'bg.png',(40,90,220)),(lay+'fig.png',(20,20,20)),(lay+'fx.png',(220,40,40))],sz)
row([three],[None],'ink_three',top='三色のペン：黒＝人物　青＝背景　赤＝効果')
row([colorize([(lay+'bg.png',(0,0,0))],sz),colorize([(lay+'fig.png',(0,0,0))],sz),colorize([(lay+'fx.png',(0,0,0))],sz)],['LY-02 背景','LY-05 線画','LY-06 効果'],'ink_layers',top='色で分けて、レイヤーに取り込む')
# finish layers
fl=A+'ep01/finish/layers/PN-012/'
row([A+'ep01/ink/panels/PN-012.png',fl+'beta.png',fl+'tone.png',A+'ep01/finish/panels/PN-012.png'],['線画','ベタ','トーン','仕上げ'],'finish_layers',top='線画に、ベタとトーンを足す',img_h=520)
single(A+'ep01/finish/pages/page-05.png','finish_p05',margin=40)
# reading pages
for i in range(1,9): single(A+f'ep01/finish/pages/page-0{i}.png',f'read_{i}',margin=30,bg=(236,235,231))
# 4 stage strip
row([A+'ep01/stage/underlay/PN-012.jpg',A+'ep01/rough/panels/PN-012.png',A+'ep01/ink/panels/PN-012.png',A+'ep01/finish/panels/PN-012.png'],['3D の舞台','ラフ','線画','仕上げ'],'strip4',top='ひとつのコマが、工程ごとに形を変える',img_h=520)
single(pages_row('finish'),'finish_all',cap='第1話「活動内容：特になし」')
# end card
c=canvas((250,249,245)); label(c,W//2,420,'PaoBub',110,w=9); label(c,W//2,560,'人とAIが、工程ごとに確かめながら作る',44,w=5)
label(c,W//2,680,'題材：放課後ぐだぐだ部 第1話（漫画の制作 1.5.0）',32,fill=(90,90,100),w=4); save(c,'end')
print(sorted(os.listdir('img')))
