# 事故分析（特性要因図・FMEA・FTA の引用）デモの動画（定義の Store デモの build.py を写したもの）。録画（a/*.webm, marks.json）とナレーションから、字幕・BGM 付きの 1080p 動画を作る。
# 使い方: VIDEO_WORK=<録画の置き場（DEMO_OUT）> FONT_DIR=<noto-sans-jp package> python build.py out.mp4
import os, sys, json, glob, wave, subprocess, numpy as np, pyopenjtalk
from PIL import Image, ImageDraw, ImageFont
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
from scenes import SCENES, CARDS, YOMI
WORK=os.environ['VIDEO_WORK']; FONT_DIR=os.environ['FONT_DIR']; os.chdir(WORK)
for d in ('audio','seg','img'): os.makedirs(d,exist_ok=True)
SR=48000; GAP=0.35; HEAD=0.6; TAIL=0.9; FPS=30
def run(*a): subprocess.run(a,check=True)
def yomi(t):
    for a,b in sorted(YOMI,key=lambda x:-len(x[0])): t=t.replace(a,b)
    return t
# 1) ナレーション
T={}
for sid,title,src,lines in SCENES:
    buf=[np.zeros(int(SR*HEAD),np.float32)]; t=HEAD; cues=[]
    for ln in lines:
        x,sr=pyopenjtalk.tts(yomi(ln),speed=1.05); x=x.astype(np.float32)
        cues.append([t,t+len(x)/SR,ln]); t+=len(x)/SR+GAP; buf+=[x,np.zeros(int(SR*GAP),np.float32)]
    buf.append(np.zeros(int(SR*(TAIL-GAP)),np.float32))
    a=np.concatenate(buf); a=a/max(1,np.abs(a).max())*30000
    w=wave.open(f'audio/{sid}.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.astype(np.int16).tobytes()); w.close()
    T[sid]={'title':title,'dur':len(a)/SR,'cues':cues}
# 2) 絵
M=json.load(open('marks.json')); M={k:dict(v) for k,v in M.items()}
vid={k:glob.glob(f'{k}/*.webm')[0] for k in M}
F=lambda w,s: ImageFont.truetype(glob.glob(f'{FONT_DIR}/{w}/*.ttf')[0],s)
def card(sid,out):
    title,sub=CARDS[sid]; im=Image.new('RGB',(1920,1080)); px=im.load()
    g=np.linspace(0,1,1920)[None,:]*0.6+np.linspace(0,1,1080)[:,None]*0.4
    arr=(np.array([49,46,129])[None,None,:]*(1-g[...,None])+np.array([79,70,229])[None,None,:]*g[...,None]).astype(np.uint8)
    im=Image.fromarray(arr); d=ImageDraw.Draw(im)
    d.text((960,470),title,font=F('800ExtraBold',110),fill='white',anchor='mm')
    d.text((960,600),sub,font=F('500Medium',40),fill=(224,231,255),anchor='mm')
    im.save(f'img/{sid}.png')
    n=int(round(T[sid]['dur']*FPS))
    run('ffmpeg','-loglevel','error','-y','-loop','1','-i',f'img/{sid}.png','-vf',f"zoompan=z='1+0.04*on/{n}':d={n}:s=1920x1080:fps={FPS},format=yuv420p",'-frames:v',str(n),'-c:v','libx264','-crf','18','-preset','veryfast',out)
for sid,title,src,lines in SCENES:
    D=T[sid]['dur']; out=f'seg/{sid}.mp4'
    if src is None: card(sid,out)
    else:
        k,m0,m1=src; s=M[k][m0]+0.15; L=M[k][m1]-s-0.35  # 端の 0.15/0.35 秒は捨てる（録画の遅れで次の画面の白が入らないように）
        speed=min(1.9,max(0.85,L/D))
        if L/speed>D:  # 速さの上限を超える場面は、録画を切らずに場面を延ばす（ナレーションの後は無音）
            D=L/speed; T[sid]['dur']=D
            w=wave.open(f'audio/{sid}.wav','rb'); x=w.readframes(w.getnframes()); w.close()
            x+=b'\0'*(2*(int(D*SR)-len(x)//2)); w=wave.open(f'audio/{sid}.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(x); w.close()
        vf=f'crop=1600:900:0:0,setpts=(PTS-STARTPTS)/{speed:.4f},scale=1920:1080:flags=lanczos,fps={FPS},format=yuv420p,tpad=stop_mode=clone:stop_duration={D+1:.3f}'
        run('ffmpeg','-loglevel','error','-y','-ss',f'{s:.3f}','-t',f'{L:.3f}','-i',vid[k],'-vf',vf,'-t',f'{D:.3f}','-an','-c:v','libx264','-crf','18','-preset','veryfast',out)
        print(sid,'raw',round(L,1),'narr',round(D,1),'speed',round(speed,2))
    run('ffmpeg','-loglevel','error','-y','-i',out,'-i',f'audio/{sid}.wav','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-shortest',f'seg/{sid}_av.mp4')
# 3) 字幕・BGM・つなぐ
def dur(f): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode())
t=0; starts={}
for sid,*_ in SCENES: starts[sid]=t; t+=dur(f'seg/{sid}_av.mp4')
TOTAL=t
def ts(x): return f'{int(x//3600)}:{int(x%3600//60):02d}:{x%60:05.2f}'
def srt_ts(x): ms=int(round(x*1000)); return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
def wrap(s,n=30):
    if len(s)<=n: return [s]
    best=min((abs(i+1-len(s)/2),i+1) for i,c in enumerate(s) if c in '、。' and 0<i<len(s)-1) if any(c in '、。' for c in s[1:-1]) else (0,len(s)//2)
    k=best[1]; return [s[:k],s[k:]]
head='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Noto Sans JP,50,&H00FFFFFF,&H00FFFFFF,&H00201818,&H96000000,-1,0,0,0,100,100,1,0,1,4.5,1.5,2,80,80,46,1
Style: Note,Noto Sans JP,20,&H30FFFFFF,&H00FFFFFF,&H60000000,&H60000000,0,0,0,0,100,100,0,0,3,6,0,3,20,20,8,1
Style: Chap,Noto Sans JP,34,&H00FFFFFF,&H00FFFFFF,&H00E54F46,&H00E54F46,-1,0,0,0,100,100,1,0,3,14,0,7,28,28,22,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
ev=[]; srt=[]; n=0; chapters=[]
for sid,title,src,_ in SCENES:
    s0=starts[sid]; chapters.append((s0,title))
    if src is not None: ev.append(f'Dialogue: 1,{ts(s0+0.3)},{ts(s0+T[sid]["dur"]-0.2)},Chap,,0,0,0,,{title}')
    for a,b,text in T[sid]['cues']:
        L=wrap(text); ev.append(f'Dialogue: 0,{ts(s0+a)},{ts(s0+b+0.15)},Sub,,0,0,0,,'+r'\N'.join(L))
        n+=1; srt.append(f'{n}\n{srt_ts(s0+a)} --> {srt_ts(s0+b+0.15)}\n'+'\n'.join(L)+'\n')
ev.append(f'Dialogue: 2,{ts(0)},{ts(TOTAL)},Note,,0,0,0,,架空の会社・製品・事故です（実在のものとは関係ありません）')
open('subs.ass','w').write(head+'\n'.join(ev)+'\n'); open('out.srt','w').write('\n'.join(srt))
open('chapters.txt','w').write('\n'.join(f'{int(s//60)}:{int(s%60):02d} {t}' for s,t in chapters)+'\n')
N=int((TOTAL+1)*SR); tt=np.arange(N)/SR; bar=4.0; bgm=np.zeros(N,np.float32)
chords=[[261.63,329.63,392.0],[220.0,261.63,329.63],[174.61,220.0,261.63],[196.0,246.94,293.66]]
for k in range(int(TOTAL/bar)+2):
    s=int(k*bar*SR); e=min(N,int((k+1)*bar*SR+SR*1.5))
    if s>=N: break
    seg=tt[s:e]-k*bar; env=np.minimum(1,seg/1.2)*np.exp(-np.maximum(0,seg-bar)*2.5)*(0.85+0.15*np.cos(2*np.pi*seg/bar))
    for f in chords[k%4]:
        for h,amp in ((1,1),(2,0.25),(0.5,0.5)): bgm[s:e]+=(amp*np.sin(2*np.pi*f*h*seg+k)).astype(np.float32)*env.astype(np.float32)
bgm/=np.abs(bgm).max(); bgm*=np.minimum(1,np.minimum(tt/2,(TOTAL-tt)/3)).clip(0,1)
w=wave.open('bgm.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((bgm*32767).astype(np.int16).tobytes()); w.close()
open('scenes.txt','w').write(''.join(f"file '{os.path.abspath(f'seg/{sid}_av.mp4')}'\n" for sid,*_ in SCENES))
run('ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i','scenes.txt','-c','copy','joined.mp4')
out=sys.argv[1] if len(sys.argv)>1 else 'final.mp4'
run('ffmpeg','-loglevel','error','-y','-i','joined.mp4','-i','bgm.wav','-filter_complex',
  f"[0:v]subtitles=subs.ass:fontsdir={FONT_DIR}/700Bold,fade=t=in:st=0:d=0.8,fade=t=out:st={TOTAL-1.2:.2f}:d=1.2[v];[1:a]lowpass=f=1800,volume=0.07[b];[0:a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]",
  '-map','[v]','-map','[a]','-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',out)
print('total',round(TOTAL,1),{k:round(v['dur'],1) for k,v in T.items()})
