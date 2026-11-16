# Builds each scene's picture from visuals.py and joins it with the scene's narration (tts.py).
import json, subprocess, sys, os
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__))
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)
from visuals import V
from scenes import SCENES
T=json.load(open('timing.json'))
os.makedirs('seg',exist_ok=True); os.makedirs('scene',exist_ok=True)
FPS=30
def run(*a): subprocess.run(a,check=True)
def segments(sid):
    cues=T[sid]['cues']; D=T[sid]['dur']; v=V[sid]; out=[]
    for i,(ci,kind,arg) in enumerate(v):
        s=0 if i==0 else cues[ci][0]-0.15
        e=D if i+1==len(v) else cues[v[i+1][0]][0]-0.15
        out.append((round(s*FPS)/FPS, round(e*FPS)/FPS, kind, arg))
    return out
def kb(img, n, out, zoom=0.06, seed=0):
    """A still with a slow zoom (Ken Burns)."""
    im=Image.open(img).convert('RGB'); W,H=im.size
    p=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r',str(FPS),'-i','-','-c:v','libx264','-crf','18','-preset','veryfast','-pix_fmt','yuv420p',out],stdin=subprocess.PIPE)
    dx=[0.5,0.3,0.7][seed%3]
    for k in range(n):
        t=k/max(1,n-1); t=t*t*(3-2*t); z=1+zoom*t; w,h=W/z,H/z
        x=(W-w)*dx; y=(H-h)*0.5
        p.stdin.write(im.transform((1920,1080),Image.EXTENT,(x,y,x+w,y+h),Image.BICUBIC).tobytes())
    p.stdin.close(); p.wait()
def clip(arg, d, out):
    """A part of a recorded video: (file in src/, start s, speed, optional crop w:h:x:y), fitted to 1920×1080 and held on its last frame."""
    f,start,speed=arg[:3]; crop=arg[3] if len(arg)>3 else None
    vf=(f'crop={crop},' if crop else '')+f'setpts=(PTS-STARTPTS)/{speed},scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xe6e9ed,fps={FPS},format=yuv420p'
    run('ffmpeg','-loglevel','error','-y','-ss',f'{start:.3f}','-i',f'src/{f}','-vf',vf+f',tpad=stop_mode=clone:stop_duration={d+1:.3f}','-t',f'{d:.3f}','-an','-c:v','libx264','-crf','18','-preset','veryfast',out)
only=sys.argv[1:]
for sid,_,_ in SCENES:
    if only and sid not in only: continue
    parts=[]
    for j,(s,e,kind,arg) in enumerate(segments(sid)):
        d=e-s; out=f'seg/{sid}_{j}.mp4'
        if kind=='img': kb(f'img/{arg}.png', int(round(d*FPS)), out, seed=j)
        else: clip(arg, d, out)
        parts.append(out); print(sid,j,kind,arg,round(d,2),flush=True)
    open(f'seg/{sid}.txt','w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
    run('ffmpeg','-loglevel','error','-y','-f','concat','-safe','0','-i',f'seg/{sid}.txt','-i',f'audio/{sid}.wav','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-shortest',f'scene/{sid}.mp4')
