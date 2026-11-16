/** TT5: the tower's whole construction in the Playground — timing, checks, video. */
import { scheduleConstruction } from '@editor-platform/construction-core';
import { addDays } from '@editor-platform/time-axis';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { create, expect, nativeArtifact, save, test } from '../../e2e/fixtures';
import { twinBim } from './twin-bim';
import { tt5Construction } from './tt5-construction';

const out = process.env.TT5_OUT ?? '/mnt/project-files/skytree-twin/tt5';
async function shot(page: Page, name: string) {
  // Without the caption: the still shows the view and the panels only.
  const cap = page.locator('#demo-caption');
  const had = (await cap.count()) > 0 && (await cap.isVisible());
  if (had) await cap.evaluate((el) => ((el as HTMLElement).style.visibility = 'hidden'));
  await page.screenshot({ path: `${out}/${name}.png` });
  if (had) await cap.evaluate((el) => ((el as HTMLElement).style.visibility = ''));
}

async function caption(page: Page, text: string, ms = 3500) {
  await page.evaluate((t) => {
    let el = document.getElementById('demo-caption');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-caption';
      el.style.cssText =
        'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;' +
        'background:rgba(15,23,42,.88);color:#fff;font:600 22px/1.4 "Noto Sans CJK JP","Noto Sans JP",sans-serif;' +
        'padding:10px 22px;border-radius:10px;max-width:70%;text-align:center;pointer-events:none';
      document.body.appendChild(el);
    }
    el.style.display = t ? '' : 'none';
    el.textContent = t;
  }, text);
  if (ms) await page.waitForTimeout(ms);
}
async function importJson(page: Page, name: string, value: unknown) {
  if (!(await page.getByLabel('Artifact type', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await page.getByLabel('Import artifact', { exact: true }).setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
/** CLIPS: the 3D view over the whole page (on), or back in its place (off). */
async function full(page: Page, on: boolean) {
  await page.evaluate((v) => {
    let el = document.getElementById('demo-full');
    if (v && !el) {
      el = document.createElement('style');
      el.id = 'demo-full';
      el.textContent =
        '.construction-canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;z-index:9998!important;background:#eef1f4}';
      document.head.append(el);
    }
    if (!v && el) el.remove();
  }, on);
  await page.waitForTimeout(1200);
}
async function shut(page: Page, title: string) {
  const summary = page.locator('summary', { hasText: new RegExp(`^${title}$`) }).first();
  const details = summary.locator('..');
  await expect(async () => {
    if (await details.evaluate((d) => (d as HTMLDetailsElement).open)) await summary.click({ timeout: 60_000 });
    await expect(details).not.toHaveAttribute('open', '', { timeout: 5000 });
  }).toPass({ timeout: 600_000 });
}
async function open(page: Page, title: string) {
  const summary = page.locator('summary', { hasText: new RegExp(`^${title}$`) }).first();
  const details = summary.locator('..');
  // The page's thread can be busy (a check running) when the click lands: open it until it stays open.
  await expect(async () => {
    if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await summary.click({ timeout: 60_000 });
    await expect(details).toHaveAttribute('open', '', { timeout: 5000 });
  }).toPass({ timeout: 600_000 });
}
/**
 * Move the 3D view (orbit controls): `pan` drags with the right button from one point of the
 * canvas to another (fractions of its size), so what was under the first point comes under the
 * second; `turn` drags with the left button by pixels; `wheel` zooms toward the view's centre
 * (negative = in).
 */
async function camera(
  page: Page,
  o: { pan?: [[number, number], [number, number]]; turn?: [number, number]; wheel?: number },
) {
  const c = page.locator('.construction-canvas canvas').first();
  const b = (await c.boundingBox())!;
  const at = ([x, y]: [number, number]) => [b.x + b.width * x, b.y + b.height * y] as const;
  if (o.pan) {
    const [from, to] = o.pan.map(at);
    await page.mouse.move(...from);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(...to, { steps: 16 });
    await page.mouse.up({ button: 'right' });
  }
  if (o.turn) {
    const [cx, cy] = at([0.5, 0.5]);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + o.turn[0], cy + o.turn[1], { steps: 16 });
    await page.mouse.up();
  }
  if (o.wheel) {
    await page.mouse.move(...at([0.5, 0.5]));
    for (let k = 0; k < Math.abs(o.wheel); k++) {
      await page.mouse.wheel(0, Math.sign(o.wheel) * 100);
      await page.waitForTimeout(60);
    }
  }
  await page.waitForTimeout(800);
}
const log: string[] = [];
const note = (s: string) => {
  log.push(s);
  process.stderr.write(s + '\n');
};

test('TT5 tower', async ({ page }) => {
  test.setTimeout(12_000_000);
  await mkdir(out, { recursive: true });
  const building = twinBim();
  const doc = tt5Construction(building);
  const plan = scheduleConstruction(doc);
  const day = (id: string) => plan.byId.get(id)!.start;
  // The crane check runs on the page's thread: a long task measures it.
  await page.addInitScript(() => {
    const w = window as unknown as { __long: [number, number][] };
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push([e.startTime, e.duration]))).observe({
      type: 'longtask',
      buffered: true,
    });
  });
  const start = Date.now();
  await page.goto('/');
  if (!process.env.CLIPS) await caption(page, '東京スカイツリーを題材にした近似のデジタルツイン（公開の情報からの近似。実物の図面ではなく、所有者・施工者とは関係ありません）', 4000);

  await create(page, 'bim');
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', { timeout: 90_000 });
  const emptyBim = await nativeArtifact(page);
  let t = Date.now();
  await importJson(page, 'skytree-twin.json', { ...emptyBim, name: 'Skytree twin', draft: { ...emptyBim.draft, content: building } });
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', { timeout: 1_800_000 });
  note(`BIM evaluated: ${building.elements.length} elements, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await save(page, 1);

  await create(page, 'construction');
  await expect(page.getByLabel('Construction schedule', { exact: true })).toBeVisible();
  const empty = await nativeArtifact(page);
  const source = (empty.draft.content as { source: unknown }).source;
  t = Date.now();
  await importJson(page, 'skytree-construction.json', { ...empty, name: 'Skytree twin construction', draft: { ...empty.draft, content: { ...doc, source } } });
  // The crane check runs on the page's thread once the building's bodies are in: with the panel
  // open, its note shows from the start of the check to its end.
  await open(page, 'Cranes');
  const checking = page.getByText('Checking the lifts…');
  await checking.waitFor({ state: 'visible', timeout: 1_800_000 });
  const t1 = Date.now();
  note(`bodies evaluated (import to the crane check's start): ${((t1 - t) / 1000).toFixed(1)} s`);
  await expect(checking).toBeHidden({ timeout: 3_600_000 });
  note(`crane check (Checking the lifts… shown to hidden): ${((Date.now() - t1) / 1000).toFixed(1)} s, ${doc.site!.lifts!.length} lifts`);
  await page.waitForTimeout(3000);
  const long = await page.evaluate(() => (window as unknown as { __long: [number, number][] }).__long);
  const top = [...long].sort((a, b) => b[1] - a[1]).slice(0, 5);
  note(`longest tasks on the page's thread since load (start s, length s): ${top.map(([a, d]) => `${(a / 1000).toFixed(1)}/${(d / 1000).toFixed(1)}`).join(', ')}`);
  await page.getByLabel('Cranes', { exact: true }).first().scrollIntoViewIfNeeded();
  await shot(page, 'tt5-cranes-checked');
  if (!process.env.CLIPS) await caption(page, `工程 ${doc.tasks.length} 作業、吊り ${doc.site!.lifts!.length} 回。届く範囲・荷重表・干渉・昇りの支えを検査（残るのは旋回範囲の重なりの注意だけ）`, 5000);
  if (process.env.EXPLORE) {
    await page.getByLabel('Date', { exact: true }).fill(day('top'));
    await page.waitForTimeout(4000);
    const steps = JSON.parse(process.env.EXPLORE) as Parameters<typeof camera>[1][];
    for (const [k, step] of steps.entries()) {
      await camera(page, step);
      await shot(page, `explore-${k}`);
    }
    return;
  }

  if (process.env.CLIPS) {
    // Clean clips of the 3D view over the whole page, no captions: their times in the page's video.
    const t0 = start;
    const mark = (name: string, a: number) => note(`clip ${name}: ${((a - t0) / 1000).toFixed(1)}–${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const steps = JSON.parse(process.env.CLIPS) as Record<string, Parameters<typeof camera>[1][]>;
    const cam = async (k: string) => { for (const st of steps[k] ?? []) await camera(page, st); };
    await full(page, true);
    await cam('base');
    await shot(page, 'clip-base');
    await full(page, false);
    // A: crawler cranes lifting.
    await page.getByLabel('Date', { exact: true }).fill(addDays(day('steel-07'), 3));
    await page.waitForTimeout(4000);
    await full(page, true);
    await cam('a');
    await shot(page, 'clip-a');
    await full(page, false);
    await page.getByRole('button', { name: 'Play lifts', exact: true }).click();
    await full(page, true);
    let a = Date.now();
    await page.waitForTimeout(16000);
    mark('a crawlers', a);
    await full(page, false);
    { const b = page.getByRole('button', { name: 'Stop lifts', exact: true }); if (await b.isVisible()) await b.click(); }
    // B: tower cranes lifting.
    await full(page, true);
    await cam('a-back');
    await full(page, false);
    await page.getByLabel('Date', { exact: true }).fill(addDays(day('steel-25'), 3));
    await page.waitForTimeout(4000);
    await full(page, true);
    await cam('b');
    await shot(page, 'clip-b');
    await full(page, false);
    await page.getByRole('button', { name: 'Play lifts', exact: true }).click();
    await full(page, true);
    a = Date.now();
    await page.waitForTimeout(16000);
    mark('b tower cranes', a);
    await full(page, false);
    { const b = page.getByRole('button', { name: 'Stop lifts', exact: true }); if (await b.isVisible()) await b.click(); }
    // C: trucks on the clock.
    await open(page, 'People and trucks');
    await page.getByLabel('Time', { exact: true }).fill('530');
    await full(page, true);
    await cam('c');
    await shot(page, 'clip-c');
    await full(page, false);
    await page.getByRole('button', { name: 'Play time', exact: true }).click();
    await full(page, true);
    a = Date.now();
    await page.waitForTimeout(16000);
    mark('c trucks', a);
    await full(page, false);
    { const b = page.getByRole('button', { name: 'Stop time', exact: true }); if (await b.isVisible()) await b.click(); }
    // D: 634 m, turning around it.
    await full(page, true);
    await cam('c-back');
    await full(page, false);
    await page.getByLabel('Date', { exact: true }).fill(day('top'));
    await page.waitForTimeout(4000);
    await full(page, true);
    await cam('d');
    await shot(page, 'clip-d');
    const c = (await page.locator('.construction-canvas canvas').first().boundingBox())!;
    a = Date.now();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height * 0.3);
    await page.mouse.down();
    for (let k = 1; k <= 240; k++) {
      await page.mouse.move(c.x + c.width / 2 - k * 2.5, c.y + c.height * 0.3);
      await page.waitForTimeout(50);
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    mark('d orbit', a);
    await shot(page, 'clip-d-end');
    await writeFile(`${out}/tt5-clips.txt`, log.join('\n') + '\n');
    return;
  }
  // The whole tower in view: the tower's foot to the bottom middle of the canvas.
  await camera(page, { pan: [[0.41, 0.87], [0.5, 0.92]] });
  if (process.env.RECORD_ONLY) {
    // Only the schedule video, with the side panels shut (each day re-renders them).
    await shut(page, 'Cranes');
    await page.getByRole('button', { name: 'Record video', exact: true }).click();
    const form = page.getByRole('group', { name: 'Video' });
    await form.getByLabel('Video from').fill(day('found'));
    await form.getByLabel('Video to').fill(plan.byId.get('finish')!.start);
    await form.getByLabel('Days a second').selectOption('30');
    const mp4 = page.waitForEvent('download', { timeout: 10_000_000 });
    t = Date.now();
    await form.getByRole('button', { name: 'Record', exact: true }).click();
    const timer = setInterval(() => {
      void page
        .getByText(/Recording: \d+ of \d+ frames/)
        .textContent({ timeout: 2000 })
        .then((x) => note(`${((Date.now() - t) / 1000).toFixed(0)} s: ${x}`))
        .catch(() => undefined);
    }, 60_000);
    await (await mp4).saveAs(`${out}/tt5-schedule.mp4`);
    clearInterval(timer);
    note(`schedule video: ${((Date.now() - t) / 1000).toFixed(0)} s`);
    await writeFile(`${out}/tt5-playground-record.txt`, log.join('\n') + '\n');
    return;
  }
  // Crawler cranes on the foot.
  await page.getByLabel('Date', { exact: true }).fill(addDays(day('steel-07'), 3));
  await page.waitForTimeout(4000);
  await camera(page, { wheel: -3 });
  await shot(page, 'tt5-crawlers');
  await caption(page, '0〜170 m：三角形の足元の3面に、1,350 t級のクローラークレーン（想定）', 4500);
  await page.getByRole('button', { name: 'Play lifts', exact: true }).click();
  await caption(page, 'トラックが部材を運び込み、荷台から吊って据え付ける', 9000);
  { const b = page.getByRole('button', { name: 'Stop lifts', exact: true }); if (await b.isVisible()) await b.click(); }

  // Tower cranes climbing.
  await camera(page, { wheel: 3 });
  await page.getByLabel('Date', { exact: true }).fill(addDays(day('steel-25'), 3));
  await page.waitForTimeout(4000);
  await shot(page, 'tt5-tower-cranes');
  await caption(page, '170 m から上：中心の吹き抜けに4台のタワークレーン。鉄骨と一緒に昇る（TT1）', 4500);
  await page.getByRole('button', { name: 'Play lifts', exact: true }).click();
  await caption(page, '部材はトラックで足元の中心へ。吹き抜けを吊り上げ、外周へ旋回', 9000);
  { const b = page.getByRole('button', { name: 'Stop lifts', exact: true }); if (await b.isVisible()) await b.click(); }

  // The gain tower lift-up.
  await page.getByLabel('Date', { exact: true }).fill(addDays(day('raise-3'), 5));
  await page.waitForTimeout(4000);
  await camera(page, { pan: [[0.5, 0.25], [0.5, 0.6]], wheel: -3 });
  await shot(page, 'tt5-gain-tower');
  await caption(page, 'ゲイン塔：吹き抜けの底で上の節から組み、ジャッキで押し上げ、495 m 引き上げる（TT2）', 5000);
  await camera(page, { wheel: 3 });
  await camera(page, { pan: [[0.5, 0.6], [0.5, 0.25]] });
  await page.getByLabel('Date', { exact: true }).fill(day('top'));
  await page.waitForTimeout(4000);
  await shot(page, 'tt5-634m');
  await caption(page, '2011年3月18日、634 m', 4000);

  // Trucks on a day of the tower cranes.
  await open(page, 'People and trucks');
  await page.getByLabel('Date', { exact: true }).fill(addDays(day('steel-25'), 3));
  await camera(page, { wheel: -4 });
  await page.getByLabel('Time', { exact: true }).fill('530');
  await page.getByRole('button', { name: 'Play time', exact: true }).click();
  await caption(page, '時刻の再生：吊りの時刻に合わせてトラックが着き、荷を下ろして帰る（TT3）', 9000);
  { const b = page.getByRole('button', { name: 'Stop time', exact: true }); if (await b.isVisible()) await b.click(); }
  await shot(page, 'tt5-trucks');
  await camera(page, { wheel: 4 });

  // A path-traced still of 634 m.
  await page.getByLabel('Date', { exact: true }).fill(day('top'));
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Render image', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Render image' });
  await dialog.getByLabel('Width (px)').fill('1280');
  await dialog.getByLabel('Height (px)').fill('720');
  await dialog.getByLabel('Samples').fill('16');
  await dialog.getByLabel('Time limit (s, 0 = none)').fill('900');
  t = Date.now();
  await dialog.getByRole('button', { name: 'Render', exact: true }).click();
  await caption(page, '634 m の日を path tracing で', 2000);
  await expect(dialog.getByTestId('view-render-done')).toBeVisible({ timeout: 1_200_000 });
  note(`render: ${((Date.now() - t) / 1000).toFixed(0)} s`);
  const png = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save PNG' }).click();
  await (await png).saveAs(`${out}/tt5-634m-render.png`);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // Checks out.
  const csv = page.waitForEvent('download', { timeout: 600_000 });
  await page.getByRole('button', { name: 'Export checks', exact: true }).click();
  await (await csv).saveAs(`${out}/tt5-checks.csv`);

  // The whole schedule as a video.
  await caption(page, '', 0);
  await page.getByRole('button', { name: 'Record video', exact: true }).click();
  const form = page.getByRole('group', { name: 'Video' });
  await form.getByLabel('Video from').fill(day('found'));
  await form.getByLabel('Video to').fill(plan.byId.get('finish')!.start);
  await form.getByLabel('Days a second').selectOption('30');
  const mp4 = page.waitForEvent('download', { timeout: 5_400_000 });
  t = Date.now();
  await form.getByRole('button', { name: 'Record', exact: true }).click();
  await (await mp4).saveAs(`${out}/tt5-schedule.mp4`);
  note(`schedule video: ${((Date.now() - t) / 1000).toFixed(0)} s`);
  await writeFile(`${out}/tt5-playground.txt`, log.join('\n') + '\n');
});
