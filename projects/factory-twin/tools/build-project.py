# Writes this Project's documents (docs/, trace/citations.json, factory/, bim/) from the FT7 outputs
# of Editor Platform (tools/twin/: plant.ts, ft7.demo.ts, ft7-facts.test.ts).
#   FT7_OUT  the folder with plant-*.json, experiment-table.csv and results.json
#   OWD      (optional) an open-workflow-definitions checkout: the items and citations are copied
#            into a fixture and checked with its scripts/fixture.mjs.
# Usage: FT7_OUT=/path/to/ft7 [OWD=/path/to/open-workflow-definitions] python tools/build-project.py
import csv, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.environ.get('FT7_OUT') or sys.exit('FT7_OUT（FT7 の出力の置き場）を設定してください')
R = json.load(open(f'{SRC}/results.json'))
def content(name):
    d = json.load(open(f'{SRC}/{name}'))
    return d.get('draft', {}).get('content', d)
PLANNED, ADOPTED, HALL = content('plant-planned.json'), content('plant-adopted.json'), content('plant-hall.json')
EXP = list(csv.DictReader(open(f'{SRC}/experiment-table.csv')))
pl, ad = R['planned'], R['adopted']
NOTE = '架空の工場です。実在の会社・工場・製品とは関係がありません。数値は説明のための仮定です。'
def f1(x): return f'{x:.1f}'
def comma(n): return f'{n:,}'

# ---------------------------------------------------------------- items (id, fields, cites)
ITEMS = {}  # deliverable -> list of items
def add(deliv, id, name, cites=(), **fields):
    ITEMS.setdefault(deliv, []).append({'id': id, 'name': name, **fields, 'cites': list(cites)})

# Requirements
RQ = [
    ('RQ-01', '1 日の生産数', '量', '2 シフトで 1 日 720 台以上（暦の 1 時間あたり 30 台）', '企画の想定', '仮定'),
    ('RQ-02', 'タクト', 'タクト', '85 秒以下（稼働 17 時間 ÷ 720 台）', 'RQ-01 と RQ-06 から計算', '推定'),
    ('RQ-03', 'リードタイム', '品質', 'ハウジングの受け入れから出荷まで、平均 45 分以下', '在庫を持たない方針（仮定）', '仮定'),
    ('RQ-04', '建屋に収める', '建屋', '既存の平屋の建屋（72 × 36 m、12 m の柱の格子）に収め、柱・壁・扉と干渉しない', '建屋のモデル（bim/plant-hall.bim.json）', '確か'),
    ('RQ-05', '人の数', '人', '組立と梱包の作業者は 1 シフト 4 人まで、検査員は 1 人', '人員の計画（仮定）', '仮定'),
    ('RQ-06', '稼働の時間', '稼働の時間', 'ラインは 2 シフト（6:00〜14:30、14:30〜23:00）。キッティングは 24 時間', '勤務の計画（仮定）', '仮定'),
    ('RQ-07', '全数の検査', '品質', '出荷の前に全数を最終の検査台で検査する', '品質の方針（仮定）', '仮定'),
    ('RQ-08', '部品の搬送', '搬送', '電動機とインバーターは、キッティングの置き場から AGV で最終組立へ運ぶ', '物流の方針（仮定）', '仮定'),
]
for id, name, kind, target, source, cert in RQ:
    add('production-requirements', id, name, kind=kind, target=target, source=source, certainty=cert)

# Products and operations
add('process-plan', 'PT-01', '架空の e-Axle（電動機・インバーター・減速機を一つにした駆動の部品）', ['RQ-01', 'RQ-07'],
    mix='100%', parts='ハウジング・歯車セット・電動機・インバーター', design='架空（設計の版は無い。部品の名前だけ）')
OPS = [
    ('OP-001', 'ハウジングの加工', None, '三角分布 170〜185〜215 秒', '加工機（3 台の並列）'),
    ('OP-002', '洗浄', 'OP-001', '一定 48 秒', '洗浄機'),
    ('OP-003', '減速機の組付け（ハウジング＋歯車セット）', 'OP-002', '正規分布 平均 62 秒・標準偏差 6 秒（45 秒以上）', '組立の作業者 1 人'),
    ('OP-004', '電動機とインバーターのキッティングと搬送', None, '積み 15 秒・降ろし 15 秒・走行 1 m/s', 'AGV'),
    ('OP-005', '最終組立（減速機＋電動機＋インバーター）', 'OP-003', '正規分布 平均 68 秒・標準偏差 7 秒（50 秒以上）', '組立の作業者 2 人'),
    ('OP-006', '最終の検査', 'OP-005', '対数正規分布 平均 64 秒・標準偏差 9 秒', '検査員 1 人'),
    ('OP-007', '梱包', 'OP-006', '正規分布 平均 40 秒・標準偏差 4 秒（30 秒以上）', '組立の作業者 1 人（梱包の技能）'),
]
for id, name, after, time, skill in OPS:
    cites = ['PT-01'] + ([after] if after else []) + (['OP-004'] if id == 'OP-005' else [])
    add('process-plan', id, name, cites, product='PT-01', after=', '.join(cites[1:]) or None, time=time, skill=skill)

# Resources: one per factory object, the fleet and the worker pools
OBJ_OP = {'machining': 'OP-001', 'wash': 'OP-002', 'assembly-1': 'OP-003', 'assembly-2': 'OP-005', 'test': 'OP-006', 'pack': 'OP-007'}
KIND = {'source': '投入口', 'parallel': '並列の設備', 'station': '設備', 'buffer': 'バッファ', 'conveyor': 'コンベヤ', 'assembly': '組立', 'drain': '出口'}
JA = {'in-housing': 'ハウジングの受け入れ', 'machining': 'ハウジングの加工セル', 'wash': '洗浄機', 'buffer-wash': '洗浄後の棚',
      'conveyor-1': '移送のコンベヤ', 'in-gearset': '歯車セットの供給', 'buffer-gear': '歯車セットの棚', 'assembly-1': '減速機の組付け',
      'in-motor': '電動機のキッティング', 'store-motor': '電動機の棚', 'in-inverter': 'インバーターのキッティング', 'store-inverter': 'インバーターの棚',
      'assembly-2': '最終組立', 'conveyor-2': '検査のコンベヤ', 'test': '最終の検査台', 'pack': '梱包', 'ship': '出荷口'}
RS = {}
def capacity(o):
    k = o['kind']
    if k == 'parallel': return f"{o['count']} 台"
    if k == 'buffer': return f"{o['capacity']} 個"
    if k == 'conveyor': return f"長さ {o['lengthMm']/1000:g} m・速さ {o['speedMmS']/1000:g} m/s・部品 {o['partLengthMm']} mm・溜める"
    if k == 'source': return f"{o['interval']['value']/1000:g} 秒ごと" + ('（シフトの間）' if o.get('calendarId') else '（24 時間）')
    if k == 'drain': return '無制限'
    if k == 'assembly': return f"1 台・作業者 {o['workers']['count']} 人"
    return '1 台' + (f"・作業者 {o['workers']['count']} 人" if o.get('workers') else '')
for i, o in enumerate(ADOPTED['objects']):
    id = f'RS-{i+1:03d}'; RS[o['id']] = id
    cites = [OBJ_OP[o['id']]] if o['id'] in OBJ_OP else []
    if o['id'] in ('in-motor', 'in-inverter', 'store-motor', 'store-inverter'): cites = ['OP-004', 'RQ-06']
    if o['id'] == 'test': cites.append('RQ-07')
    if o['kind'] == 'source' and o.get('calendarId'): cites.append('RQ-06')
    add('line-model', id, JA[o['id']], cites, kind=KIND[o['kind']], capacity=capacity(o), model=o['id'],
        shift='2 シフト' if o.get('calendarId') else '24 時間', at=f"({o['at']['x']/1000:g}, {o['at']['y']/1000:g}) m")
n = len(ADOPTED['objects'])
RS['agv'], RS['assemblers'], RS['testers'] = f'RS-{n+1:03d}', f'RS-{n+2:03d}', f'RS-{n+3:03d}'
add('line-model', RS['agv'], 'キッティングの AGV', ['OP-004', 'RQ-08'], kind='搬送車', capacity='計画 2 台 → 採用 6 台・1 m/s・幅 1 m', model='fleet agv', shift='24 時間')
add('line-model', RS['assemblers'], '組立の作業者', ['OP-003', 'OP-005', 'OP-007', 'RQ-05'], kind='作業者', capacity='計画 3 人 → 採用 4 人（技能：組立・梱包）', model='workerPool assemblers', shift='2 シフト')
add('line-model', RS['testers'], '検査員', ['OP-006', 'RQ-05'], kind='作業者', capacity='1 人（技能：検査）', model='workerPool testers', shift='2 シフト')
for i, l in enumerate(ADOPTED['links']):
    cites = [RS[l['from']], RS[l['to']]] + ([RS['agv']] if l.get('transport') else [])
    add('line-model', f'CN-{i+1:03d}', f"{JA[l['from']]} → {JA[l['to']]}", cites, **{'from': RS[l['from']], 'to': RS[l['to']]},
        rule='AGV で運ぶ（呼ばれた車が棚で積み、最終組立で降ろす）' if l.get('transport') else '出口は一つ（振り分けなし）')

# Input data
DS = [
    ('DS-01', '加工の時間', '作業時間', '三角分布 170・185・215 秒', '設備の仕様の想定', '推定', ['machining', 'OP-001']),
    ('DS-02', '加工セルの故障と修理', '故障', '故障の間隔 指数分布 平均 3 時間、修理 三角分布 8・15・40 分', '似た設備の想定', '仮定', ['machining']),
    ('DS-03', '洗浄の時間', '作業時間', '一定 48 秒', '設備の仕様の想定', '推定', ['wash', 'OP-002']),
    ('DS-04', '減速機の組付けの時間', '作業時間', '正規分布 平均 62 秒・標準偏差 6 秒・下限 45 秒', '作業の分析の想定', '推定', ['assembly-1', 'OP-003']),
    ('DS-05', '最終組立の時間', '作業時間', '正規分布 平均 68 秒・標準偏差 7 秒・下限 50 秒（2 人）', '作業の分析の想定', '推定', ['assembly-2', 'OP-005']),
    ('DS-06', '検査の時間', '作業時間', '対数正規分布 平均 64 秒・標準偏差 9 秒', '検査の手順の想定', '推定', ['test', 'OP-006']),
    ('DS-07', '検査台の故障と修理', '故障', '故障の間隔 指数分布 平均 6 時間、修理 三角分布 5・10・30 分', '似た設備の想定', '仮定', ['test']),
    ('DS-08', '梱包の時間', '作業時間', '正規分布 平均 40 秒・標準偏差 4 秒・下限 30 秒', '作業の分析の想定', '推定', ['pack', 'OP-007']),
    ('DS-09', 'ハウジングと歯車セットの投入', '投入の計画', 'ハウジング 66 秒ごと、歯車セット 60 秒ごと（30 秒ずらす）。シフトの間だけ', '投入の計画（仮定）', '仮定', ['in-housing', 'in-gearset']),
    ('DS-10', '電動機とインバーターのキッティング', '投入の計画', 'それぞれ 40 秒ごと、24 時間。棚は 12 個まで', '物流の計画（仮定）', '仮定', ['in-motor', 'in-inverter', 'store-motor', 'store-inverter']),
    ('DS-11', 'AGV の走りと積み降ろし', '搬送', '1 m/s、積み 15 秒・降ろし 15 秒、幅 1 m、通路は 6 m 以下の区間に分け 1 区間 1 台', 'AGV の仕様の想定', '推定', ['agv', 'OP-004']),
    ('DS-12', '歩く速さ', '人', '1.2 m/s（作業者・検査員）。待つ場所は最終組立と検査台のそば', '一般的な値', '推定', ['assemblers', 'testers']),
    ('DS-13', 'コンベヤ', '搬送', '0.25 m/s、部品の長さ 600 mm、溜める（移送 16 m・検査 8 m）', '設備の仕様の想定', '推定', ['conveyor-1', 'conveyor-2']),
    ('DS-14', 'シフトの暦', '暦', '6:00〜14:30・14:30〜23:00、休憩と休日はモデルに入れていない', 'RQ-06', '仮定', ['in-housing', 'machining', 'wash', 'assembly-1', 'assembly-2', 'test', 'pack']),
]
for id, name, kind, dist, src, cert, on in DS:
    add('input-data', id, name, [x if x.startswith('OP-') else RS[x] for x in on], kind=kind, distribution=dist, source=src, certainty=cert)

# Layout
ZN = [
    ('ZN-01', '加工の区画（南西）', '(8〜32, 3〜7) m', ['in-housing', 'machining', 'wash', 'buffer-wash']),
    ('ZN-02', '移送と減速機の組付け（南）', '(33〜57, 3〜11) m', ['conveyor-1', 'in-gearset', 'buffer-gear', 'assembly-1']),
    ('ZN-03', '最終組立・検査・梱包の区画（東）', '(63.5〜69, 4.5〜34) m', ['assembly-2', 'conveyor-2', 'test', 'pack', 'ship']),
    ('ZN-04', 'キッティングの置き場（北西）', '(6〜22, 29〜34) m', ['in-motor', 'store-motor', 'in-inverter', 'store-inverter']),
    ('ZN-05', 'AGV の通路（一方通行の環）', 'y = 17 m を東へ、x = 61〜62.8 m で最終組立、y = 28 m を西へ、x = 4 m を南へ。幅 1 m', ['agv']),
    ('ZN-06', '作業者の待つ場所', '(63, 14) m と (63, 22) m', ['assemblers', 'testers']),
]
for id, name, where, rs in ZN:
    add('layout-plan', id, name, [RS[x] for x in rs], where=where)
LI = [
    ('LI-01', '柱・壁・扉との干渉', '干渉', '建屋のモデル（柱 10 本・壁 4 枚・扉 5 つ）と設備の箱の干渉を Editor Platform の検査で確かめ、0 件。', '確かめた（0 件）', ['ZN-01', 'ZN-02', 'ZN-03', 'ZN-04']),
    ('LI-02', 'AGV の通路と柱の列', '通路', 'AGV の通路（y = 17 m と y = 28 m）は柱の列（y = 12 m・24 m）から 4〜5 m 離れて通る。柱の間を横切るのは x = 4 m と x = 61〜62.8 m だけ。', '受け入れた', ['ZN-05']),
    ('LI-03', 'AGV と作業者の動線の交わり', '動線の交わり', '最終組立のそば（x = 61〜63 m）で、AGV の降ろす場所と作業者の待つ場所が近い。モデルには人の通路が無く、人と AGV はぶつからない前提で動く。', '持ち越した（人の通路を区画にし、交わりを模擬するのは次の版）', ['ZN-05', 'ZN-06', 'assembly-2']),
    ('LI-04', '東の人の扉の前', '狭い所', '東の壁の人の扉（y = 18 m）の前は、検査のコンベヤ（x = 66 m）から壁まで 6 m。通れる幅は残る。', '受け入れた', ['ZN-03']),
]
for id, name, kind, text, action, on in LI:
    add('layout-plan', id, name, [x if x.startswith('ZN-') else RS[x] for x in on], kind=kind, text=text, action=action)

# Validation (hand calculations from the model's numbers)
loop = 57 + 8 + 1.8 + 19 + 42.8 + 12 + 4 + 11  # m, the one-way rectangle
trip_s = loop / 1.0 + 30
agv_bound = 2 * 3600 / trip_s / 2  # units per hour (two trips per unit)
blocked = pl['fleet']['shares']['blocked']
test_bound = 3600 / 64 * (360 / (360 + 15)) * (17 / 24)
test_work = ad['perHour'] * 64 / 3600 * 100
VC = [
    ('VC-01', '同じ種で同じ結果', '動きの確かめ', '計画案を種 1 で 2 回流す', '同じ結果', '同じ（生産数・状態の内訳・AGV の内訳まで一致）' if R['repeatSame'] else '違う', '合' if R['repeatSame'] else '否', ['RS-002', 'DS-01']),
    ('VC-02', 'AGV 2 台の上限（手計算）', '手計算との比べ', f'環の長さ {loop:.1f} m、1 回の運び {trip_s:.0f} 秒（走り＋積み降ろし 30 秒）。1 台に部品 2 つ',
     f'上限 {agv_bound:.1f} 台/時。塞がれた割合 {blocked}% を引くと {agv_bound*(1-blocked/100):.1f} 台/時', f"{pl['perHour']} 台/時", '合（差 0.1 未満）', [RS['agv'], 'DS-11']),
    ('VC-03', '検査台の上限（手計算）', '手計算との比べ', '採用案。検査 64 秒、故障で使える割合 96%（6 時間 ÷ 6 時間 15 分）、稼働 17/24',
     f'上限 {test_bound:.1f} 台/時、検査台の働く割合 {test_work:.1f}%', f"{ad['perHour']} 台/時、働く割合 {ad['states']['test']['working']}%", '合', [RS['test'], 'DS-06', 'DS-07']),
    ('VC-04', 'AGV を 20 台に', '極端な条件', '採用案の AGV だけ 20 台', '検査台が上限なので 6 台と同じ', f"{R['agv20']['perHour']} 台/時（6 台と同じ）、AGV の塞がれ {R['agv20']['fleet']['shares']['blocked']}%", '合', [RS['agv'], RS['test']]),
    ('VC-05', '組立の作業者を 1 人に', '極端な条件', '採用案の組立の作業者だけ 1 人', '最終組立（2 人要る）が始まらず 0 台', f"{R['assemblers1']['produced']} 台", '合（ただし道具は前もって知らせない：FD-012）', [RS['assemblers'], RS['assembly-2']]),
    ('VC-06', '故障を無くす', '極端な条件', '採用案から加工セルと検査台の故障を除く', f'検査台の上限 {3600/64*17/24:.1f} 台/時を超えず、採用案より多い', f"{R['noFailures']['perHour']} 台/時", '合', ['DS-02', 'DS-07']),
    ('VC-07', '流す長さ', '動きの確かめ', '採用案を 8 日・30 日・90 日（慣らし 1 日）', '差が 1% 未満', f"{ad['perHour']}・{R['adopted30']['perHour']}・{R['adopted90']['perHour']} 台/時", '合（8 日で足りる）', ['RQ-01', RS['test']]),
    ('VC-08', '建屋との干渉', '動きの確かめ', '建屋のモデル v1 と配置', '0 件', f"{len(R['hallIssues'])} 件", '合', ['RQ-04', RS['machining'], RS['assembly-2']]),
    ('VC-09', 'ブラウザーと node の結果', '動きの確かめ', '採用案 8 日を Playground（Worker）と node で', '同じ', '6,601 台・34.4 台/時（どちらも）', '合', [RS['test']]),
]
for id, name, kind, cond, exp, act, res, on in VC:
    add('validation-record', id, name, on, kind=kind, condition=cond, expected=exp, actual=act, result=res)

# Scenarios: the experiment's combinations, then two more on the adopted case
SC = {}
for i, row in enumerate(EXP):
    a, w = int(row['fleet-count:agv']), int(row['pool-count:assemblers'])
    id = f'SC-{i+1:02d}'; SC[(a, w)] = id
    name = f'AGV {a} 台・組立の作業者 {w} 人' + ('（計画案）' if (a, w) == (2, 3) else '（採用案）' if (a, w) == (6, 4) else '')
    add('experiment-record', id, name, [RS['agv'], RS['assemblers']], change=f'AGV {a} 台、組立の作業者 {w} 人（ほかは計画案のまま）',
        result=f"{float(row['throughputPerHour_mean']):.1f} 台/時（95% 区間 {float(row['throughputPerHour_ci95_low']):.1f}〜{float(row['throughputPerHour_ci95_high']):.1f}）、リードタイム {float(row['leadTimeMeanMs_mean'])/60000:.0f} 分、仕掛り {float(row['wipMean_mean']):.0f}")
add('experiment-record', 'SC-09', '採用案で加工機を 2 台に', [RS['machining'], 'DS-01'], change='採用案の加工セルを 3 台から 2 台に', result=f"{R['machines2']['perHour']} 台/時")
add('experiment-record', 'SC-10', '採用案で洗浄後の棚を 2 個に', [RS['buffer-wash']], change='採用案の洗浄後の棚を 6 個から 2 個に', result=f"{R['buffer2']['perHour']} 台/時")
S = lambda a, w: SC[(a, w)]
FD = [
    ('FD-001', '計画案は量が足りない', [S(2, 3), 'RQ-01', 'RQ-02'], '生産数', f"計画案は {pl['perHour']} 台/時（8 日で {comma(pl['produced'])} 台）。RQ-01 の 30 台/時に届かない。", f"{pl['perHour']} 台/時"),
    ('FD-002', '計画案の律速は AGV', [S(2, 3), RS['agv'], RS['assembly-2']], 'ボトルネック',
     f"最終組立は {pl['states']['assembly-2']['waiting']}% が部品待ち。AGV は 2 台とも止まらずに走り、{blocked}% は最終組立に同じ部品が先に届いていて降ろせずに待つ。部品の呼び出しから着くまで平均 {pl['fleet']['callWaitS']} 秒。", f'AGV の塞がれ {blocked}%'),
    ('FD-003', 'ボトルネックの順位が搬送車を数えない（道具）', [S(2, 3), RS['agv'], RS['test']], '道具',
     f"計画案で Editor Platform のボトルネックの順位は 1 位が最終の検査台（{pl['bottlenecks'][0]['share']}%）。順位は設備だけを比べ、AGV と作業者を数えないので、律速の AGV が出てこない。", '検査台 1 位'),
    ('FD-004', '計画案は仕掛りが多くリードタイムが長い', [S(2, 3), 'RQ-03'], 'リードタイム', f"平均 {pl['leadMeanMin']:.0f} 分（95% 点 {pl['leadP95Min']:.0f} 分）、仕掛り平均 {pl['wipMean']:.0f}。RQ-03 の 45 分に届かない。", f"{pl['leadMeanMin']:.0f} 分"),
    ('FD-005', 'AGV は 6 台で飽和', [S(2, 4), S(4, 4), S(6, 4), S(8, 4), RS['agv']], '比べ', 'AGV 2 台・4 台・6 台・8 台（作業者 4 人）で 13.8・27.4・34.2・34.2 台/時（各 5 回の平均）。6 台より増やしても変わらない。', '6 台'),
    ('FD-006', '組立の作業者 3 人では 23 台/時で頭打ち', [S(4, 3), S(6, 3), S(8, 3), RS['assemblers'], 'RQ-05'], '比べ',
     f"3 人では AGV を増やしても 23.2〜23.3 台/時。作業者は {R['agv6a3']['workers'][0]['busy']}% が手いっぱいで、減速機の組付けは {R['agv6a3']['states']['assembly-1']['unstaffed']}% が人待ち。", '23.3 台/時'),
    ('FD-007', '採用案は要件を満たす', [S(6, 4), 'RQ-01', 'RQ-02', 'RQ-03', 'RQ-05'], '生産数',
     f"{ad['perHour']} 台/時（1 日 {ad['perHour']*24:.0f} 台、タクト {17*3600/(ad['perHour']*24):.0f} 秒）、リードタイム平均 {ad['leadMeanMin']:.0f} 分、仕掛り {ad['wipMean']:.0f}。作業者 4 人の働く割合 {ad['workers'][0]['busy']}%。", f"{ad['perHour']} 台/時"),
    ('FD-008', '採用案の次の律速は検査台と最終組立', [S(6, 4), RS['test'], RS['assembly-2']], 'ボトルネック',
     f"検査台 {ad['bottlenecks'][0]['share']}%・最終組立 {ad['bottlenecks'][1]['share']}%。検査員の働く割合 {ad['workers'][1]['busy']}%。90 日流しても {R['adopted90']['perHour']} 台/時で変わらない。", '検査台'),
    ('FD-009', '加工機は減らせない', ['SC-09', RS['machining'], 'RQ-01'], '比べ', f"加工機 2 台では {R['machines2']['perHour']} 台/時で、加工セルが律速（{R['machines2']['bottlenecks'][0]['share']}%）。", f"{R['machines2']['perHour']} 台/時"),
    ('FD-010', '洗浄後の棚は小さくできる', ['SC-10', RS['buffer-wash']], '比べ', f"棚 2 個でも {R['buffer2']['perHour']} 台/時、リードタイム {R['buffer2']['leadMeanMin']:.0f} 分。6 個は加工セルの故障の間の余裕。", '差なし'),
    ('FD-011', '1 年を一度に流せない（道具）', [S(6, 4)], '道具',
     f"採用案は 1 日に約 {ad['events']/8/1000:.0f} 千の事象。1 年（365 日）は事象の上限 1,000 万を超えて止まる。90 日（{R['adopted90']['events']/1e6:.1f} 百万の事象）は node で {R['adopted90']['ms']/1000:.1f} 秒、Playground で 6.9 秒。", '90 日まで'),
    ('FD-012', '作業者が足りない設備を知らせない（道具）', [S(6, 4), RS['assemblers']], '道具', '組立の作業者を 1 人にすると、2 人要る最終組立は始まらず、生産 0 台のまま流れ終わる。モデルの検査は何も言わない。', '0 台'),
    ('FD-013', '3D が建屋の全体を枠に入れ、設備が小さい（道具）', [S(6, 4)], '道具', '3D の再生は建屋の全体を枠に入れる。72 m の建屋では人と AGV が小さく、映像はホイールで寄って撮った。', '寄って撮る'),
    ('FD-014', 'PLC の走査の上限が 8 日に届かない（道具）', [S(6, 4), RS['conveyor-2']], '道具', f"走査 100 ミリ秒では 2 日で {comma(R['control']['ok']['control']['scans'])} 回。8 日（慣らし込み 9 日）は上限 500 万を超えるので、制御の確認は 2 日で流した。", '2 日まで'),
]
for id, name, cites, kind, text, value in FD:
    add('experiment-record', id, name, cites, scenario=', '.join(c for c in cites if c.startswith('SC-')), kind=kind, text=text, value=value)

# Control
ctl = R['control']
def hm(ms): h = ms / 3600000; return f'{int(h)//24 + 1} 日目 {int(h)%24}:{int(round(h%1*60)):02d}'
CC = [
    ('CC-01', '正しい制御で流れる', '正しい制御', '検査のコンベヤの終わりに部品があり、検査台が空いたら門を開ける。モーターは門の前が詰まったら止める（F174 のはしご）',
     f"制御なしと同じ流れ（2 日で {comma(ctl['none']['produced'])} 台）", f"{comma(ctl['ok']['produced'])} 台（{ctl['ok']['perHour']} 台/時）", '合', [RS['conveyor-2'], RS['test']]),
    ('CC-02', '誤った制御を見つける', 'わざと誤った制御', '止めた状態を戻す段が無いはしご（F175 のはしご）', '検査のコンベヤが止まり、止まりとして知らせる',
     f"{ctl['bug']['produced']} 台で止まる。{hm(ctl['bug']['control']['stalls'][0]['sinceMs'])} から「検査のコンベヤのモーターが止まっている」", '合', [RS['conveyor-2']]),
    ('CC-03', 'シフトの終わりは止まりでない', '正しい制御', 'CC-01 の終わり（2 日目 23:00 にシフトが終わる）', '止まりを知らせない',
     f"{hm(ctl['ok']['control']['stalls'][0]['sinceMs'])} から止まりとして知らせる（シフトの外でラインが休んでいるだけ）", '否（道具の誤報）', [RS['conveyor-2']]),
]
for id, name, kind, cond, exp, act, res, on in CC:
    add('control-record', id, name, on, kind=kind, condition=cond, expected=exp, actual=act, result=res)

# Decisions (Markdown) and scenes
DC = [
    ('DC-01', f'AGV 6 台・組立の作業者 4 人の案（{S(6, 4)}）を採る', [S(6, 4), 'FD-001', 'FD-002', 'FD-004', 'FD-005', 'FD-006', 'FD-007'],
     '採る', 'RQ-01〜RQ-03 を満たす一番小さな組み合わせ。AGV は 6 台で飽和し（FD-005）、3 人では頭打ち（FD-006）。', '検査員の働く割合が 93% で、検査の時間が延びると量が落ちる（FD-008）。'),
    ('DC-02', '加工機は 3 台のまま', ['SC-09', 'FD-009'], '受け入れた', '2 台では 30 台/時に届かない。', 'なし'),
    ('DC-03', '洗浄後の棚は 6 個のまま', ['SC-10', 'FD-010'], '受け入れた', '量とリードタイムは 2 個でも変わらないが、加工セルの故障（平均 3 時間ごと）の間の余裕として残す。', '置き場の広さ（3 × 1.6 m）'),
    ('DC-04', '検査台の 2 台目は次の版で比べる', ['FD-008'], '持ち越した', '採用案は要件を満たす。次に量を増やすときの律速は検査台と最終組立。', '検査の時間が延びると 30 台/時を下回る'),
    ('DC-05', '配置の事項の処置', ['LI-01', 'LI-02', 'LI-03', 'LI-04'], '受け入れた・持ち越した', '干渉は 0 件。人と AGV の動線の交わり（LI-03）は、人の通路を区画にして次の版で模擬する。', 'LI-03'),
    ('DC-06', '検査のコンベヤの制御は正しいはしごを採る', ['CC-01', 'CC-02', 'CC-03'], '受け入れた', '正しいはしごで流れは変わらず、誤ったはしごは止まりとして見つかる。シフトの終わりの誤報（CC-03）は道具の課題。', 'CC-03 の誤報'),
    ('DC-07', 'モデルを実験に使ってよいとする', ['VC-01', 'VC-02', 'VC-03', 'VC-04', 'VC-05', 'VC-06', 'VC-07', 'VC-08', 'VC-09'], '受け入れた', '手計算と極端な条件の確認がすべて合う。実績との比べは、架空の工場なので無い。', '入力のデータは推定と仮定（DS-01〜DS-14）'),
    ('DC-08', '道具の課題は Editor Platform に送る', ['FD-003', 'FD-011', 'FD-012', 'FD-013', 'FD-014', 'CC-03'], '持ち越した', '計画の結論は変わらないが、使う人が誤りやすい。', 'ボトルネックの順位を鵜呑みにすると、計画案の律速（AGV）を見落とす'),
]
for id, name, cites, action, why, risk in DC:
    add('plan-approval', id, name, cites, action=action, why=why, risk=risk, who='Claude（案）')
PS = [
    ('PS-01', 'はじめに：架空の e-Axle の工場', ['DC-01'], '0:00', '題名と注意書き（架空の工場）'),
    ('PS-02', '建屋とライン', [S(2, 3)], '0:20', '建屋の BIM、平面の配置。加工から出荷までと、AGV の環'),
    ('PS-03', '計画案を流す', [S(2, 3), 'FD-001', 'FD-002', 'FD-003'], '0:50', '13.8 台/時。最終組立が部品を待ち、AGV が律速。順位の表は検査台を 1 位に出す'),
    ('PS-04', '実験 40 回', [f'SC-{i:02d}' for i in range(1, 9)] + ['FD-005', 'FD-006'], '1:30', 'AGV 2〜8 台 × 作業者 3〜4 人、5 回ずつ。6 台・4 人で飽和'),
    ('PS-05', '採用案', [S(6, 4), 'DC-01', 'FD-007', 'FD-008'], '2:05', '34.4 台/時、リードタイム 30 分。次の律速は検査台'),
    ('PS-06', '3 日目 10:00 からの 30 分', [S(6, 4)], '2:35', '3D の再生を 60 倍で。AGV と作業者と部品が動く'),
    ('PS-07', '制御の確認', ['DC-06'], '3:05', '正しいはしごと誤ったはしご'),
    ('PS-08', 'おわりに', ['DC-08'], '3:30', 'Project と定義の置き場、道具の課題'),
]
for id, name, cites, at, what in PS:
    add('presentation-record', id, name, cites, at=at, what=what)

EXCEPTIONS = [
    {'rule': 'requirement-covered', 'item': 'RQ-04', 'reason': '建屋の条件は妥当性の確認（VC-08）と配置の事項（LI-01）で扱う'},
    {'rule': 'resource-covered-by-connection', 'item': RS['assemblers'], 'reason': '作業者は流れの外で組付け・最終組立・梱包を受け持つ'},
    {'rule': 'resource-covered-by-connection', 'item': RS['testers'], 'reason': '検査員は流れの外で検査を受け持つ'},
    {'rule': 'resource-covered-by-data', 'item': RS['buffer-wash'], 'reason': 'バッファは容量だけで動き、時間のデータが要らない'},
    {'rule': 'resource-covered-by-data', 'item': RS['buffer-gear'], 'reason': 'バッファは容量だけで動き、時間のデータが要らない'},
    {'rule': 'resource-covered-by-data', 'item': RS['ship'], 'reason': '出口は時間のデータが要らない'},
    {'rule': 'scenario-shown', 'item': 'SC-09', 'reason': '採用案の後の小さな比べは記録の表だけで示す'},
    {'rule': 'scenario-shown', 'item': 'SC-10', 'reason': '採用案の後の小さな比べは記録の表だけで示す'},
]

# ---------------------------------------------------------------- writing
os.makedirs(f'{P}/docs', exist_ok=True); os.makedirs(f'{P}/trace', exist_ok=True)
os.makedirs(f'{P}/factory', exist_ok=True); os.makedirs(f'{P}/bim', exist_ok=True)
def dump(path, value): open(f'{P}/{path}', 'w').write(json.dumps(value, ensure_ascii=False, indent=1) + '\n')
def strip(items, keep_cites=False):
    return [{k: v for k, v in it.items() if (keep_cites or k != 'cites') and v is not None} for it in items]
def bykind(deliv, prefix): return [it for it in ITEMS[deliv] if it['id'].startswith(prefix)]

dump('factory/plant-planned.factory.json', PLANNED)
dump('factory/plant-adopted.factory.json', ADOPTED)
dump('bim/plant-hall.bim.json', HALL)

PROCESS = {
    '対象': '架空の e-Axle（電動の駆動の部品）を組み立てる工場「Minato e-Drive Plant No. 2」の 1 本のライン。' + NOTE,
    '範囲': 'ハウジングの受け入れから出荷まで（加工・洗浄・減速機の組付け・最終組立・検査・梱包）と、電動機とインバーターのキッティングと AGV の搬送。調達・保全の計画・費用は含めない',
    '出口': '1 日 720 台・リードタイム 45 分以下を満たす案が、モデルの妥当性と制御の確認を経て選ばれ、承認を求める版と紹介の映像がそろった状態',
    '工程の順': [{'工程': p['name'], 'id': p['id'], '前の工程': p['after'], '通る・省く': '通る'} for p in json.load(open(f'{P}/definition.json'))['phases']],
    '責任とAIの関与': {
        '承認する人': 'Ryo さん（全工程）',
        'AIに任せた作業': '要件の下書き、ラインのモデルと配置、入力のデータの仮定、妥当性の確認と実験の実行、所見の一覧、映像の組み立て',
        '人が決めること': '要件の値、採る案、残る危険の受け入れ、公開してよい範囲',
    },
    '公開と権利': {
        '名乗り方': '架空の工場。名前・製品・数値は作ったもの',
        '参考にした手法と製品名': '離散事象の工場のシミュレーション（物の流れ・ボトルネック・実験）という一般的な手法。既存の製品の名前・画面・資料は使わない',
        '出典': 'なし（すべて仮定）',
    },
    '道具': {
        'モデルと模擬': 'Editor Platform の工場（factory。FT1〜FT7）と建物（BIM）。PaoBub に工場の Editor はまだ無いので、モデルのファイル（factory/、bim/）は見るだけのファイルとして置く',
        '工程の定義': 'production-system-planning 1.0.0（open-workflow-definitions）',
    },
}
dump('docs/process-map.json', PROCESS)

md = ['# 生産の要件', '', NOTE, '', '## 製品と量', '',
      '架空の e-Axle 1 種類（PT-01）。2 シフトで 1 日 720 台、暦の 1 時間あたり 30 台、タクト 85 秒。', '', '## 要件', '']
for it in ITEMS['production-requirements']:
    md += [f"### {it['id']} {it['name']}", '', f"- 種類：{it['kind']}", f"- 目標：{it['target']}", f"- 出典：{it['source']}", f"- 確からしさ：{it['certainty']}", '']
md += ['## 確かでないこと', '', '- 要件の値はすべて企画の仮定。実在の需要や設備の仕様ではない。',
       '- 休憩・休日・段取り替え（1 品種なので無い）・不良と手直しはモデルに入れていない。', '']
open(f'{P}/docs/production-requirements.md', 'w').write('\n'.join(md))

dump('docs/process-plan.json', {'note': '工程の設計。経路：OP-001 → OP-002 → OP-003 → OP-005 → OP-006 → OP-007（OP-004 は最終組立へ部品を運ぶ）。', 'product': strip(bykind('process-plan', 'PT-')), 'operation': strip(bykind('process-plan', 'OP-'))})
dump('docs/line-model.json', {
    'note': '資源とつながり。モデルのファイル：factory/plant-planned.factory.json（計画案）、factory/plant-adopted.factory.json（採用案）。',
    'シフトと暦': '2 シフト 6:00〜14:30・14:30〜23:00（RQ-06）。キッティングと AGV は 24 時間。休憩と休日は入れていない',
    'モデルの版': {'工程の設計': 'docs/process-plan.json', 'ラインのモデル': f"{ADOPTED['name']}（schemaVersion {ADOPTED['schemaVersion']}）", 'まとめた所': '部品の名前は 6 種類、品種は 1 つ。ねじ締めや治具は作業時間にまとめた'},
    'resource': strip(bykind('line-model', 'RS-')), 'connection': strip(bykind('line-model', 'CN-'))})
dump('docs/input-data.json', {'note': '入力のデータ。値はすべて推定か仮定（架空の工場）。確かでないこと：作業時間の分布の形と、故障の間隔は効きが大きい（VC-06：故障を無くすと +6.6%）。', 'data-set': strip(ITEMS['input-data'])})
dump('docs/layout-plan.json', {'note': '配置の計画。建屋：bim/plant-hall.bim.json（平屋 72 × 36 m・高さ 8 m、柱 600 角を 12 m の格子に 10 本、壁 200、搬入の扉 4 m を 3 つ・人の扉 2 つ）。床の荷重は条件にしていない。',
                               'zone': strip(bykind('layout-plan', 'ZN-')), 'layout-issue': strip(bykind('layout-plan', 'LI-'))})
dump('docs/validation-record.json', {'note': '確認の条件：モデルは factory/ の 2 つのファイル、種 1、慣らし 1 日・流す長さ 8 日（VC-07 は 30・90 日）。node の計測は Node.js ' + R['node'] + '。',
                                     'validation-check': strip(ITEMS['validation-record'])})
exp_note = (f"実験の条件：計画案のモデルに、AGV 2・4・6・8 台 × 組立の作業者 3・4 人の 8 通り、5 回ずつ（種 1〜5）、慣らし 1 日・8 日。Playground の Worker で 40 回が {13.5:.1f} 秒。"
            f" SC-09・SC-10 は採用案の 8 日を 1 回（種 1）。映像：紹介の動画（tools/video/）と 3 日目 10:00〜10:30 の再生（60 倍）。")
dump('docs/experiment-record.json', {'note': exp_note, 'scenario': strip(bykind('experiment-record', 'SC-')), 'finding': strip(bykind('experiment-record', 'FD-')),
                                     '表': [{k: row[k] for k in ('fleet-count:agv', 'pool-count:assemblers', 'throughputPerHour_mean', 'throughputPerHour_ci95_low', 'throughputPerHour_ci95_high', 'leadTimeMeanMs_mean', 'wipMean_mean', 'bottleneck')} for row in EXP]})
dump('docs/control-record.json', {'note': '制御の確認。採用案の検査のコンベヤに、Editor Platform の見本のはしご（F174・F175）をつないだ。走査 100 ミリ秒、慣らしなし・2 日（FD-014）。',
                                  'つなぎ': [{'センサー': 'sn-c2-end', '資源': RS['conveyor-2'], '状態': 'ready（終わりに部品）', '変数': 'C1_AT_END'},
                                           {'センサー': 'sn-test-busy', '資源': RS['test'], '状態': 'occupied（検査中）', '変数': 'ST2_BUSY'},
                                           {'動作': 'ac-c2-run', '資源': RS['conveyor-2'], '信号': 'run（モーター）', '変数': 'C1_RUN'},
                                           {'動作': 'ac-c2-gate', '資源': RS['conveyor-2'], '信号': 'release（門）', '変数': 'C1_GATE'}],
                                  'control-case': strip(ITEMS['control-record'])})
md = ['# 計画の承認', '', 'この版の判断は、計画を作った Claude の案です。人の承認（Ryo さん）はまだです。', '', '## 判断', '']
for it in ITEMS['plan-approval']:
    md += [f"### {it['id']} {it['name']}", '', f"- 対象：{'、'.join(it['cites'])}", f"- 処置：{it['action']}", f"- 理由：{it['why']}", f"- 残る危険：{it['risk']}", f"- 決めた人：{it['who']}", '']
md += ['## 承認した版', '', '承認を求める版：factory/plant-adopted.factory.json（AGV 6 台・組立の作業者 4 人）、bim/plant-hall.bim.json v1、入力のデータ docs/input-data.json、制御 F174 のはしご。日付：まだ（承認待ち）。', '']
open(f'{P}/docs/plan-approval.md', 'w').write('\n'.join(md))
md = ['# 説明と記録', '', '## 場面', '']
for it in ITEMS['presentation-record']:
    md += [f"### {it['id']} {it['name']}", '', f"- 映像：{it['at']} から。{it['what']}", f"- 引用：{'、'.join(it['cites'])}", '']
md += ['## 注意書きと出典', '', f'- {NOTE}', '- 映像の初めから終わりまで、画面の隅に「架空の工場」と出す。', '- 既存のシミュレーションの製品の名前・画面・資料は使っていない。', '',
       '## 成果物の場所', '', '- 紹介の動画：この Project には入れていない（tools/video/ で組み直せる）。', '- 画像：assets/*.jpg', '']
open(f'{P}/docs/presentation-record.md', 'w').write('\n'.join(md))

cites = [{'from': it['id'], 'to': c} for items in ITEMS.values() for it in items for c in it['cites']]
dump('trace/citations.json', {'note': '引用の表。from の項目が to の項目をもとにしている。tools/build-project.py が書いた。', 'citations': cites, 'exemptions': EXCEPTIONS})
J = lambda path, kind: {'path': path, 'as': 'json', 'kind': kind, 'at': kind}
M = lambda path, kind, pre: {'path': path, 'as': 'markdown', 'rules': [{'kind': kind, 'match': f'^### ({pre}-\\d+)\\b'}]}
dump('workflow.json', {
    'format': 1, 'name': '架空の e-Axle の工場 生産システム計画', 'definition': {'id': 'production-system-planning', 'version': '1.0.0'}, 'citations': 'trace/citations.json',
    'deliverables': {
        'process-map': [{'path': 'docs/process-map.json', 'as': 'plain'}],
        'production-requirements': [M('docs/production-requirements.md', 'requirement', 'RQ')],
        'process-plan': [J('docs/process-plan.json', 'product'), J('docs/process-plan.json', 'operation')],
        'line-model': [J('docs/line-model.json', 'resource'), J('docs/line-model.json', 'connection'),
                       {'path': 'factory/plant-planned.factory.json', 'as': 'plain'}, {'path': 'factory/plant-adopted.factory.json', 'as': 'plain'}],
        'input-data': [J('docs/input-data.json', 'data-set')],
        'layout-plan': [J('docs/layout-plan.json', 'zone'), J('docs/layout-plan.json', 'layout-issue'), {'path': 'bim/plant-hall.bim.json', 'as': 'plain'}],
        'validation-record': [J('docs/validation-record.json', 'validation-check')],
        'experiment-record': [J('docs/experiment-record.json', 'scenario'), J('docs/experiment-record.json', 'finding')],
        'control-record': [J('docs/control-record.json', 'control-case')],
        'plan-approval': [M('docs/plan-approval.md', 'decision', 'DC')],
        'presentation-record': [M('docs/presentation-record.md', 'presentation-scene', 'PS')],
    },
    'phases': {p['id']: {'state': '進行中' if p['id'] in ('approval', 'presentation') else '受け入れ待ち'} for p in json.load(open(f'{P}/definition.json'))['phases']},
})
total = sum(len(v) for v in ITEMS.values())
print('items', total, 'citations', len(cites))

# ---------------------------------------------------------------- the fixture copy and its check
owd = os.environ.get('OWD')
if owd:
    fx = {'fixture': 1, 'id': 'factory-twin', 'title': '架空の e-Axle の工場（PaoBub の Project の写し）', 'purpose': 'Project の項目と引用を定義に照らして確かめるための写し。',
          'definition': {'id': 'production-system-planning', 'version': '1.0.0'}, 'exceptions': EXCEPTIONS,
          'deliverables': {'process-map': {'note': '進め方は docs/process-map.json'},
                           **{d: {'items': [{'id': it['id'], 'name': it['name'], 'cites': it['cites']} for it in items]} for d, items in ITEMS.items()}}}
    path = '/tmp/factory-twin-fixture.json'
    json.dump(fx, open(path, 'w'), ensure_ascii=False)
    js = f"import {{checkFixture}} from '{owd}/scripts/fixture.mjs'; import {{readFileSync}} from 'node:fs'; const p=checkFixture(JSON.parse(readFileSync('{owd}/definitions/production-system-planning.json')), JSON.parse(readFileSync('{path}'))); console.log(p.length ? p.join('\\n') : 'OK 0 problems'); process.exit(p.length?1:0)"
    sys.exit(subprocess.run(['node', '--input-type=module', '-e', js]).returncode)
