import json, subprocess, sys, os, math, numpy as np, wave
from PIL import Image
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=os.path.normpath(os.path.join(HERE,'..','..','assets'))+'/'
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)

from visuals import V
from scenes import SCENES
T=json.load(open('timing.json'))
os.makedirs('seg',exist_ok=True); os.makedirs('scene',exist_ok=True)
FPS=30
def run(*a): subprocess.run(a,check=True)
def dur(f): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode().strip())
def segments(sid):
    cues=T[sid]['cues']; D=T[sid]['dur']; v=V[sid]; out=[]
    for i,(ci,kind,arg) in enumerate(v):
        s=0 if i==0 else cues[ci][0]-0.15
        e=D if i+1==len(v) else cues[v[i+1][0]][0]-0.15
        out.append((round(s*FPS)/FPS, round(e*FPS)/FPS, kind, arg))
    return out
def kb(img, n, out, zoom=0.06, seed=0):
    im=Image.open(img).convert('RGB'); W,H=im.size
    p=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r',str(FPS),'-i','-','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p',out],stdin=subprocess.PIPE)
    dx = [0.5,0.3,0.7][seed%3]
    for k in range(n):
        t=k/max(1,n-1); t=t*t*(3-2*t); z=1+zoom*t; w,h=W/z,H/z
        x=(W-w)*dx; y=(H-h)*0.5
        fr=im.transform((1920,1080),Image.EXTENT,(x,y,x+w,y+h),Image.BICUBIC)
        p.stdin.write(fr.tobytes())
    p.stdin.close(); p.wait()
def phases_seq(n, out):
    from PIL import ImageDraw
    base=Image.open('img/phases.png').convert('RGB'); states=[]
    for k in range(14):
        im=base.copy(); ov=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(ov)
        for i in range(k):
            x = 95+i*250 if i<7 else 95+125+(i-7)*250; y = 330 if i<7 else 560
            d.rounded_rectangle([x,y,x+230,y+120],18,fill=(79,70,229,48) if i<k-1 else (79,70,229,110))
        im.paste(ov,(0,0),ov); states.append(im.tobytes())
    p=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r',str(FPS),'-i','-','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p',out],stdin=subprocess.PIPE)
    for f in range(n):
        k=min(13, 1+int(f/(n*0.8)*13)) if f>n*0.05 else 0
        p.stdin.write(states[k])
    p.stdin.close(); p.wait()
def fitlen(src, d, out):
    L=dur(src)
    vf='fps=30,format=yuv420p'
    if L > d*1.12: vf=f'setpts=PTS*{d/L:.5f},'+vf
    run('ffmpeg','-loglevel','error','-y','-i',src,'-vf',vf+f',tpad=stop_mode=clone:stop_duration={max(0,d-L)+1:.3f}','-t',f'{d:.3f}','-an','-c:v','libx264','-crf','18','-preset','veryfast',out)
only=sys.argv[1:]
for sid,_,_ in SCENES:
    if only and sid not in only: continue
    parts=[]
    for j,(s,e,kind,arg) in enumerate(segments(sid)):
        d=e-s; out=f'seg/{sid}_{j}.mp4'
        if kind=='phases': phases_seq(int(round(d*FPS)), out)
        elif kind=='img': kb(f'img/{arg}.png', int(round(d*FPS)), out, seed=j)
        else:
            raw=f'seg/{sid}_{j}_raw.mp4'
            if not os.path.exists(raw) or os.environ.get('REC'):
                for attempt in range(2):
                    r=subprocess.run(['node',os.path.join(HERE,'clips.mjs'),arg,f'{d:.2f}',os.path.join(WORK,raw)],cwd=WORK)
                    if r.returncode==0: break
                else: sys.exit(f'画面の録画 {arg} に失敗しました')
            fitlen(raw,d,out)
        parts.append(out); print(sid,j,kind,arg,round(d,2),flush=True)
    open(f'seg/{sid}.txt','w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    run('ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i',f'seg/{sid}.txt','-i',f'audio/{sid}.wav','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-shortest',f'scene/{sid}.mp4')
