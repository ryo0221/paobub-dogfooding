import { ctx } from './login.mjs'; import { startRec, sleep } from './rec.mjs';
const PID=process.env.PAOBUB_PROJECT_ID; if (!PID) throw new Error('PAOBUB_PROJECT_ID（rprj_…）を設定してください');
const [,, name, Tstr, out] = process.argv; const T = Number(Tstr)*1000;
const { browser, context, B } = await ctx({viewport:{width:1280,height:720},deviceScaleFactor:1.5});
const page = await context.newPage();
const go = async (u, w=5000) => { await page.goto(B+u); await sleep(w); await page.addStyleTag({content:'.native-editor > .raw-note{flex:0 0 auto!important;height:auto!important}'}); };
const f = (ph, p) => `/r/${PID}/t/${ph}/f?path=${encodeURIComponent('docs/'+p)}`;
const focus = async () => { await page.getByRole('button',{name:'左のペインを畳む'}).click({timeout:1500}).catch(()=>{}); await page.getByRole('button',{name:'Focus mode'}).click({timeout:2500}).catch(()=>{}); await sleep(1200); await page.mouse.move(1270,700); await sleep(300); };
async function wheel(x,y,total,ms,{ctrl=false,dx=false}={}) { await page.mouse.move(x,y); const n=Math.max(1,Math.round(ms/50)); if(ctrl) await page.keyboard.down('Control');
  for(let i=0;i<n;i++){ const t0=Date.now(); await page.mouse.wheel(dx?total/n:0, dx?0:total/n); const d=50-(Date.now()-t0); if(d>0) await sleep(d);} if(ctrl) await page.keyboard.up('Control'); }
async function glide(x,y,ms=800){ await page.mouse.move(x,y,{steps:Math.max(2,Math.round(ms/25))}); }
let rec, t0;
const begin = async () => { rec = await startRec(page, out); t0=Date.now(); };
const until = async (frac) => { const d = t0 + T*frac - Date.now(); if (d>0) await sleep(d); };
const C = {
 async git_line() { await go(f('script','script-doc.md'),5500); await focus(); await page.mouse.move(900,600); await begin(); await sleep(800);
   const l = page.getByText(/作業ブランチ/).first(); const bb = await l.boundingBox(); await glide(bb.x+10,bb.y+bb.height/2,800); await glide(bb.x+bb.width-10,bb.y+bb.height/2,T*0.5); await sleep(300); await glide(700,450,800); await until(1); },
 async project_list() { await go(`/r/${PID}/t/finish`,3500); await page.mouse.move(700,400); await begin(); await sleep(600);
   for (let y=260; y<=660; y+=33) { await glide(150, y, 200); await sleep(Math.max(60,(T*0.7)/13 - 200)); } await until(1); },
 async rough_dec_thread() { await go(`/r/${PID}/t/rough`,3500); await page.mouse.move(700,400); await begin(); await sleep(800);
   await glide(560,500,800); await sleep(T*0.25); const tab = page.getByText('成果物').first(); const bb=await tab.boundingBox(); await glide(bb.x+bb.width/2,bb.y+bb.height/2,700); await sleep(T*0.2);
   await glide(1100,200,700); await until(1); },
 async decisions_top() { await go(`/decision?project=${PID}&thread=output`,3500); await page.mouse.move(640,400); await begin(); await sleep(800); await wheel(640,450,350,T*0.4); await until(1); },
 async storyboard_view() { await go(f('storyboard','storyboard-pages.json'),6000); await focus(); await begin(); await sleep(600); await page.getByRole('button',{name:'全体を表示'}).click().catch(()=>{}); await sleep(T*0.3); await wheel(640,400,-300,T*0.3,{ctrl:true}); await until(1); },
 async project() { await go('/',3000); await page.mouse.move(900,500); await begin(); await sleep(1200);
   const card = page.getByText('漫画の制作・すべて受け入れ済み').first(); const bb = await card.boundingBox(); await glide(bb.x+bb.width/2, bb.y+bb.height/2, 900); await sleep(400); await card.click();
   await sleep(2500); await glide(120, 260, 800);
   for (let y=260; y<=660; y+=33) { await glide(150, y, 250); await sleep(Math.max(100,(T*0.55)/13 - 250)); }
   await until(1); },
 async control() { await go(`/control?project=${PID}&thread=process`,3500); await page.mouse.move(640,400); await begin(); await sleep(1500);
   await wheel(640,450,600,T*0.5); await until(1); },
 async decisions() { await go(`/decision?project=${PID}&thread=process`,3500); await page.mouse.move(640,400); await begin(); await sleep(1500);
   await wheel(640,450,2200,T*0.8); await until(1); },
 async rough_dec() { await go(`/r/${PID}/t/rough`,3000); await begin(); await sleep(800);
   const tab = page.getByText('判断記録').first(); const bb=await tab.boundingBox(); await glide(bb.x+bb.width/2,bb.y+bb.height/2,700); await tab.click(); await sleep(1200);
   await wheel(1050,450,1500,T*0.6); await until(1); },
 async doc_concept() { await go(f('concept','concept-doc.md'),5500); await focus(); await begin(); await sleep(1000); await wheel(640,450,2600,T*0.85); await until(1); },
 async doc_concept_note() { await go(f('concept','concept-doc.md'),5500); await page.mouse.move(640,300); await begin(); await sleep(800);
   const sel = page.locator('select').first(); const bb=await sel.boundingBox(); await glide(bb.x+60,bb.y+bb.height/2,800); await sleep(600);
   const memo = page.getByPlaceholder('この項目へのメモ'); const mb=await memo.boundingBox(); await glide(mb.x+80,mb.y+mb.height/2,700); await memo.click(); await page.keyboard.type('ログラインをもう少し短く', {delay:140}); await sleep(800);
   const ask = page.getByPlaceholder(/例：/); const ab=await ask.boundingBox(); await glide(ab.x+120,ab.y+20,700); await sleep(500); await until(1); },
 async doc_art() { await go(f('concept','art-guide.md'),5500); await focus(); await begin(); await sleep(1000); await wheel(640,450,3200,T*0.85); await until(1); },
 async sheet() { await go(f('character','character-sheet.json'),5500); await focus(); await begin(); await sleep(800);
   for (const y of [330,365,400,435,470]) { await glide(400,y,400); await sleep(250); }
   await wheel(640,400,1400,T*0.35,{dx:true}); await sleep(800); await wheel(640,400,-1400,T*0.2,{dx:true}); await until(1); },
 async relmap() { await go(f('character','relationship-map.json'),5500); await begin(); await sleep(800);
   await page.getByRole('button',{name:'全体を表示'}).click(); await sleep(1000);
   for (const n of ['朝比奈ねむ','小鳥遊すず','権田原たけし','西園寺れいか','棚橋先生']) { const b=page.getByRole('button',{name:'Select node '+n}); const bb=await b.boundingBox().catch(()=>null); if(bb){ await glide(bb.x+bb.width/2,bb.y+bb.height/2,500); await b.click(); await sleep(Math.max(300,T*0.12-500)); } }
   await until(1); },
 async map() { await go(f('stage','stage-map.json'),5500); await focus(); await begin(); await sleep(800);
   await page.getByRole('button',{name:'Fit map'}).click().catch(()=>{}); await sleep(1200);
   for (const n of ['部室（旧校舎3階・元・理科準備室）','旧校舎3階の廊下','生徒会室（新校舎2階）']) { const b=page.getByRole('button',{name:n,exact:true}).first(); const bb=await b.boundingBox().catch(()=>null); if(bb){ await glide(bb.x+bb.width/2,bb.y+bb.height/2,700); await sleep(T*0.15);} }
   await until(1); },
 async structure() { await go(f('story','structure-map.json'),5500); await focus(); await begin(); await sleep(800); await page.getByRole('button',{name:'全体を表示'}).click().catch(()=>{}); await sleep(1000); await wheel(640,450,300,T*0.4); await until(1); },
 async ledger() { await go(f('story','story-ledger.json'),5500); await focus(); await begin(); await sleep(800); for (const y of [420,455,490]) { await glide(500,y,500); await sleep(400);} await wheel(640,300,700,T*0.4); await until(1); },
 async script() { await go(f('script','script-doc.md'),5500); await focus(); await begin(); await sleep(800); await wheel(640,450,4200,T*0.85); await until(1); },
 async script_cont() { await go(f('script','script-doc.md'),5500); await focus();
   await page.getByText('続く状態',{exact:true}).first().scrollIntoViewIfNeeded().catch(()=>{}); await page.mouse.move(640,450); await sleep(800); await wheel(640,450,-150,300); await sleep(500);
   await begin(); await sleep(1000); await wheel(640,450,1400,T*0.8); await until(1); },
 async editorial() { await go(f('read','editorial-record.md'),5500); await focus(); await begin(); await sleep(1000); await wheel(640,450,3600,T*0.85); await until(1); },
 async learning() { await go(f('learning','learning-record.md'),5500); await focus(); await begin(); await sleep(1000); await wheel(640,450,2600,T*0.85); await until(1); },
 async output() { await go(f('output','output-record.json'),5500); await focus(); await begin(); await sleep(1000); await wheel(640,450,800,T*0.6); await until(1); },
};
// manga-page designs: select page N in the navigator, focus mode, overview -> fit page -> click panel -> fit panel
const design = (ph, file, opts={}) => async () => { await go(f(ph,file),7000);
  await page.getByRole('button',{name:'Page '+(opts.page??1),exact:true}).click(); await sleep(600);
  await focus(); await page.getByRole('button',{name:'Fit design'}).click().catch(()=>{}); await sleep(1200);
  const fit = page.getByRole('button',{name:'Fit selection'}); const fb = await fit.boundingBox();
  await begin(); await sleep(T*0.12);
  await glide(fb.x+fb.width/2, fb.y+fb.height/2, 700); await fit.click(); await sleep(300); await glide(640,420,600);
  await until(opts.panel ? 0.5 : 1); if (!opts.panel) return;
  const [px,py] = opts.panel; await glide(px,py,700); await page.mouse.click(px,py); await sleep(500);
  await glide(fb.x+fb.width/2, fb.y+fb.height/2, 700); await fit.click(); await sleep(400); await glide(640,400,600);
  if (opts.dbl) { await sleep(T*0.1); await glide(opts.dbl[0],opts.dbl[1],600); await page.mouse.dblclick(opts.dbl[0],opts.dbl[1]); }
  await until(1); };
C.storyboard = design('storyboard','storyboard-pages.json',{page:1, panel:[660,250]});
C.rough = design('rough','rough-pages.json',{page:2, panel:[660,420]});
C.ink = design('ink','ink-pages.json',{page:2, panel:[660,420]});
C.finish = design('finish','finished-pages.json',{page:2, panel:[660,420], dbl:[660,250]});
C.finish_p5 = design('finish','finished-pages.json',{page:5});
C.character_art = design('character','character-art.json',{page:1});
C.stage_art = design('stage','stage-art.json',{page:1});
C.finish_record = async () => { await go(f('finish','finished-pages.json'),7000); await focus(); await page.getByRole('button',{name:'Fit design'}).click().catch(()=>{}); await sleep(1200);
  const fit = page.getByRole('button',{name:'Fit selection'}); const fb = await fit.boundingBox();
  await begin(); await sleep(T*0.1); await glide(136,420,800); await page.mouse.click(136,420); await sleep(500); await glide(fb.x+fb.width/2, fb.y+fb.height/2, 700); await fit.click(); await sleep(400); await glide(640,400,600); await until(1); };
C.design_overview = async () => { await go(f('finish','finished-pages.json'),7000); await focus(); await begin(); await sleep(800); await page.getByRole('button',{name:'Fit design'}).click().catch(()=>{}); await glide(1183,422,T*0.4); await until(1); };
if (!C[name]) throw new Error('no clip '+name);
await C[name]();
console.log(name, (await rec.stop()).toFixed(2));
await browser.close();
