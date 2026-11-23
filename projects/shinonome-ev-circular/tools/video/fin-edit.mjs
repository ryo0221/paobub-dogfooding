import { login } from './pb.mjs';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(''+(process.env.PAOBUB_DIR??'/home/user/paobub')+'/package.json')('playwright');
const SAVE = process.argv.includes('--save');
const cookie = await login('ishida@shinonome.example'); const [name, value] = cookie.split('=');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: SAVE ? { dir: process.env.VIDEO_WORK+'/rec', size: { width: 1600, height: 900 } } : undefined });
await ctx.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
const p = await ctx.newPage(); const errs=[]; p.on('pageerror', e=>errs.push(e.message));
await p.goto('http://127.0.0.1:4840/r/rprj_36ddff67adb24297/t/financial-plan/f?path=docs%2Ffinancial-model.json'); await p.waitForTimeout(7000);
const W = (ms=700)=>p.waitForTimeout(ms);
async function edit(n, { desc, src, pid, years, single }) {
  await p.getByRole('button',{name:'編集', exact:true}).nth(n).click(); await W(900);
  const dlg = p.locator('dialog[open], [role=dialog]').first();
  const field = async (label) => dlg.locator(`xpath=.//*[normalize-space(text())="${label}"]/following::input[1]`).first();
  if (desc) { await (await field('説明')).fill(desc); await W(300); }
  await (await field('出所の説明')).fill(src); await W(400);
  await (await field('URL または Project ID')).fill(pid); await W(400);
  if (years) for (let i=0;i<10;i++) { const f = await field(`年${i+1}`); await f.scrollIntoViewIfNeeded(); await f.fill(years[i]); await W(150); }
  if (single) { const f = await field('値'); await f.fill(single); }
  await W(600);
  await dlg.getByRole('button',{name:'適用'}).click(); await W(1200);
}
const fa01 = ['0','0','0','0','60076880','78033880','95986920','113916940','131895980','149850000'];
const fa02 = ['30000000','65000000','95000000','130000000','172363862','213598511','254868761','290686909','348423159','356905038'];
await edit(0, { desc:'拠点の模型の処理量と収益の柱の単価から積み上げた年間売上。', src:'（仮定）石田 2026-11-23。2030年からは MS-03・MS-06 と TR-01・TR-02 の処理量に、回収手数料 2,500 THB/t（RS-01）、材料販売 3,500 THB/t×70％（RS-02）、再製造品 25,000 THB/台×販売率 90％（RS-03）を掛けた。2029年度までは 0。', pid:'TR-02', years: fa01 });
await edit(1, { desc:'実証・準備の費用と、拠点の模型の運営費・増設費に拠点の外の費用を足した年間費用。', src:'（仮定）石田 2026-11-23。2029年度までは ML-01〜ML-04 と MD-01 の実証・準備費。2030年からは TR-03 の拠点の運営費と TR-04 の増設費に、本社・営業、e-Axle のコアの買い取り、保険・許認可（OR-01・OR-04・OR-05、MS-06、CS-05）を足した。', pid:'TR-03', years: fa02 });
// FA-03 single value
await p.getByRole('button',{name:'編集', exact:true}).nth(2).click(); await W(900);
{ const dlg = p.locator('dialog[open], [role=dialog]').first();
  await dlg.getByLabel('説明',{exact:true}).fill('拠点の模型の立ち上げ設備・改装に、実証と試作の設備を足した初期設備投資。'); await W(300);
  await dlg.getByLabel('出所の説明',{exact:true}).fill('（仮定）石田 2026-11-23。TR-04 の2030年の立ち上げ設備・改装 1.36 億円に、電池実証の計測・安全器材 0.10 億円と e-Axle 試作の治具・計測器 0.25 億円（ML-02・ML-03）を足した。'); await W(400);
  await dlg.getByLabel('出所',{exact:true}).fill('TR-04'); await W(400);
  await dlg.getByLabel('値',{exact:true}).fill('171000000'); await W(700);
  await dlg.getByRole('button',{name:'適用'}).click(); await W(1500); }
const scale = (arr, f) => arr.map(x => String(Math.round(Number(x)*f)));
for (const [label, f] of [['楽観',1.2],['悲観',0.8]]) {
  await p.getByText(`${label}の年次推移と引用`).click(); await W(700);
  const inp = p.getByLabel(`${label} 年間売上の上書き`); await inp.scrollIntoViewIfNeeded();
  await inp.fill(scale(fa01,f).join('\t')); await W(500);
  await inp.locator('xpath=following-sibling::button[1]').click(); await W(1500);
  await p.getByText(`${label}の年次推移と引用`).click(); await W(400);
}
await p.getByText('シナリオ比較').scrollIntoViewIfNeeded(); await W(2500);
if (SAVE) { await p.getByRole('button',{name:'保存する'}).click(); await W(6000); console.log('saved'); }
const body = await p.locator('body').innerText();
console.log(body.slice(body.indexOf('前提を追加'), body.indexOf('前提を追加')+900));
console.log(body.slice(body.indexOf('シナリオ比較'), body.indexOf('シナリオ比較')+200));
console.log('errs', errs);
await ctx.close(); await b.close();
