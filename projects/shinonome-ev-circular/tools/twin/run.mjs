// 拠点の模型を流す：node tools/twin/run.mjs docs/plant-model.json [--write]
// docs/plant-model.json の model（工場の模型）を、cases の量ごとに流して結果をまとめる。
// cases[n].set は {"objects.<id>.<field>...": 値} の形で模型の一部を置きかえる（例："objects.in-battery.interval.value": 30000）。
import fs from 'node:fs';
import { runFactory, validateFactory } from './factory-core.mjs';

const file = process.argv[2] ?? 'docs/plant-model.json';
const write = process.argv.includes('--write');
const check = process.argv.includes('--check');
const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
const base = doc.model;
if (!base) throw new Error(`${file} に model（工場の模型）がない`);

function apply(model, set = {}) {
  const m = structuredClone(model);
  for (const [path, value] of Object.entries(set)) {
    const [head, id, ...rest] = path.split('.');
    let t = Array.isArray(m[head]) ? m[head].find((x) => x.id === id) : m[head]?.[id];
    if (!t) throw new Error(`見つからない：${path}`);
    const last = rest.pop();
    for (const k of rest) t = t[k] ??= {};
    t[last] = value;
  }
  return m;
}

const out = [];
for (const c of doc.cases ?? [{ id: 'base' }]) {
  const m = apply(base, c.set);
  const problems = validateFactory(m).filter((p) => p.severity !== 'warning');
  if (problems.length) throw new Error(`${c.id}: 模型の検査 ${JSON.stringify(problems).slice(0, 400)}`);
  const r = runFactory(m);
  const hours = (r.endMs - r.startMs) / 3_600_000;
  const runShare = (o) => { const s = o.states, all = Object.values(s).reduce((a, b) => a + b, 0) - (s.paused ?? 0); return all ? +(s.working / all).toFixed(3) : 0; };
  out.push({
    case: c.id, year: c.year, label: c.label,
    hours: +hours.toFixed(1),
    produced: r.producedByProduct,
    perHour: +r.throughputPerHour.toFixed(2),
    leadTimeMinP50: +(r.leadTime.p50Ms / 60000).toFixed(1),
    utilization: Object.fromEntries(r.objects.filter((o) => ['station', 'parallel', 'assembly'].includes(o.kind)).map((o) => [o.id, runShare(o)])),
    workers: Object.fromEntries(r.workers.map((w) => [w.poolId, { count: w.count, busy: +w.busyShare.toFixed(3) }])),
    fleets: Object.fromEntries(r.fleets.map((f) => [f.fleetId, { count: f.count, trips: f.trips }])),
    bottlenecks: r.bottlenecks.slice(0, 3).map((b) => ({ id: b.id, share: +b.share.toFixed(3) })),
  });
}
if (check) {
  // 検算：同じ模型をもう一度流し、残っている runs と処理完了数が合うかを見る
  const saved = new Map((doc.runs ?? []).map((r) => [r.case, r]));
  const bad = out.filter((r) => JSON.stringify(sortKeys(r.produced)) !== JSON.stringify(sortKeys(saved.get(r.case)?.produced ?? {})));
  if (!doc.runs?.length) { console.error('runs がない：--write で結果を残す'); process.exit(1); }
  if (saved.size !== out.length || bad.length) { console.error(`runs と合わない case：${bad.map((r) => r.case).join('、') || '数が違う'}`); process.exit(1); }
  console.log(`模型の検算：${out.length} の case すべてで処理完了数が runs と一致`);
  process.exit(0);
}
function sortKeys(o) { return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))); }
console.log(JSON.stringify(out, null, 1));
if (write) { doc.runs = out; doc.runsAt = new Date().toISOString(); fs.writeFileSync(file, JSON.stringify(doc, null, 1) + '\n'); }
