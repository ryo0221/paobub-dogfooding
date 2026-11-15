import { createRequire } from 'node:module';
// Playwright: this folder's node_modules, or the folder named by PLAYWRIGHT_DIR (e.g. `npm root -g`).
const { chromium } = createRequire(process.env.PLAYWRIGHT_DIR ? process.env.PLAYWRIGHT_DIR.replace(/\/?$/, '/') : import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path';
const B=process.env.PAOBUB_WEB ?? 'http://127.0.0.1:4840', email=process.env.PAOBUB_EMAIL ?? 'video@example.com';
export async function ctx(opts={}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport:{width:1920,height:1080}, locale:'ja-JP', ...opts });
  const r = context.request;
  const since=Date.now()-1000;
  const s = await r.post(B+'/api/auth/code',{data:{email}}); if(s.status()!==202) throw new Error('code '+s.status()+await s.text());
  const ob = process.env.PAOBUB_OUTBOX ?? path.join(process.env.HOME,'.paobub-mvp/outbox'); let code;
  for(let i=0;i<50&&!code;i++){ await new Promise(r=>setTimeout(r,200)); if(!fs.existsSync(ob)) continue;
    for(const f of fs.readdirSync(ob).sort()){ const m=JSON.parse(fs.readFileSync(path.join(ob,f),'utf8')); if(m.kind==='login-code'&&m.to===email&&Date.parse(m.createdAt)>=since) code=m.code; } }
  const v = await r.post(B+'/api/auth/verify',{data:{email,code}}); if(v.status()!==200) throw new Error('verify '+v.status()+await v.text());
  return { browser, context, B };
}
