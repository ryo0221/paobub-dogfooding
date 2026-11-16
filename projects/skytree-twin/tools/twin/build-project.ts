/**
 * TT5: write the PaoBub Project's tables (docs/*.json), the BIM and construction files and the
 * citations from the twin's model and plan. Markdown documents are written by hand.
 *   npx tsx tests/demo/sky/build-project.ts <project folder>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { bimElementMass, deriveBim } from '@editor-platform/bim-core';
import { liftTimes, scheduleConstruction, taskSpan } from '@editor-platform/construction-core';
import { twinBim } from './twin-bim';
import { tt5Construction } from './tt5-construction';

const dir = process.argv[2]!;
for (const d of ['docs', 'bim', 'construction', 'trace']) mkdirSync(`${dir}/${d}`, { recursive: true });
const bim = twinBim();
const derived = deriveBim(bim);
const doc = tt5Construction(bim);
const plan = scheduleConstruction(doc);
const span = (id: string) => taskSpan(doc.tasks.find((t) => t.id === id)!, plan.byId.get(id)!);
const kg = (ids: string[]) => ids.reduce((s, id) => { const m = bimElementMass(bim, derived, id); return s + (m.status === 'ok' ? m.kg : 0); }, 0);
const cites: { from: string; to: string }[] = [];
const cite = (from: string, ...to: string[]) => to.forEach((t) => cites.push({ from, to: t }));
const pad = (n: number, w: number) => String(n).padStart(w, '0');

// ---- Work units: one per task that builds elements. ----
const methodOf = (id: string): string =>
  id === 'found' ? 'MT-01'
  : /^steel-\d/.test(id) ? (doc.site!.lifts!.find((l) => l.taskId === id)!.craneId.startsWith('cc') ? 'MT-02' : 'MT-03')
  : /^deck\d-steel$/.test(id) ? 'MT-04'
  : /^(set|jack)-mast|^raise-/.test(id) ? 'MT-05'
  : /^pour-core/.test(id) ? 'MT-06'
  : /^deck\d-fit$/.test(id) ? 'MT-07'
  : id === 'podium' ? 'MT-08'
  : id === 'steel-top' ? 'MT-03' : id === 'top' ? 'MT-05' : id === 'finish' ? 'MT-07' : '';
const wu: Record<string, unknown>[] = [];
const wuOfTask = new Map<string, string>();
const wuOfElement = new Map<string, string>();
const material = (ids: string[]) => {
  const ms = new Set(ids.map((id) => { const e = bim.elements.find((x) => x.id === id) as { typeId?: string }; return bim.materials.find((m) => m.id === bim.types.find((t) => t.id === e?.typeId)?.materialId)?.name ?? '—'; }));
  return [...ms].join('・');
};
const conOf = (taskId: string) => (/^(set|jack)-mast|^raise-/.test(taskId) ? ['CO-07'] : /^pour-core/.test(taskId) ? ['CO-08'] : /^deck/.test(taskId) ? ['CO-09'] : taskId === 'podium' ? ['CO-11'] : ['CO-02']);
for (const t of doc.tasks) {
  if (!t.elementIds.length || t.action !== 'construct') continue;
  const id = `WU-${pad(wu.length + 1, 3)}`;
  const tons = Math.round(kg(t.elementIds) / 100) / 10;
  if (methodOf(t.id)) cite(methodOf(t.id), id);
  wu.push({ id, name: t.name.replace(/（.*）$/, '').replace(/を吹き抜けの底に据える$/, ''), 部材の数: t.elementIds.length, '質量（t）': tons, 材料: material(t.elementIds), 'BIMの要素': t.elementIds.length > 6 ? `${t.elementIds.slice(0, 3).join('、')} ほか ${t.elementIds.length - 3}` : t.elementIds.join('、'), もとにしたもの: conOf(t.id) });
  cite(id, ...conOf(t.id));
  wuOfTask.set(t.id, id);
  for (const e of t.elementIds) wuOfElement.set(e, id);
}
// ---- Tasks and milestones. ----
const tkOf = new Map(doc.tasks.map((t, i) => [t.id, `TK-${pad(i + 1, 3)}`]));
const task = doc.tasks.map((t) => {
  const id = tkOf.get(t.id)!;
  const s = span(t.id);
  const units = t.action === 'construct' ? [wuOfTask.get(t.id)!].filter(Boolean) : [...new Set(t.elementIds.map((e) => wuOfElement.get(e)!).filter(Boolean))];
  const method = methodOf(t.id) || (t.id === 'site' ? 'MT-09' : t.id === 'cranes-down' ? 'MT-03' : '');
  const pre = t.predecessors.map((p) => tkOf.get(p.taskId)!);
  if (method) cite(id, method);
  cite(id, ...units, ...pre);
  return { id, name: t.name, 'schedule の作業': t.id, 種類: t.action === 'raise' ? `引き上げ ${((t.raiseMm ?? 0) / 1000).toFixed(1)} m` : t.durationDays === 0 ? '節目' : '建てる', start: s.start, finish: s.finish, 日数: t.durationDays, 先行: pre, 施工単位: units, 工法: method || null };
});
const record: [string, string, string, string, string[]][] = [
  ['MS-01', '着工', '2008-07-14', 'site', ['CO-01']],
  ['MS-02', '鉄骨 100 m', '2009-08-07', 'steel-09', ['CO-01']],
  ['MS-03', '鉄骨 300 m', '2010-02-16', 'steel-29', ['CO-01']],
  ['MS-04', '塔体 497 m', '2010-10-23', 'steel-top', ['CO-01']],
  ['MS-05', '634 m', '2011-03-18', 'top', ['CO-01', 'CO-07']],
  ['MS-06', '竣工', '2012-02-29', 'finish', ['CO-01']],
];
for (const [mt, cos] of Object.entries({ 'MT-01': ['CO-02'], 'MT-02': ['CO-02', 'CO-06'], 'MT-03': ['CO-02', 'CO-06'], 'MT-04': ['CO-09'], 'MT-05': ['CO-07'], 'MT-06': ['CO-08'], 'MT-07': ['CO-09'], 'MT-08': ['CO-11'], 'MT-09': ['CO-03', 'CO-04', 'CO-05'] })) cite(mt, ...cos);
const milestone = record.map(([id, name, date, taskId, cos]) => {
  cite(id, ...cos, tkOf.get(taskId)!);
  const s = span(taskId);
  return { id, name, date, planned: taskId === 'site' ? s.start : s.finish, 作業: tkOf.get(taskId) };
});
writeFileSync(`${dir}/docs/master-schedule.json`, JSON.stringify({ note: '工程表。作業は construction/skytree-twin.construction.json の tasks と同じ順と日付（月〜土が稼働、08:00〜17:00）。節目の date は公開の記録、planned は計画の日付。', task, milestone }, null, 1) + '\n');
writeFileSync(`${dir}/docs/construction-model.json`, JSON.stringify({ note: '施工単位。BIM（bim/construction-model.bim.json）の要素を、建てる作業ごとにまとめたもの。質量は材料の密度から。', 'work-unit': wu }, null, 1) + '\n');

// ---- Equipment, routes, temporaries. ----
const s = doc.site!;
const equipment = s.cranes!.map((c, i) => {
  const id = `EQ-${pad(i + 1, 2)}`;
  const tks = [...new Set(s.lifts!.filter((l) => l.craneId === c.id).map((l) => tkOf.get(l.taskId)!))];
  cite(id, c.kind === 'mobile' ? 'MT-02' : 'MT-03', tkOf.get(c.fromTaskId)!, ...(c.untilTaskId ? [tkOf.get(c.untilTaskId)!] : []));
  return {
    id, name: c.name, 'schedule のクレーン': c.id, 種類: c.kind === 'mobile' ? 'クローラークレーン（1,350 t 級・ブーム 190 m。定格荷重表は想定）' : 'タワークレーン（JCC-V720 級・ジブ 55 m。定格荷重表は想定）',
    据える所: `(${(c.base[0] / 1000).toFixed(1)}, ${(c.base[1] / 1000).toFixed(1)}) m`, 立てる作業: tkOf.get(c.fromTaskId), 解体の作業: c.untilTaskId ? tkOf.get(c.untilTaskId) : null,
    昇り: (c.climbs ?? []).map((m) => ({ 作業: tkOf.get(m.taskId), '基部の高さ（m）': +(m.baseZ / 1000).toFixed(1), 'ジブの高さ（m）': +((m.baseZ + m.height) / 1000).toFixed(1), 支え: `${m.supportIds?.[0]?.replace(/-1$/, '')} の環 ${m.supportIds?.length ?? 0} 本` })),
    吊りの回数: s.lifts!.filter((l) => l.craneId === c.id).length, 吊る作業: tks,
  };
});
const route = s.routes!.map((r, i) => {
  const id = `RT-${pad(i + 1, 2)}`;
  const tks = [...new Set(s.lifts!.filter((l) => l.routeId === r.id).map((l) => tkOf.get(l.taskId)!))];
  const cranes = [...new Set(s.lifts!.filter((l) => l.routeId === r.id).map((l) => l.craneId))].map((c) => equipment.find((e) => e['schedule のクレーン'] === c)!.id as string);
  cite(id, tkOf.get(r.taskId)!, ...cranes);
  return { id, name: r.name, 'schedule の経路': r.id, 速さ: `${r.speedKmh} km/h`, 'トラック 1 台の吊り': r.delivers?.perTrip, '吊りの前に着く（分）': r.delivers?.leadMinutes, 運ぶ吊り: s.lifts!.filter((l) => l.routeId === r.id).length, '夜の置き場から（その日の最初の吊り）': s.lifts!.filter((l) => !l.routeId && cranes.includes(equipment.find((e) => e['schedule のクレーン'] === l.craneId)!.id as string) && Math.hypot(l.pick[0] - r.path.at(-1)![0], l.pick[1] - r.path.at(-1)![1]) < 1).length, 作業: tks.length ? `${tks[0]}〜${tks.at(-1)}` : tkOf.get(r.taskId), 揚重機: cranes };
});
const temporary = s.temporaries!.map((t, i) => {
  const id = `TW-${pad(i + 1, 2)}`;
  cite(id, tkOf.get(t.fromTaskId)!, ...(t.untilTaskId ? [tkOf.get(t.untilTaskId)!] : []));
  return { id, name: t.name, 種類: t.kind, '高さ（m）': t.height / 1000, 立てる作業: tkOf.get(t.fromTaskId), 外す作業: t.untilTaskId ? tkOf.get(t.untilTaskId) : null };
});
const times = liftTimes(doc, plan);
const perDay = new Map<string, number>();
for (const t of times.values()) perDay.set(t.day, (perDay.get(t.day) ?? 0) + 1);
writeFileSync(`${dir}/docs/site-logistics-plan.json`, JSON.stringify({
  note: `揚重機・搬入の経路・仮設物。吊りは ${s.lifts!.length} 回（1 回 20 分、1 日に多い日で ${Math.max(...perDay.values())} 回）。吊りの割り当て（どの揚重機が、どこから、どの経路の荷を吊るか）は construction/skytree-twin.construction.json の site.lifts。`,
  equipment, route, temporary,
}, null, 1) + '\n');
writeFileSync(`${dir}/bim/construction-model.bim.json`, JSON.stringify(bim) + '\n');
writeFileSync(`${dir}/construction/skytree-twin.construction.json`, JSON.stringify(doc) + '\n');
writeFileSync(`${dir}/trace/generated-citations.json`, JSON.stringify(cites, null, 1) + '\n');
console.log('WU', wu.length, 'TK', task.length, 'EQ', equipment.length, 'RT', route.length, 'TW', temporary.length, 'cites', cites.length);
void readFileSync;
