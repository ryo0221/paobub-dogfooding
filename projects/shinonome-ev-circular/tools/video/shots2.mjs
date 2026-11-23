import { login } from './pb.mjs';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const OUT=(process.env.VIDEO_WORK??(()=>{throw new Error('VIDEO_WORK（作業フォルダー）を設定してください')})())+'/shots2/'; mkdirSync(OUT,{recursive:true});
const cookie = await login('hayakawa@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
const p = await ctx.newPage();
const A='rprj_e2c82340ed814ceb', B='rprj_36ddff67adb24297';
const list = JSON.parse(process.argv[2]);
for (const [n, P, ph, path] of list) {
  await p.goto(`http://127.0.0.1:4840/r/${P}/t/${ph}` + (path ? `/f?path=${encodeURIComponent(path)}` : '')); await p.waitForTimeout(path ? 8000 : 5000);
  if (!path) { // scroll conversation to the first worker answer
    const ai = p.locator('text=/^AI$/').first(); await ai.scrollIntoViewIfNeeded().catch(()=>{}); await p.waitForTimeout(800);
  }
  await p.screenshot({ path: OUT+n+'.png' }); console.log(n);
}
await b.close();
