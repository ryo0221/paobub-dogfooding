// 事故分析の dogfooding（#523 特性要因図・FMEA・FTA の引用）のプロモーション用デモ（手元だけ・commit しない）。
// 架空の協働ロボットで、停止指令の後も肘関節が動き続け、作業者の手が挟まれかけた事故を、三つの分析をつないで調べる。
// 流し方：この spec を tests/e2e/ に置き、
//   PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium PAOBUB_E2E_PORT=5732 npm run e2e:some -- tests/e2e/zz-accident-demo.spec.ts --trace off --skip-inventory
//   録画は <録画の置き場（DEMO_OUT）>/a・marks.json。動画は video/build.py（VIDEO_WORK=<録画の置き場> FONT_DIR=<noto-sans-jp>）。
import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFishboneGraph, createFtaGraph } from '@editor-platform/analysis-templates/graph';
import { EMPTY, outboxOf, signIn } from './login';
import { git, PROJECTS, worktreeOfBranch } from './r3-kit';

const OUT = process.env.DEMO_OUT ?? '.data/accident-demo';
const SHOT = join(OUT, 'shots');
const SIZE = { width: 1600, height: 900 };
const SIZE2 = { width: 1920, height: 1080 };
const RECORD = process.env.DEMO_RECORD !== '0';
test.use({ actionTimeout: 30000 });
const SLOW = Number(process.env.DEMO_SLOW ?? 2.0);
const json = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;
const GRAPH = 'docs/cause-diagram.graph.json';
const DATA = 'docs/fmea.data.json';
const FTA = 'docs/fta.graph.json';

const marks: [string, number][] = [];
let t0 = 0;
const mark = (id: string) => { marks.push([id, (Date.now() - t0) / 1000]); console.log(`[demo] ${id}`); };
const pause = (p: Page, ms = 1400) => p.waitForTimeout(ms * SLOW);
let shotN = 0;
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOT, `${String(++shotN).padStart(2, '0')}-${name}.png`) });
async function point(p: Page, loc: Locator, ms = 900) {
  await loc.scrollIntoViewIfNeeded();
  await loc.evaluate((e: HTMLElement) => { e.style.outline = '4px solid #f59e0b'; e.style.outlineOffset = '3px'; });
  await pause(p, ms);
  await loc.evaluate((e: HTMLElement) => { e.style.outline = ''; e.style.outlineOffset = ''; }).catch(() => {});
}

// ── 題材（架空）：協働ロボット KR-7 の肘関節
function fishbone() {
  const g = createFishboneGraph();
  g.attributes = { title: '停止指令の後も肘関節が動き続けた' };
  const P = (id: string, x: number, y: number) => ({ x, y, id });
  const nodes: { id: string; type: string; attributes: Record<string, unknown>; x: number; y: number }[] = [
    { ...P('problem', 760, 330), type: 'problem', attributes: { name: '停止指令の後も肘関節が動き続けた', metric: '停止までの時間 0.4 秒（基準 0.2 秒）' } },
    { ...P('machine', 400, 60), type: 'category', attributes: { name: '機械' } },
    { ...P('control', 400, 260), type: 'category', attributes: { name: '電気・制御' } },
    { ...P('measure', 400, 430), type: 'category', attributes: { name: '計測' } },
    { ...P('method', 400, 600), type: 'category', attributes: { name: '方法' } },
    { ...P('brake', 40, 0), type: 'cause', attributes: { itemId: 'CC-01', name: 'ブレーキ摩擦材の摩耗', status: 'candidate', evidence: '分解して摩耗量を測る' } },
    { ...P('backlash', 40, 120), type: 'cause', attributes: { itemId: 'CC-02', name: '減速機のバックラッシ増大', status: 'excluded', evidence: '測定で規格内（0.8 分）' } },
    { ...P('signal', 40, 260), type: 'cause', attributes: { itemId: 'CC-03', name: '停止信号の遅れ（安全 PLC の周期）', status: 'confirmed', evidence: 'ログで 60 ms の遅れを確認' } },
    { ...P('sensor', 40, 430), type: 'cause', attributes: { itemId: 'CC-04', name: 'トルクセンサのゼロ点ずれ', status: 'candidate', evidence: '校正記録を確かめる' } },
    { ...P('interval', 40, 600), type: 'cause', attributes: { itemId: 'CC-05', name: 'ブレーキ点検の周期が稼働時間に合っていない', status: 'candidate' } },
  ];
  const links: [string, string][] = [['brake', 'machine'], ['backlash', 'machine'], ['signal', 'control'], ['sensor', 'measure'], ['interval', 'method'], ['machine', 'problem'], ['control', 'problem'], ['measure', 'problem'], ['method', 'problem']];
  g.nodes = nodes.map(({ id, type, attributes }) => ({ id, type, attributes })) as typeof g.nodes;
  g.edges = links.map(([from, to], i) => ({ id: `link-${i + 1}`, type: 'contributes', from, to, attributes: {} })) as typeof g.edges;
  g.presentation.nodes = Object.fromEntries(nodes.map(({ id, x, y }) => [id, { x, y }]));
  return g;
}
function faultTree() {
  const g = createFtaGraph();
  g.attributes = { title: '停止指令の後も関節が動き続ける', assumptions: '基本事象は独立と仮定。確率は説明用の仮定値（1 年あたり）。' };
  const nodes = [
    { id: 'top', type: 'top', attributes: { itemId: 'TE-01', name: '停止指令の後も関節が動き続ける' }, x: 600, y: 40 },
    { id: 'or', type: 'or', attributes: { name: 'OR' }, x: 600, y: 210 },
    { id: 'be1', type: 'basic', attributes: { itemId: 'BE-01', name: 'ブレーキの保持力が足りない', probability: 0.002, evidence: '説明用の仮定値' }, x: 330, y: 390 },
    { id: 'be2', type: 'basic', attributes: { itemId: 'BE-02', name: '停止信号が遅れて届く', probability: 0.001, evidence: '説明用の仮定値' }, x: 870, y: 390 },
  ];
  g.nodes = nodes.map(({ id, type, attributes }) => ({ id, type, attributes })) as typeof g.nodes;
  g.edges = [['be1', 'or'], ['be2', 'or'], ['or', 'top']].map(([from, to], i) => ({ id: `link-${i + 1}`, type: 'input', from, to, attributes: {} })) as typeof g.edges;
  g.presentation.nodes = Object.fromEntries(nodes.map(({ id, x, y }) => [id, { x, y }]));
  return g;
}
function fmea() {
  const d = JSON.parse(readFileSync('tests/e2e/fixtures/ar-p3/dfmea.data.json', 'utf8'));
  const base = d.rows[0].values;
  const common = { ...base, item: 'KR-7 肘関節 / 保持ブレーキ', functionRef: null, function: '停止指令から 0.2 秒以内に関節を止める', fmId: 'FM-01', failure: '停止指令の後も関節が動き続ける', effect: '作業者が治具との間に挟まれる（重傷のおそれ）', s: 9, ap: 'H', owner: '品質保証部', status: '対応中', evidence: '' };
  d.rows = [
    { id: 'dfmea-001', values: { ...common, fcId: 'FC-01', cause: 'ブレーキの保持力が摩耗で落ちる', prevention: '摩擦材の寿命設計', detectionControl: '月 1 回の制動距離の点検', o: 4, d: 5, action: '摩擦材の交換周期を稼働時間で決める' }, refs: { causeCandidates: [] } },
    { id: 'dfmea-002', values: { ...common, fcId: 'FC-02', cause: '停止信号が遅れて届く', prevention: '安全 PLC の周期設計', detectionControl: '出荷時の停止時間試験', o: 3, d: 4, action: '安全 PLC の周期を 10 ms に' }, refs: { causeCandidates: [] } },
  ];
  return d;
}

test('事故分析のデモ', async ({ browser, baseURL }) => {
  test.setTimeout(900000);
  mkdirSync(PROJECTS, { recursive: true }); mkdirSync(SHOT, { recursive: true });
  const stamp = Date.now().toString(36);
  const ctx = await browser.newContext({ baseURL, storageState: EMPTY, viewport: SIZE, deviceScaleFactor: 1.2, locale: 'ja-JP', ...(RECORD ? { recordVideo: { dir: join(OUT, 'a'), size: SIZE2 } } : {}) });
  await signIn(ctx.request, outboxOf(baseURL!), `mori-${stamp}@example.com`);
  await ctx.request.put('/api/profile', { data: { displayName: '森 みなみ' } });
  const home = await (await ctx.request.get('/api/home')).json();
  const org = home.organizationId as string;
  await ctx.request.put(`/api/organizations/${org}`, { data: { name: 'みなとロボティクス 品質保証部' } });
  const H = { headers: { 'x-paobub-org': org } };
  const r = await ctx.request.post('/api/repo-projects', { ...H, data: { workspaceId: home.workspaces[0].id, definitionId: 'failure-analysis', name: 'KR-7 肘関節の停止遅れ（ヒヤリハット）', repo: { mode: 'new', baseDir: PROJECTS } } });
  expect(r.status(), await r.text()).toBe(201);
  const id = (await r.json()).id as string;
  const repo = ((await (await ctx.request.get(`/api/repo-projects/${id}`, H)).json()) as { path: string }).path;
  const wfPath = join(repo, 'workflow.json');
  const wf = JSON.parse(readFileSync(wfPath, 'utf8'));
  wf.deliverables['cause-diagram'] = [{ path: GRAPH, as: 'items', analysis: 'graph', kinds: [{ kind: 'cause-candidate', idForm: 'CC-{nn}' }] }];
  wf.deliverables.fmea = [{ path: DATA, as: 'items', analysis: 'data', kinds: [{ kind: 'failure-mode', idForm: 'FM-{nn}' }, { kind: 'failure-cause', idForm: 'FC-{nn}' }] }];
  wf.deliverables['fault-tree'] = [{ path: FTA, as: 'items', analysis: 'graph', kinds: [{ kind: 'top-event', idForm: 'TE-{nn}' }, { kind: 'basic-event', idForm: 'BE-{nn}' }] }];
  writeFileSync(wfPath, json(wf));
  mkdirSync(join(repo, 'docs'), { recursive: true });
  writeFileSync(join(repo, GRAPH), json(fishbone()));
  writeFileSync(join(repo, DATA), json(fmea()));
  writeFileSync(join(repo, FTA), json(faultTree()));
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', '要因分析・FMEA・FTA の下書き');
  writeFileSync(join(OUT, 'project.txt'), `${id}\n${repo}\n`);

  const p = await ctx.newPage();
  t0 = Date.now();
  try {
  const file = (phase: string, path: string) => p.goto(`/r/${id}/t/${phase}/f?path=${encodeURIComponent(path)}`);
  const save = async () => {
    const b = p.getByRole('button', { name: '保存する' }).first();
    await point(p, b, 600); await b.click();
    await pause(p, 1200);
  };
  const choose = async (field: Locator, cand: string) => {
    const btn = field.getByRole('button', { name: '候補から選ぶ' });
    await point(p, btn, 600); await btn.click();
    const list = field.getByRole('list').last();
    await expect(list).toContainText(cand.split(' ')[0]);
    await pause(p, 600);
    await point(p, list, 1600);
    const c = field.getByRole('button', { name: new RegExp(cand.split(' ')[0]) });
    await point(p, c, 700); await c.click();
    await expect(field.getByRole('listitem').filter({ hasText: cand.split(' ')[0] }).first()).toBeVisible();
    await pause(p, 900);
  };

  // 1 要因分析：特性要因図の原因の候補（CC）と状態
  await file('cause-analysis', GRAPH);
  await expect(p.getByRole('button', { name: 'Select node ブレーキ摩擦材の摩耗' })).toBeVisible({ timeout: 30000 });
  await p.getByRole('button', { name: '全体を表示' }).click();
  await pause(p, 600);
  mark('fishbone');
  await pause(p, 1500);
  await p.getByRole('button', { name: 'Select node ブレーキ摩擦材の摩耗' }).click();
  await pause(p, 2200);
  await shot(p, 'fishbone');
  await p.getByRole('button', { name: 'Select node 減速機のバックラッシ増大' }).click();
  await pause(p, 1800);
  mark('fishbone-end');

  // 2 FMEA：故障原因 FC-01 / FC-02 の根拠に、候補から CC を選ぶ（BE は出ない）
  await file('fmea-analysis', DATA);
  await expect(p.getByText('ブレーキの保持力が摩耗で落ちる').first()).toBeVisible({ timeout: 30000 });
  await pause(p, 500);
  mark('fmea');
  await pause(p, 1400);
  await p.getByText('ブレーキの保持力が摩耗で落ちる').first().click();
  const viewSel = p.locator('select').filter({ hasText: 'カンバン' }).first();
  await point(p, viewSel, 600);
  await viewSel.selectOption({ label: 'フォーム' });
  await pause(p, 1000);
  let field = p.getByRole('region', { name: 'refs.causeCandidates' });
  await field.scrollIntoViewIfNeeded();
  await choose(field, 'CC-01');
  await shot(p, 'fmea-fc01');
  const next = p.getByRole('button', { name: /Next record|次のレコード/ }).first();
  await next.scrollIntoViewIfNeeded(); await point(p, next, 500); await next.click();
  await pause(p, 900);
  field = p.getByRole('region', { name: 'refs.causeCandidates' });
  await field.scrollIntoViewIfNeeded();
  await choose(field, 'CC-03');
  await save();
  await shot(p, 'fmea-saved');
  mark('fmea-end');

  // 3 FTA：基本事象 BE-01 / BE-02 に、対応する故障原因 FC を選ぶ（CC は出ない）
  await file('fta-analysis', FTA);
  await expect(p.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' })).toBeVisible({ timeout: 30000 });
  await pause(p, 500);
  mark('fta');
  await pause(p, 1200);
  await p.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' }).click();
  await pause(p, 900);
  field = p.getByRole('region', { name: '故障原因の業務 ID' });
  await field.scrollIntoViewIfNeeded();
  await choose(field, 'FC-01');
  await shot(p, 'fta-be01');
  await p.getByRole('button', { name: 'Select node 停止信号が遅れて届く' }).click();
  await pause(p, 900);
  field = p.getByRole('region', { name: '故障原因の業務 ID' });
  await field.scrollIntoViewIfNeeded();
  await choose(field, 'FC-02');
  await save();
  await shot(p, 'fta-saved');
  mark('fta-end');

  // 4 引用先が変わる：分解調査で CC-01 が確認済みに（FMEA の作業中の版へ、録画の外で）
  const wt = worktreeOfBranch(repo, 'work/fmea-analysis');
  const g2 = fishbone();
  for (const n of g2.nodes) if (n.attributes.itemId === 'CC-01') n.attributes = { ...n.attributes, status: 'confirmed', evidence: '分解調査で摩擦材の摩耗 0.3 mm（限度 0.2 mm）を確認' };
  writeFileSync(join(wt, GRAPH), json(g2)); git(wt, 'commit', '-qam', '要因分析：CC-01 を分解調査で確認済みに');
  await p.goto(`/r/${id}/t/fmea-analysis`);
  const stale = p.getByRole('region', { name: '古い引用' });
  await expect(stale).toBeVisible({ timeout: 30000 }).catch(async () => { await shot(p, 'no-stale'); writeFileSync(join(OUT, 'no-stale.txt'), await p.locator('body').innerText()); throw new Error('古い引用が見えない'); });
  await stale.scrollIntoViewIfNeeded();
  await pause(p, 500);
  mark('stale');
  await point(p, stale.getByRole('listitem').first(), 1800);
  const cmp = stale.getByText('比べる').first();
  await point(p, cmp, 500); await cmp.click();
  const diff = stale.getByRole('group', { name: /の比べ/ }).first();
  await diff.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await pause(p, 700);
  await point(p, diff, 2600);
  await shot(p, 'stale-compare');
  const follow = stale.getByRole('button', { name: '合わせる' }).first();
  await point(p, follow, 700); await follow.click();
  await expect(stale).toBeHidden({ timeout: 30000 });
  await pause(p, 1500);
  await shot(p, 'stale-followed');
  mark('stale-end');

  // 5 規則に無い引用：FC-02 の欄に BE-01 が直に書かれると（録画の外）、受け入れの窓で止まる
  const d = JSON.parse(git(wt, 'show', `HEAD:${DATA}`));
  d.rows[1].refs.causeCandidates = [...d.rows[1].refs.causeCandidates, 'BE-01'];
  writeFileSync(join(wt, DATA), json(d)); git(wt, 'commit', '-qam', 'FMEA：FC-02 の根拠に BE-01（手で書いた）');
  await p.goto(`/r/${id}/t/fmea-analysis?open=accept`);
  const dlg = p.getByRole('dialog').first();
  await expect(dlg).toBeVisible({ timeout: 30000 });
  await pause(p, 1200);
  const rule = dlg.getByText(/規則に無い引用/).first();
  await expect(rule).toBeVisible({ timeout: 30000 }).catch(async () => { await shot(p, 'no-rule'); writeFileSync(join(OUT, 'no-rule.txt'), await dlg.innerText()); throw new Error('規則に無い引用が見えない'); });
  mark('rule');
  await pause(p, 600);
  const line = dlg.getByText(/dfmea-002 の refs\.causeCandidates/).first();
  await point(p, line, 2000);
  await rule.scrollIntoViewIfNeeded();
  await point(p, rule.locator('xpath=..'), 2800);
  await shot(p, 'rule-blocked');
  await pause(p, 1200);
  mark('rule-end');

  // 6 Editor で外す → 受け入れの窓から止めが消える
  await file('fmea-analysis', DATA);
  await expect(p.getByText('停止信号が遅れて届く').first()).toBeVisible({ timeout: 30000 });
  mark('fix');
  await p.getByText('停止信号が遅れて届く').first().click();
  const viewSel2 = p.locator('select').filter({ hasText: 'カンバン' }).first();
  await viewSel2.selectOption({ label: 'フォーム' });
  await pause(p, 900);
  field = p.getByRole('region', { name: 'refs.causeCandidates' });
  await field.scrollIntoViewIfNeeded();
  await pause(p, 900);
  const be = field.getByRole('listitem').filter({ hasText: 'BE-01' });
  await point(p, be, 1600);
  const off = field.getByRole('button', { name: 'BE-01 を外す' });
  await point(p, off, 600); await off.click();
  await pause(p, 900);
  await save();
  mark('fix-saved');
  await p.goto(`/r/${id}/t/fmea-analysis?open=accept`);
  const dlg2 = p.getByRole('dialog').first();
  await expect(dlg2.getByText('ゲートの結果')).toBeVisible({ timeout: 300000 });
  await expect(dlg2.getByText(/規則に無い引用/)).toHaveCount(0);
  mark('fix2');
  await pause(p, 800);
  const gates = dlg2.getByText('ゲートの結果').locator('xpath=..');
  await gates.scrollIntoViewIfNeeded();
  await point(p, gates, 3200);
  await shot(p, 'rule-cleared');
  writeFileSync(join(OUT, 'accept-after.txt'), await dlg2.innerText());
  mark('fix-end');
  mark('end');
  writeFileSync(join(OUT, 'marks.json'), json({ a: marks }));
  } catch (e) { await shot(p, 'FAIL'); writeFileSync(join(OUT, 'fail.txt'), await p.locator('body').innerText()); throw e; }
  await ctx.close();
});
