import { login } from './pb.mjs';
import { createRequire } from 'node:module';
import { renameSync, mkdirSync, rmSync } from 'node:fs';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const exit_ = () => { throw new Error('VIDEO_WORK（作業フォルダー）を設定してください'); };
const SRC=(process.env.VIDEO_WORK??exit_())+'/src/', TMP=(process.env.VIDEO_WORK??exit_())+'/rec/'; mkdirSync(SRC,{recursive:true});
const cookie = await login('hayakawa@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch();
async function rec(n, url, fn) {
  rmSync(TMP,{recursive:true,force:true}); mkdirSync(TMP,{recursive:true});
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: TMP, size: { width: 1600, height: 900 } } });
  await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
  const p = await ctx.newPage(); const t0=Date.now();
  await p.goto(url); await p.waitForTimeout(6000); console.log(n,'starts',((Date.now()-t0)/1000).toFixed(1));
  await fn(p); await p.waitForTimeout(1500);
  const v = p.video(); await ctx.close(); renameSync(await v.path(), SRC+n+'.webm');
}
const only = process.argv.slice(2); const want = (n) => !only.length || only.includes(n);
const typeSlow = async (p, loc, t) => { await loc.click(); await p.keyboard.type(t, { delay: 90 }); };
if (want('create')) await rec('create', 'http://127.0.0.1:4840/?org=org_43ebefe4ad314d25', async (p) => {
  await p.getByRole('button', { name: 'Project を作る' }).first().click(); await p.waitForTimeout(1500);
  const dlg = p.getByRole('dialog');
  await typeSlow(p, dlg.getByRole('textbox').first(), 'マインドマップの道具'); await p.waitForTimeout(800);
  await dlg.getByText('新しい Editor の開発').first().click(); await p.waitForTimeout(1500);
  await dlg.getByText('新しい Editor の開発').first().scrollIntoViewIfNeeded(); await p.waitForTimeout(1500);
  await dlg.getByRole('button', { name: 'やめる' }).click(); await p.waitForTimeout(800);
});
if (want('share')) await rec('share', 'http://127.0.0.1:4840/r/rprj_36ddff67adb24297', async (p) => {
  await p.getByRole('tab', { name: '共有' }).click(); await p.waitForTimeout(3500);
  await p.mouse.move(1430,600); await p.mouse.wheel(0,400); await p.waitForTimeout(2500);
});
if (want('mindmap')) await rec('mindmap', 'http://127.0.0.1:4840/r/rprj_36ddff67adb24297/t/opportunity/f?path=docs%2Fopportunity-map.json', async (p) => {
  await p.getByText('市場の変化').first().click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: '子を足す' }).click(); await p.waitForTimeout(1200);
  await p.keyboard.type('中古電池の相場', { delay: 110 }); await p.keyboard.press('Enter'); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: '全体を見る' }).click(); await p.waitForTimeout(2500);
  await p.getByRole('button', { name: 'Undo' }).click(); await p.waitForTimeout(1500);
});
if (want('room')) await rec('room', 'http://127.0.0.1:4840/r/rprj_36ddff67adb24297/t/investment', async (p) => {
  await p.mouse.move(800,500); for (let i=0;i<6;i++){ await p.mouse.wheel(0,-350); await p.waitForTimeout(900); }
  for (let i=0;i<6;i++){ await p.mouse.wheel(0,350); await p.waitForTimeout(900); }
});
await b.close();
