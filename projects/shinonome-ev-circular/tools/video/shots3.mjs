import { login } from './pb.mjs';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const OUT=(process.env.VIDEO_WORK)+'/shots3/'; mkdirSync(OUT,{recursive:true});
const cookie = await login('hayakawa@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
await ctx.addInitScript(() => { const s=document.createElement('style'); s.textContent='.editor-face > .annotation-box, .editor-face > .ask-about{display:none!important}'; document.addEventListener('DOMContentLoaded',()=>document.head.appendChild(s)); });
const p = await ctx.newPage();
const B='rprj_36ddff67adb24297';
const list = JSON.parse(process.argv[2]);
for (const [n, ph, path, text, nth] of list) {
  await p.goto(`http://127.0.0.1:4840/r/${B}/t/${ph}` + (path ? `/f?path=${encodeURIComponent(path)}` : '')); await p.waitForTimeout(path ? 8000 : 5000);
  if (text) { const hd = p.locator('.ProseMirror :is(h1,h2,h3,h4)').filter({ hasText: text }); const t = (await hd.count()) ? hd : p.getByText(text, { exact: false }); const k = nth ?? 0; const el = k < 0 ? t.last() : t.nth(k); await el.evaluate(e=>e.scrollIntoView({block:'start'})).catch(e=>console.log('noscroll',n)); await p.waitForTimeout(400);
    await el.evaluate(e => { let s=e.parentElement; while (s && !(s.scrollHeight>s.clientHeight+10 && getComputedStyle(s).overflowY!=='visible')) s=s.parentElement; if (s) s.scrollTop += e.getBoundingClientRect().top - s.getBoundingClientRect().top - 120; }).catch(()=>{}); await p.waitForTimeout(800); }
  await p.screenshot({ path: OUT+n+'.png' }); console.log(n);
}
await b.close();
