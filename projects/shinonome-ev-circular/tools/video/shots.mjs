import { login } from './pb.mjs';
const exit_ = () => { throw new Error('VIDEO_WORK（作業フォルダー）を設定してください'); };
import { createRequire } from 'node:module';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const OUT=(process.env.VIDEO_WORK??exit_())+'/shots/'; (await import('node:fs')).mkdirSync(OUT,{recursive:true});
const cookie = await login('hayakawa@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
await ctx.addInitScript(() => { const s=document.createElement('style'); s.textContent='.editor-face > .annotation-box, .editor-face > .ask-about{display:none!important}'; document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s)); });
const p = await ctx.newPage();
const P='http://127.0.0.1:4840/r/rprj_36ddff67adb24297';
const only = process.argv.slice(2);
const shots = [
  ['project', `${P}`],
  ['opportunity', `${P}/t/opportunity/f?path=docs%2Fopportunity-map.json`],
  ['model', `${P}/t/business-model/f?path=docs%2Fbusiness-model-map.json`],
  ['financial', `${P}/t/financial-plan/f?path=docs%2Ffinancial-model.json`],
  ['investment', `${P}/t/investment`],
  ['plan', `${P}/t/business-plan/f?path=docs%2Fbusiness-plan-document.json`],
  ['slides', `${P}/t/presentation/f?path=docs%2Fpresentation-slides.json`],
  ['decision', `${P}/t/management-decision/f?path=docs%2Fmanagement-record.md`],
  ['learning', `${P}/t/learning/f?path=docs%2Flearning-record.md`],
  ['control', `${P}/control`],
];
for (const [n,u] of shots) { if (only.length && !only.includes(n)) continue;
  await p.goto(u); await p.waitForTimeout(7000);
  if (n==='plan') { await p.locator('[data-block-id="b-034"]').first().scrollIntoViewIfNeeded().catch(()=>{}); await p.waitForTimeout(1500); }
  if (n==='slides') { await p.getByRole('button', { name: /^Slide 6:/ }).click().catch(()=>{}); await p.waitForTimeout(2000); }
  await p.screenshot({ path: OUT+n+'.png' }); console.log(n, p.url());
}
await b.close();
