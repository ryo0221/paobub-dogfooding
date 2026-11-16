# (cue index where the segment starts, kind, arg). kind: img = <work>/img/<arg>.png with a slow zoom;
# clip = (file in <work>/src, start s, speed, crop w:h:x:y or None, 'ui' to label it as the app's screen).
# clips.webm: the CLIPS run of tt5.demo.ts (1920×1080, the 3D view over the whole page); start
# times are the ones it logged in tt5-clips.txt (+0.5 s for the video's start).
V = {
 's01': [(0,'img','title')],
 's02': [(0,'img','render'), (1,'img','tt5-634m-full')],
 's03': [(0,'img','phases')],
 's04': [(0,'clip',('clips.webm',158,1,'960:540:465:345')), (1,'img','tt5-trucks')],
 's05': [(0,'clip',('clips.webm',199.7,1,'1067:600:410:240'))],
 's06': [(0,'img','tt5-cranes-checked'), (2,'img','checks')],
 # The schedule video is one calendar day a frame from the start of the foundations (2008-07-14):
 # 29 s ≈ 2010-12, the gain tower going up to 634 m (2011-03-18).
 's07': [(0,'clip',('tt5-schedule.mp4',29,0.5,'853:480:233:90')), (1,'img','tt5-634m-full')],
 's08': [(0,'clip',('tt5-schedule.mp4',0,1.17,'1049:590:115:130'))],
 's09': [(0,'img','render'), (2,'img','end')],
}
