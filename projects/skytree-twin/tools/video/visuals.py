# (cue index where the segment starts, kind, arg). kind: img = <work>/img/<arg>.png with a slow zoom;
# clip = (file in <work>/src, start s, speed, crop w:h:x:y or None, 'ui' to label it as the app's screen).
# run1.webm is the Playwright recording of the Playground run (tools/twin/tt5.demo.ts), 1440×900; the crop leaves out its captions.
UI = '1440:810:0:0'
V = {
 's01': [(0,'img','title')],
 's02': [(0,'img','render'), (1,'img','tt5-634m')],
 's03': [(0,'img','phases')],
 's04': [(0,'img','tt5-crawlers'), (1,'clip',('run1.webm',160,1,UI,'ui'))],
 's05': [(0,'clip',('run1.webm',188,1,UI,'ui'))],
 's06': [(0,'img','tt5-cranes-checked'), (2,'img','checks')],
 's07': [(0,'img','tt5-gain-tower'), (1,'img','tt5-634m')],
 's08': [(0,'clip',('tt5-schedule.mp4',0,1.17,None))],
 's09': [(0,'img','render'), (2,'img','end')],
}
