# (cue index where the segment starts, kind, arg). kind: img = <work>/img/<arg>.png with a slow zoom;
# clip = (file in <work>/src, start s, speed, crop w:h:x:y or None).
# src/*.mp4: the FT7 clips (ft7-clips.demo.ts, 3D replay of day 3 10:00-10:30 at x60, 1080p).
V = {
 's01': [(0,'img','title')],
 's02': [(0,'img','hall'), (1,'img','plan'), (2,'img','planned-3d')],
 's03': [(0,'img','phases')],
 's04': [(0,'img','planned-3d'), (1,'clip',('planned-day3-1000-1030.mp4',0,1,None)), (2,'img','result-planned')],
 's05': [(0,'img','planned-states'), (1,'img','agv-calc'), (2,'img','bottlenecks')],
 's06': [(0,'img','experiment'), (1,'img','experiment-chart')],
 's07': [(0,'img','result-adopted'), (1,'img','adopted-3d')],
 's08': [(0,'clip',('adopted-day3-1000-1030.mp4',0,1,None))],
 's09': [(0,'img','control')],
 's10': [(0,'img','adopted-3d'), (2,'img','end')],
}
