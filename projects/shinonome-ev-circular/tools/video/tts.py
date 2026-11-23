import sys, json, wave, numpy as np, pyopenjtalk
import os
HERE=os.path.dirname(os.path.abspath(__file__))
A=os.path.normpath(os.path.join(HERE,'..','..','assets'))+'/'
WORK=os.environ.get('VIDEO_WORK') or exit('VIDEO_WORK（作業フォルダー）を設定してください')
FONT_DIR=os.environ.get('FONT_DIR') or exit('FONT_DIR（@expo-google-fonts/noto-sans-jp の package フォルダー）を設定してください')
os.makedirs(WORK,exist_ok=True); os.chdir(WORK); sys.path.insert(0,HERE)
os.makedirs('audio',exist_ok=True)
from scenes import SCENES, YOMI
SR=48000; GAP=0.35; HEAD=0.5; TAIL=0.8
def yomi(t):
    for a,b in sorted(YOMI, key=lambda x:-len(x[0])): t=t.replace(a,b)
    return t.replace('「','').replace('」','')
out={}
for sid,title,lines in SCENES:
    buf=[np.zeros(int(SR*HEAD),np.float32)]; t=HEAD; cues=[]
    for ln in lines:
        if isinstance(ln,(int,float)):
            buf.append(np.zeros(int(SR*ln),np.float32)); cues.append([t,t+ln,None]); t+=ln; continue
        x,sr=pyopenjtalk.tts(yomi(ln), speed=1.0); assert sr==SR
        x=x.astype(np.float32)
        cues.append([t, t+len(x)/SR, ln]); t+=len(x)/SR+GAP
        buf += [x, np.zeros(int(SR*GAP),np.float32)]
    buf.append(np.zeros(int(SR*(TAIL-GAP)),np.float32)); t+=TAIL-GAP
    a=np.concatenate(buf); a=a/ max(1,np.abs(a).max())*30000
    w=wave.open(f'audio/{sid}.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.astype(np.int16).tobytes()); w.close()
    out[sid]={'title':title,'dur':len(a)/SR,'cues':cues}
json.dump(out, open('timing.json','w'), ensure_ascii=False, indent=1)
tot=sum(v['dur'] for v in out.values()); print({k:round(v['dur'],1) for k,v in out.items()}, round(tot,1))
