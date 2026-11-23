import json, subprocess, sys, numpy as np, wave, re
import os
HERE=os.path.dirname(os.path.abspath(__file__))
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)

from scenes import SCENES
T=json.load(open('timing.json'))
FD=os.path.join(FONT_DIR,'700Bold')
def dur(f): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode().strip())
# timeline
t=0; starts={}
for sid,_,_ in SCENES: starts[sid]=t; t+=dur(f'scene/{sid}.mp4')
TOTAL=t
def ts(x): h=int(x//3600); m=int(x%3600//60); s=x%60; return f'{h}:{m:02d}:{s:05.2f}'
def srt_ts(x): ms=int(round(x*1000)); return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'
def wrap(s, n=30):
    if len(s)<=n: return [s]
    best=None
    for i,ch in enumerate(s):
        if ch in '、。' and 0<i<len(s)-1:
            score=abs((i+1)-len(s)/2)
            if best is None or score<best[0]: best=(score,i+1)
    k=best[1] if best and abs(best[1]-len(s)/2)<len(s)*0.3 else len(s)//2
    return wrap(s[:k],n)+wrap(s[k:],n) if len(s)>n*2 else [s[:k],s[k:]]
head='''[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Noto Sans JP,50,&H00FFFFFF,&H00FFFFFF,&H00201818,&H96000000,-1,0,0,0,100,100,1,0,1,4.5,1.5,2,80,80,46,1
Style: Dev,Noto Sans JP,30,&H00FFFFFF,&H00FFFFFF,&H40000000,&H50000000,-1,0,0,0,100,100,1,0,3,12,0,9,28,28,22,1
Style: Note,Noto Sans JP,22,&H30FFFFFF,&H00FFFFFF,&H60000000,&H60000000,0,0,0,0,100,100,0,0,3,8,0,8,24,24,18,1
Style: Chap,Noto Sans JP,34,&H00FFFFFF,&H00FFFFFF,&H00E54F46,&H00E54F46,-1,0,0,0,100,100,1,0,3,14,0,7,28,28,22,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
ev=[]; srt=[]; n=0; chapters=[]
for i,(sid,title,_) in enumerate(SCENES):
    s0=starts[sid]
    if sid not in ('s01',):
        num = {'s11b':''}.get(sid)
        ev.append(f'Dialogue: 1,{ts(s0+0.3)},{ts(s0+T[sid]["dur"]-0.2)},Chap,,0,0,0,,{title}')
    chapters.append((s0,title))
    for a,b,text in T[sid]['cues']:
        if not text: continue
        lines=wrap(text)
        ev.append(f'Dialogue: 0,{ts(s0+a)},{ts(s0+b+0.15)},Sub,,0,0,0,,'+r'\N'.join(lines))
        n+=1; srt.append(f'{n}\n{srt_ts(s0+a)} --> {srt_ts(s0+b+0.15)}\n'+'\n'.join(lines)+'\n')
from visuals import V
FPS=30
for sid,_,_ in SCENES:
    cues=T[sid]['cues']; D=T[sid]['dur']; v=V[sid]
    for i,(ci,kind,arg) in enumerate(v):
        a=0 if i==0 else cues[ci][0]-0.15
        b=D if i+1==len(v) else cues[v[i+1][0]][0]-0.15
        if kind=='clip' and len(arg)>4 and arg[4]=='ui': ev.append(f'Dialogue: 2,{ts(starts[sid]+a)},{ts(starts[sid]+b)},Dev,,0,0,0,,開発中の画面です')
# The note that the company and business are fictional stays on screen the whole video.
ev.append(f'Dialogue: 2,{ts(0)},{ts(TOTAL)},Note,,0,0,0,,架空の会社と事業です（実在の会社・事業とは関係ありません）')
open('subs.ass','w').write(head+'\n'.join(ev)+'\n')
open('out.srt','w').write('\n'.join(srt))
open('chapters.txt','w').write('\n'.join(f'{int(s//60)}:{int(s%60):02d} {t}' for s,t in chapters)+'\n')
# BGM: soft pad, chords cycling
SR=48000; N=int((TOTAL+1)*SR); tt=np.arange(N)/SR
chords=[[261.63,329.63,392.0],[220.0,261.63,329.63],[174.61,220.0,261.63],[196.0,246.94,293.66]]
bar=4.0; bgm=np.zeros(N,np.float32)
for k in range(int(TOTAL/bar)+2):
    s=int(k*bar*SR); e=min(N,int((k+1)*bar*SR+SR*1.5))
    if s>=N: break
    seg=tt[s:e]-k*bar; env=np.minimum(1,seg/1.2)*np.exp(-np.maximum(0,seg-bar)*2.5)*(0.85+0.15*np.cos(2*np.pi*seg/bar))
    for f in chords[k%4]:
        for h,amp in ((1,1),(2,0.25),(0.5,0.5)):
            bgm[s:e]+= (amp*np.sin(2*np.pi*f*h*seg+ k)).astype(np.float32)*env.astype(np.float32)
bgm/=np.abs(bgm).max()
fade=np.minimum(1,np.minimum(tt/2,(TOTAL-tt)/3)).clip(0,1); bgm*=fade
w=wave.open('bgm.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((bgm*32767).astype(np.int16).tobytes()); w.close()
open('scenes.txt','w').write(''.join(f"file '{os.path.abspath(f'scene/{sid}.mp4')}'\n" for sid,_,_ in SCENES))
subprocess.run(['ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i','scenes.txt','-c','copy','joined.mp4'],check=True)
out=sys.argv[1] if len(sys.argv)>1 else 'final.mp4'
subprocess.run(['ffmpeg','-loglevel','error','-y','-i','joined.mp4','-i','bgm.wav',
  '-filter_complex',f"[0:v]subtitles=subs.ass:fontsdir={FD},fade=t=in:st=0:d=0.8,fade=t=out:st={TOTAL-1.2:.2f}:d=1.2[v];[1:a]lowpass=f=1800,volume=0.07[b];[0:a][b]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]",
  '-map','[v]','-map','[a]','-c:v','libx264','-crf','19','-preset','medium','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',out],check=True)
print('total',TOTAL)
