# (cue index where the segment starts, kind, arg). kind: img = <work>/img/<arg>.png with a slow zoom;
# clip = (file in <work>/src, start s, speed, crop w:h:x:y or None). src/*.webm are recorded by shots.mjs (content from 8 s).
V = {
 's01': [(0,'img','title')],
 's02': [(0,'img','phases')],
 's03': [(0,'img','opportunity'), (1,'img','model')],
 's04': [(0,'img','financial'), (1,'clip',('scenario.webm',8.0,1,'1300:731:290:70')), (2,'img','tools')],
 's05': [(0,'img','investment')],
 's06': [(0,'img','plan'), (1,'clip',('cite.webm',9.0,1,'1270:714:330:90'))],
 's07': [(0,'clip',('slides.webm',8.0,1.4,'960:540:400:220'))],
 's08': [(0,'img','decision'), (1,'img','learning')],
 's09': [(0,'img','tools')],
 's10': [(0,'img','end')],
}
