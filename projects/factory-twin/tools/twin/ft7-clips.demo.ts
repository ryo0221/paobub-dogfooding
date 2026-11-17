/**
 * FT7 clips for the promo: the planned line (2 AGVs) and the adopted one (6 AGVs), each run and
 * replayed in 3D closer in (mouse wheel over the view), a still and a video at x60.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { create, expect, nativeArtifact, save, test } from '../../e2e/fixtures';
import { plantBuilding, plantFactory } from './plant';

const out = (process.env.OUT ?? '/mnt/project-files/factory-twin/ft7') + '/clips';
mkdirSync(out, { recursive: true });
const zoom = Number(process.env.ZOOM ?? 5);
const status = (page: Page) => page.getByTestId('fac-status');
async function importJson(page: Page, name: string, value: unknown) {
  const input = page.getByLabel('Import artifact', { exact: true });
  if (!(await input.isVisible()))
    await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
const day = (d: number, hour: number) => (d * 24 + hour) * 3600;
const step = (t: string) => console.log(new Date().toISOString(), t);

test('FT7 clips', async ({ page }) => {
  await page.goto('/');
  step('open');
  await create(page, 'bim');
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', { timeout: 120_000 });
  const empty = await nativeArtifact(page);
  await importJson(page, 'hall.json', { ...empty, name: 'Plant hall', draft: { ...empty.draft, content: plantBuilding() } });
  await expect(page.getByTestId('bim-model-state')).toHaveText('Model up to date', { timeout: 300_000 });
  await save(page, 1);
  step('hall saved');
  for (const [name, doc] of [
    ['planned', plantFactory()],
    ['adopted', plantFactory({ agvs: 6, assemblers: 4 })],
  ] as const) {
    if (process.env.ONLY && process.env.ONLY !== name) continue;
    await create(page, 'factory');
    const blank = await nativeArtifact(page);
    await importJson(page, `${name}.json`, { ...blank, name: `Plant ${name}`, draft: { ...blank.draft, content: doc } });
    await expect(page.getByLabel('Artifact name')).toHaveValue(`Plant ${name}`);
    await page.getByLabel('Building version', { exact: true }).selectOption({ label: 'Plant hall · v1' });
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(status(page)).toContainText('Result:', { timeout: 300_000 });
    step(`${name} run`);
    await page.getByRole('tab', { name: '3D', exact: true }).click();
    const view = page.getByTestId('fac-3d').locator('canvas');
    await expect(view).toBeVisible();
    await expect(page.getByTestId('fac-3d-status')).toBeHidden({ timeout: 300_000 });
    await page.getByLabel('Replay time (s)', { exact: true }).fill(String(day(2, 10)));
    const box = (await view.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5);
    for (let i = 0; i < zoom; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(500);
    step(`${name} 3d`);
    await page.screenshot({ path: `${out}/${name}-ui.png` });
    let dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save still', exact: true }).click();
    await (await dl).saveAs(`${out}/${name}-still.png`);
    if (process.env.NO_VIDEO) continue;
    await page.getByRole('button', { name: 'Record video', exact: true }).click();
    const form = page.getByRole('group', { name: 'Video' });
    await form.getByLabel('Video to (s)').fill(String(day(2, 10.5)));
    await form.getByLabel('Video speed').selectOption('60');
    await form.getByLabel('Video size').selectOption('1920x1080');
    dl = page.waitForEvent('download', { timeout: 3_000_000 });
    await form.getByRole('button', { name: 'Record', exact: true }).click();
    await (await dl).saveAs(`${out}/${name}-day3-1000-1030.mp4`);
    writeFileSync(`${out}/${name}.done`, new Date().toISOString());
  }
});
