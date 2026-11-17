/**
 * FT7 through-run in the ordinary Playground: the fictional plant's hall (BIM), the line as it
 * was planned, its bottleneck, an experiment over AGVs and assemblers, the adopted change, the
 * 3D replay with a still and a video, and the one-off speed measurement (FT-U7).
 * OUT: folder for pictures, CSV and JSON (outside the repository). STEP: run only some steps.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';
import { create, expect, nativeArtifact, save, test } from '../../e2e/fixtures';
import { plantBuilding, plantFactory } from './plant';

const out = process.env.OUT ?? '/mnt/project-files/factory-twin/ft7';
mkdirSync(out, { recursive: true });
const log: string[] = [];
const note = (line: string) => {
  log.push(`${new Date().toISOString()} ${line}`);
  console.log(line);
  writeFileSync(`${out}/ft7-log.txt`, log.join('\n') + '\n');
};
const status = (page: Page) => page.getByTestId('fac-status');
const tool = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
async function importJson(page: Page, name: string, value: unknown) {
  const input = page.getByLabel('Import artifact', { exact: true });
  if (!(await input.isVisible()))
    await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await input.setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
}
async function commit(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press('Enter');
}
async function keep(download: Promise<Download>, name: string) {
  const d = await download;
  await d.saveAs(`${out}/${name}`);
  note(`saved ${name} (${d.suggestedFilename()})`);
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${out}/${name}.png` });
const day = (d: number, hour: number) => (d * 24 + hour) * 3600;

test('FT7 plant through-run', async ({ page }) => {
  await page.goto('/');
  // 1. The hall, saved as v1.
  await create(page, 'bim');
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', {
    timeout: 120_000,
  });
  const empty = await nativeArtifact(page);
  await importJson(page, 'hall.json', {
    ...empty,
    name: 'Plant hall',
    draft: { ...empty.draft, content: plantBuilding() },
  });
  await expect(page.getByLabel('Artifact name')).toHaveValue('Plant hall');
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', {
    timeout: 300_000,
  });
  await shot(page, '01-hall-bim');
  await save(page, 1);
  note('hall saved v1');

  // 2. The line as planned: 2 AGVs, 3 assemblers; with its experiment.
  await create(page, 'factory');
  const blank = await nativeArtifact(page);
  const planned = plantFactory();
  planned.experiment = {
    replications: 5,
    factors: [
      { kind: 'fleet-count', targetId: 'agv', values: [2, 4, 6, 8] },
      { kind: 'pool-count', targetId: 'assemblers', values: [3, 4] },
    ],
  };
  writeFileSync(`${out}/plant-planned.json`, JSON.stringify(planned, null, 1));
  writeFileSync(`${out}/plant-hall.json`, JSON.stringify(plantBuilding(), null, 1));
  await importJson(page, 'plant.json', {
    ...blank,
    name: 'Minato e-Drive Plant No. 2',
    draft: { ...blank.draft, content: planned },
  });
  await expect(page.getByLabel('Artifact name')).toHaveValue('Minato e-Drive Plant No. 2');
  await page.getByLabel('Building version', { exact: true }).selectOption({ label: 'Plant hall · v1' });
  await expect(page.getByTestId('fac-building')).toBeVisible();
  await expect(page.getByTestId('fac-clashes')).toHaveCount(0);
  await shot(page, '02-plan-planned');
  let t0 = Date.now();
  await tool(page, 'Run').click();
  await expect(status(page)).toContainText('Result:', { timeout: 300_000 });
  note(`planned run (8 days) in the Worker: ${Date.now() - t0} ms; ${await status(page).textContent()}`);
  await shot(page, '03-result-planned');
  await page.getByTestId('fac-bottlenecks').screenshot({ path: `${out}/03b-bottlenecks-planned.png` });
  await save(page, 1);

  // 3. The experiment: 4 x 2 combinations x 5 seeds.
  const panel = page.getByTestId('fac-experiment');
  await panel.scrollIntoViewIfNeeded();
  t0 = Date.now();
  await panel.getByRole('button', { name: 'Run experiment' }).click();
  await expect(page.getByTestId('fac-experiment-progress')).toContainText('40 / 40 runs · done', {
    timeout: 1_800_000,
  });
  note(`experiment 40 runs in the Worker: ${Date.now() - t0} ms`);
  await panel.screenshot({ path: `${out}/04-experiment.png` });
  await shot(page, '04b-experiment-surface');
  const rows = await page.getByTestId('fac-experiment-table').locator('tbody tr').allTextContents();
  note(`experiment rows:\n${rows.join('\n')}`);
  let dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Table CSV' }).click();
  await keep(dl, 'experiment-table.csv');
  dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Runs CSV' }).click();
  await keep(dl, 'experiment-runs.csv');

  // 4. Adopted: 6 AGVs and 4 assemblers, as two edits of the model.
  await commit(page, 'Vehicles in agv', '6');
  await commit(page, 'Workers in assemblers', '4');
  t0 = Date.now();
  await tool(page, 'Run').click();
  await expect(status(page)).toContainText('Result:', { timeout: 300_000 });
  await expect(status(page)).not.toContainText('earlier model');
  note(`adopted run (8 days): ${Date.now() - t0} ms; ${await status(page).textContent()}`);
  await shot(page, '05-result-adopted');
  await page.getByTestId('fac-bottlenecks').screenshot({ path: `${out}/05b-bottlenecks-adopted.png` });
  writeFileSync(`${out}/plant-adopted.json`, JSON.stringify((await nativeArtifact(page)).draft.content, null, 1));
  await save(page, 2);

  // 5. 3D: day 3 at 10:00, a still and a 30-minute video at x60 (1080p).
  await page.getByRole('tab', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('fac-3d').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('fac-3d-status')).toBeHidden({ timeout: 300_000 });
  await page.getByLabel('Replay time (s)', { exact: true }).fill(String(day(2, 10)));
  await expect(page.getByTestId('fac-replay-time')).toHaveText('58:00:00');
  await shot(page, '06-3d-day3');
  dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save still', exact: true }).click();
  await keep(dl, '06b-still-day3.png');
  await page.getByRole('button', { name: 'Record video', exact: true }).click();
  const form = page.getByRole('group', { name: 'Video' });
  await form.getByLabel('Video to (s)').fill(String(day(2, 10.5)));
  await form.getByLabel('Video speed').selectOption('60');
  await form.getByLabel('Video size').selectOption('1920x1080');
  t0 = Date.now();
  dl = page.waitForEvent('download', { timeout: 3_000_000 });
  await form.getByRole('button', { name: 'Record', exact: true }).click();
  await keep(dl, 'ft7-replay-day3-1000-1030.mp4');
  note(`video 30 min at x60 (901 frames, 1080p): ${Date.now() - t0} ms`);

  // 6. FT-U7: one 90-day run of the adopted line in the Worker (the year is over the event limit).
  await page.getByRole('tab', { name: 'Plan', exact: true }).click();
  await commit(page, 'Duration (h)', String(90 * 24));
  t0 = Date.now();
  await tool(page, 'Run').click();
  await expect(status(page)).toContainText('Result:', { timeout: 1_800_000 });
  await expect(status(page)).not.toContainText('earlier model');
  note(`adopted run (90 days) in the Worker: ${Date.now() - t0} ms; ${await status(page).textContent()}`);
});
