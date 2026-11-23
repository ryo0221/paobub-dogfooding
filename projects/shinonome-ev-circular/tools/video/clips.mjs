import { login } from './pb.mjs';
const exit_ = () => { throw new Error('VIDEO_WORK（作業フォルダー）を設定してください'); };
import { createRequire } from 'node:module';
import { renameSync, mkdirSync, rmSync } from 'node:fs';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const SRC=(process.env.VIDEO_WORK??exit_())+'/src/', TMP=(process.env.VIDEO_WORK??exit_())+'/rec/'; mkdirSync(TMP,{recursive:true});
const cookie = await login('hayakawa@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch();
const P='http://127.0.0.1:4840/r/rprj_36ddff67adb24297';
async function rec(n, url, fn) {
  rmSync(TMP,{recursive:true,force:true}); mkdirSync(TMP);
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: TMP, size: { width: 1600, height: 900 } } });
  await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(); const t0=Date.now();
  await p.goto(url); await p.waitForTimeout(7000); const start=(Date.now()-t0)/1000;
  await fn(p); await p.waitForTimeout(1500);
  const v = p.video(); await ctx.close(); renameSync(await v.path(), SRC+n+'.webm'); console.log(n, 'content starts at', start.toFixed(1));
}
const only = process.argv.slice(2); const want = (n) => !only.length || only.includes(n);
if (want('fit-map')) await rec('fit-map', `${P}/t/opportunity/f?path=docs%2Fopportunity-map.json`, async (p) => {
  await p.getByRole('button', { name: '全体を見る' }).click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: (process.env.VIDEO_WORK??exit_())+'/shots/opportunity-fit.png' });
});
if (want('model-fit')) await rec('model-fit', `${P}/t/business-model/f?path=docs%2Fbusiness-model-map.json`, async (p) => {
  await p.getByRole('button', { name: '全体を見る' }).click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: (process.env.VIDEO_WORK??exit_())+'/shots/model-fit.png' });
});
if (want('cite')) await rec('cite', `${P}/t/business-plan/f?path=docs%2Fbusiness-plan-document.json`, async (p) => {
  await p.locator('[data-block-id="b-034"]').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  const dlg = p.getByRole('dialog'); const S = (n) => dlg.locator('select').nth(n);
  await p.locator('[data-block-id="b-034"]').first().click(); await p.keyboard.press('End');
  await p.getByRole('button', { name: '引用を挿入' }).click(); await dlg.waitFor(); await p.waitForTimeout(1200);
  await S(1).selectOption({ index: 1 }); await p.waitForTimeout(1500);
  await S(2).selectOption({ index: 1 }); await p.waitForTimeout(1500);
  await S(3).selectOption({ index: 1 }); await p.waitForTimeout(1500);
  const o = await S(4).locator('option').allInnerTexts(); await S(4).selectOption({ label: o.find(t=>/NPV/.test(t)) }); await p.waitForTimeout(1200);
  await dlg.getByRole('button', { name: 'プレビュー' }).click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: (process.env.VIDEO_WORK??exit_())+'/shots/cite-dialog.png' });
  await dlg.getByRole('button', { name: '取り消す' }).click(); await p.waitForTimeout(800);
});
if (want('slides')) await rec('slides', `${P}/t/presentation/f?path=docs%2Fpresentation-slides.json`, async (p) => {
  for (let i = 1; i <= 8; i++) { await p.getByRole('button', { name: new RegExp(`^Slide ${i}:`) }).click(); await p.waitForTimeout(2200); }
});
if (want('scenario')) await rec('scenario', `${P}/t/financial-plan/f?path=docs%2Ffinancial-model.json`, async (p) => {
  const sel = p.locator('select').filter({ has: p.locator('option', { hasText: '楽観' }) }).first();
  for (const l of ['楽観','悲観','基本']) { await sel.selectOption({ label: l }).catch(e=>console.log('sel',e.message.slice(0,80))); await p.waitForTimeout(2500); }
});
await b.close();
