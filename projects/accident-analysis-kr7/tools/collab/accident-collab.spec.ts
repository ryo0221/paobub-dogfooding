// 事故分析を 2 人がリアルタイムに話しながら進めるデモ（#523 AR-P5・共同編集で引用を選ぶ）。手元だけ・commit しない。
// 森（みなとロボティクス 品質保証部・Project の持ち主）と、ブレーキの部品を納める工藤（ひばり制動 設計部・参加の組織、編集を許された）が、
// 同じ FMEA と故障の木を共同編集で開き、「候補から選ぶ」で引用をつなぐ。片方が選ぶと、もう片方の画面にすぐ出る。
// 流し方：この spec を tests/e2e/ に置き、
//   PAOBUB_SHARED_DRAFTS=1 PAOBUB_SHARED_DRAFT_CROSS_ORG=1 PAOBUB_E2E_PORT=5732 npx playwright test tests/e2e/zz-accident-collab.spec.ts --trace off --workers=1
//   録画は <録画の置き場（DEMO_OUT）>/{a,b}・marks.json。動画は video/build.py。
import { expect, test, type APIResponse, type Browser, type Locator, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFishboneGraph, createFtaGraph } from '@editor-platform/analysis-templates/graph';
import { EMPTY, outboxOf, signIn } from './login';
import { git, PROJECTS } from './r3-kit';

const OUT = process.env.DEMO_OUT ?? '.data/accident-collab';
const SHOT = join(OUT, 'shots');
const SIZE = { width: 1600, height: 900 };
const SIZE2 = { width: 1920, height: 1080 };
test.use({ actionTimeout: 30000 });
const SLOW = Number(process.env.DEMO_SLOW ?? 1.6);
const json = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;
const GRAPH = 'docs/cause-diagram.graph.json';
const DATA = 'docs/fmea.data.json';
const FTA = 'docs/fta.graph.json';
const run = Date.now().toString(36);

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
async function ok(r: Promise<APIResponse>, status = 201) { const res = await r; expect(res.status(), (await res.text()).slice(0, 400)).toBe(status); return res.status() === 204 ? {} : res.json(); }

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


async function enter(browser: Browser, baseURL: string, who: string, name: string, orgName: string) {
  const ctx = await browser.newContext({ baseURL, storageState: EMPTY, viewport: SIZE, deviceScaleFactor: 1.2, locale: 'ja-JP' });
  const me = await signIn(ctx.request, outboxOf(baseURL), `${who}-${run}@example.com`);
  await ctx.request.put('/api/profile', { data: { displayName: name } });
  const org = await ok(ctx.request.post('/api/organizations', { data: { name: orgName } }));
  return { ctx, req: ctx.request, id: me.id as string, org: org.id as string };
}

test('事故分析を 2 人で', async ({ browser, baseURL }) => {
  test.setTimeout(900000);
  mkdirSync(PROJECTS, { recursive: true }); mkdirSync(SHOT, { recursive: true });
  const a = await enter(browser, baseURL!, 'mori', '森 みなみ', 'みなとロボティクス 品質保証部');
  const b = await enter(browser, baseURL!, 'kudo', '工藤 はると', 'ひばり制動 設計部');
  const as = (x: typeof a) => ({ headers: { 'x-paobub-org': x.org } });
  const ws = (await ok(a.req.get(`/api/home?org=${a.org}`), 200)).workspaces[0].id;
  const id = (await ok(a.req.post('/api/repo-projects', { ...as(a), data: { name: 'KR-7 肘関節の停止遅れ（ヒヤリハット）', workspaceId: ws, definitionId: 'failure-analysis', repo: { mode: 'new', baseDir: PROJECTS } } }))).id as string;
  const inv = await ok(a.req.post(`/api/repo-projects/${id}/participation-invitations`, { ...as(a), data: { email: `kudo-${run}@example.com` } }));
  await ok(b.req.post(`/api/participations/${inv.id}/accept`, { data: { organizationId: b.org } }), 200);
  await ok(a.req.post(`/api/repo-projects/${id}/grants`, { ...as(a), data: { organization: b.org, preset: 'edit' } }));
  await ok(b.req.post(`/api/repo-projects/${id}/grants`, { ...as(b), data: { person: b.id, preset: 'edit' } }));
  const repo = ((await ok(a.req.get(`/api/repo-projects/${id}`, as(a)), 200)) as { path: string }).path;
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
  await a.ctx.close(); await b.ctx.close();

  // 録画は 2 人の画面を同じ時計で撮る（marks は t0 から、録画の始まりは off に残す）
  // storageState は閉じた後には取れないので、ログインし直す
  const login = async (who: string, org: string, dir: string) => {
    const ctx = await browser.newContext({ baseURL, storageState: EMPTY, viewport: SIZE, deviceScaleFactor: 1.2, locale: 'ja-JP', recordVideo: { dir: join(OUT, dir), size: SIZE2 } });
    await signIn(ctx.request, outboxOf(baseURL!), `${who}-${run}@example.com`);
    const p = await ctx.newPage();
    const off = (Date.now() - t0) / 1000;
    await p.goto(`/?org=${org}`);
    return { ctx, p, off };
  };
  t0 = Date.now();
  const A = await login('mori', a.org, 'a');
  const B = await login('kudo', b.org, 'b');
  const pa = A.p, pb = B.p;
  try {
  const file = (p: Page, phase: string, path: string) => p.goto(`/r/${id}/t/${phase}/f?path=${encodeURIComponent(path)}`);
  const toForm = async (p: Page) => {
    const sel = p.locator('select').filter({ hasText: /カンバン|Kanban/ }).first();
    const label = await sel.evaluate((s: HTMLSelectElement) => [...s.options].find((o) => /フォーム|Form/.test(o.text))?.text ?? 'Form');
    await sel.selectOption({ label });
  };
  const choose = async (p: Page, field: Locator, cand: string) => {
    const btn = field.getByRole('button', { name: '候補から選ぶ' });
    await point(p, btn, 500); await btn.click();
    const list = field.getByRole('list').last();
    await expect(list).toContainText(cand);
    await pause(p, 500);
    await point(p, list, 1300);
    const c = field.getByRole('button', { name: new RegExp(cand) });
    await point(p, c, 600); await c.click();
    await expect(field.getByRole('listitem').filter({ hasText: cand }).first()).toBeVisible();
    await pause(p, 700);
  };
  const save = async (p: Page) => {
    const s = p.getByRole('button', { name: '保存する', exact: true }).first();
    await point(p, s, 600); await s.click();
    await expect(s).toBeDisabled({ timeout: 30000 }).catch(() => undefined);
    await pause(p, 1000);
  };
  const presence = (p: Page) => p.getByText(/在室/).first();

  // 1 森が FMEA の共同編集を始め、工藤が入る
  await file(pa, 'fmea-analysis', DATA);
  await expect(pa.getByText('ブレーキの保持力が摩耗で落ちる').first()).toBeVisible({ timeout: 60000 });
  await file(pb, 'fmea-analysis', DATA);
  await expect(pb.getByText('ブレーキの保持力が摩耗で落ちる').first()).toBeVisible({ timeout: 60000 });
  await pause(pa, 800);
  mark('start');
  const start = pa.getByRole('button', { name: '共同編集を開始', exact: true });
  await point(pa, start, 900); await start.click();
  await expect(pa.getByText(/共有の下書き/).first()).toBeVisible({ timeout: 30000 });
  await expect(pb.getByText(/共有の下書き/).first()).toBeVisible({ timeout: 30000 });
  await expect(presence(pa)).toContainText('工藤', { timeout: 30000 });
  await pause(pa, 600);
  mark('joined');
  await point(pa, presence(pa), 1800);
  await point(pb, presence(pb), 1800);
  await shot(pa, 'presence-a'); await shot(pb, 'presence-b');
  mark('joined-end');

  // 2 二人とも FC-01 の行をフォームで開く。森が CC-01 を選ぶと、工藤の画面にすぐ出る
  for (const p of [pa, pb]) { await p.getByText('ブレーキの保持力が摩耗で落ちる').first().click(); await toForm(p); }
  await pause(pa, 900);
  let fa = pa.getByRole('region', { name: 'refs.causeCandidates' }), fb = pb.getByRole('region', { name: 'refs.causeCandidates' });
  await fa.scrollIntoViewIfNeeded(); await fb.scrollIntoViewIfNeeded();
  mark('a-pick');
  await choose(pa, fa, 'CC-01');
  await expect(fb.getByRole('listitem').filter({ hasText: 'CC-01' }).first()).toBeVisible({ timeout: 20000 });
  mark('b-sees');
  await point(pb, fb.getByRole('listitem').filter({ hasText: 'CC-01' }).first(), 1800);
  await shot(pb, 'b-sees-cc01');
  mark('b-sees-end');

  // 3 工藤が、同じ故障原因に点検周期の CC-05 を足す。森の画面にも出る
  mark('b-pick');
  await choose(pb, fb, 'CC-05');
  await expect(fa.getByRole('listitem').filter({ hasText: 'CC-05' }).first()).toBeVisible({ timeout: 20000 });
  mark('a-sees');
  await point(pa, fa.getByRole('listitem').filter({ hasText: 'CC-05' }).first(), 1800);
  await shot(pa, 'a-sees-cc05');
  mark('a-sees-end');

  // 4 森が次の行 FC-02 に CC-03 を選び、工藤が保存する
  const next = pa.getByRole('button', { name: /Next record|次のレコード/ }).first();
  await next.scrollIntoViewIfNeeded(); await point(pa, next, 500); await next.click();
  await pause(pa, 800);
  fa = pa.getByRole('region', { name: 'refs.causeCandidates' }); await fa.scrollIntoViewIfNeeded();
  mark('a-pick2');
  await choose(pa, fa, 'CC-03');
  mark('b-save');
  await save(pb);
  await shot(pb, 'b-saved');
  mark('b-save-end');
  const basis = await (await A.ctx.request.get(`/api/repo-projects/${id}/threads/fmea-analysis/citation-basis`, as(a))).json().catch(() => ({}));
  writeFileSync(join(OUT, 'fmea-basis.json'), json(basis));

  // 5 故障の木も一緒に：森が始め、工藤が BE-01 に FC-01、森が BE-02 に FC-02 を選び、森が保存する
  await file(pa, 'fta-analysis', FTA);
  await expect(pa.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' })).toBeVisible({ timeout: 60000 });
  await file(pb, 'fta-analysis', FTA);
  await expect(pb.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' })).toBeVisible({ timeout: 60000 });
  const start2 = pa.getByRole('button', { name: '共同編集を開始', exact: true });
  await start2.click();
  await expect(presence(pa)).toContainText('工藤', { timeout: 30000 });
  await expect(pb.getByText(/共有の下書き/).first()).toBeVisible({ timeout: 30000 });
  await pause(pa, 600);
  mark('fta');
  await pb.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' }).click();
  await pa.getByRole('button', { name: 'Select node ブレーキの保持力が足りない' }).click();
  await pause(pb, 700);
  let gb = pb.getByRole('region', { name: '故障原因の業務 ID' }), ga = pa.getByRole('region', { name: '故障原因の業務 ID' });
  await gb.scrollIntoViewIfNeeded(); await ga.scrollIntoViewIfNeeded();
  mark('fta-b-pick');
  await choose(pb, gb, 'FC-01');
  await expect(ga.getByRole('listitem').filter({ hasText: 'FC-01' }).first()).toBeVisible({ timeout: 20000 });
  mark('fta-a-sees');
  await point(pa, ga.getByRole('listitem').filter({ hasText: 'FC-01' }).first(), 1600);
  mark('fta-a-pick');
  await pa.getByRole('button', { name: 'Select node 停止信号が遅れて届く' }).click();
  await pb.getByRole('button', { name: 'Select node 停止信号が遅れて届く' }).click();
  await pause(pa, 700);
  ga = pa.getByRole('region', { name: '故障原因の業務 ID' }); gb = pb.getByRole('region', { name: '故障原因の業務 ID' });
  await ga.scrollIntoViewIfNeeded(); await gb.scrollIntoViewIfNeeded();
  await choose(pa, ga, 'FC-02');
  await expect(gb.getByRole('listitem').filter({ hasText: 'FC-02' }).first()).toBeVisible({ timeout: 20000 });
  await point(pb, gb.getByRole('listitem').filter({ hasText: 'FC-02' }).first(), 1200);
  mark('fta-save');
  await save(pa);
  await shot(pa, 'fta-saved');
  mark('fta-end');
  const basis2 = await (await A.ctx.request.get(`/api/repo-projects/${id}/threads/fta-analysis/citation-basis`, as(a))).json().catch(() => ({}));
  writeFileSync(join(OUT, 'fta-basis.json'), json(basis2));
  mark('end');
  writeFileSync(join(OUT, 'marks.json'), json({ marks, off: { a: A.off, b: B.off } }));
  } catch (e) {
    await shot(pa, 'FAIL-a'); await shot(pb, 'FAIL-b');
    writeFileSync(join(OUT, 'fail-a.txt'), await pa.locator('body').innerText()); writeFileSync(join(OUT, 'fail-b.txt'), await pb.locator('body').innerText());
    writeFileSync(join(OUT, 'marks.json'), json({ marks, off: { a: A.off, b: B.off } }));
    throw e;
  }
  await A.ctx.close(); await B.ctx.close();
});
