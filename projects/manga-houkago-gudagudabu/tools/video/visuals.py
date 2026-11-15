# (cue index where the segment starts, kind, arg). kind: ui = clips.mjs name, img = build/img/<arg>.png with slow zoom, kb options in arg tuple
V = {
 's01': [(0,'img','finish_p05'), (1,'img','title'), (2,'img','strip4')],
 's02': [(0,'ui','project'), (2,'phases',None), (3,'ui','rough_dec_thread'), (4,'ui','git_line'), (5,'ui','control'), (7,'ui','project_list')],
 's03': [(0,'ui','decisions'), (2,'ui','rough_dec')],
 's04': [(0,'ui','doc_concept'), (4,'ui','doc_concept_note'), (5,'ui','doc_art')],
 's05': [(0,'ui','sheet'), (4,'ui','relmap'), (5,'img','underlay_nemu'), (6,'img','art_nemu'), (7,'img','art_lineup')],
 's06': [(0,'ui','map'), (2,'img','stage36'), (4,'img','stage_two')],
 's07': [(0,'ui','structure'), (1,'ui','script'), (2,'ui','script_cont')],
 's08': [(0,'img','name_pages'), (1,'img','stage_two'), (2,'img','name_p1'), (4,'ui','storyboard_view')],
 's09': [(0,'img','rough_cmp'), (2,'img','rough_pages'), (4,'ui','rough_dec')],
 's10': [(0,'img','ink_three'), (2,'img','ink_layers'), (3,'ui','ink')],
 's11': [(0,'img','finish_layers'), (1,'ui','finish'), (5,'ui','finish_record')],
 's11b': [(0,'img','finish_all')] + [(i+1,'img',f'read_{i+1}') for i in range(8)],
 's12': [(0,'ui','editorial')],
 's13': [(0,'ui','decisions_top'), (1,'ui','learning')],
 's14': [(0,'img','strip4'), (1,'ui','project_list'), (2,'img','phases'), (3,'img','end')],
}
