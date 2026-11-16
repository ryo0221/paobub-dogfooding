import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { CadDocument, CadKernelProfile } from '@editor-platform/cad-core';
export const state = (page: Page) => page.getByTestId('cad-geometry-state');
export async function ready(page: Page, timeout = 180_000) {
  await expect(state(page)).toHaveText(/Shape up to date|could not/, { timeout });
  await expect(state(page)).toHaveText('Shape up to date', { timeout: 1000 });
}
export async function tool(page: Page, name: string) {
  const button = page.getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await page.getByRole('button', { name: 'More editor tools', exact: true }).click();
  return button;
}
export async function create(page: Page, kind = 'cad') {
  if (!(await page.getByLabel('Artifact type', { exact: true }).isVisible()))
    await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await page.getByLabel('Artifact type', { exact: true }).selectOption(kind);
  await page.getByRole('button', { name: 'New artifact' }).click();
  await expect(page.getByLabel('Artifact name')).toBeVisible();
}
export async function nativeArtifact(page: Page) {
  await page.getByRole('button', { name: 'Export artifact', exact: true }).click();
  await expect(page.locator('.save-status')).not.toContainText(/\b[1-9]\d* pending\b/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const file = await pending;
  const record = JSON.parse(await readFile((await file.path())!, 'utf8'));
  await page.keyboard.press('Escape');
  return record;
}
export async function importJson(page: Page, name: string, value: unknown) {
  const input = page.getByLabel('Import artifact', { exact: true });
  if (!(await input.isVisible()))
    await page.getByRole('button', { name: 'Toggle library', exact: true }).click();
  await input.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
/** Import `build(kernel)` as a new CAD artifact named `name`; returns ms until the shape is up to date. */
export async function openModel(
  page: Page,
  name: string,
  build: (k: Pick<CadKernelProfile, 'id' | 'buildHash'>) => CadDocument,
  extra: Record<string, unknown> = {},
) {
  await create(page, 'cad');
  await ready(page);
  const empty = await nativeArtifact(page);
  const { id, buildHash } = (empty.draft.content as CadDocument).kernelProfile;
  const t0 = Date.now();
  await importJson(page, `${name}.json`, { ...empty, name, draft: { ...empty.draft, content: build({ id, buildHash }) }, ...extra });
  await expect(page.getByLabel('Artifact name')).toHaveValue(name);
  await ready(page);
  return Date.now() - t0;
}
