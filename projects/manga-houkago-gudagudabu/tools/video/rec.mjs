import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
// Records the page via CDP screencast (device pixels) and writes an mp4 at 30fps.
export async function startRec(page, out) {
  const dir = out + '.frames'; fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
  const cdp = await page.context().newCDPSession(page);
  const frames=[]; let n=0;
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, String(n++).padStart(6,'0')+'.jpg');
    fs.writeFileSync(file, Buffer.from(f.data,'base64')); frames.push({file, t: Date.now()/1000});
    cdp.send('Page.screencastFrameAck',{sessionId:f.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  const t0 = Date.now()/1000;
  return { t0, async stop() {
    const tEnd = Date.now()/1000;
    await cdp.send('Page.stopScreencast').catch(()=>{});
    await new Promise(r=>setTimeout(r,300));
    if(!frames.length) throw new Error('no frames');
    let lines=['ffconcat version 1.0'];
    // first frame from t0
    for (let i=0;i<frames.length;i++){ const s = i===0? t0 : frames[i].t; const e = i+1<frames.length? frames[i+1].t : tEnd;
      lines.push(`file '${path.resolve(frames[i].file)}'`, `duration ${Math.max(0.001,e-s).toFixed(4)}`); }
    lines.push(`file '${path.resolve(frames.at(-1).file)}'`);
    fs.writeFileSync(dir+'/list.txt', lines.join('\n'));
    execFileSync('ffmpeg',['-loglevel','error','-y','-f','concat','-safe','0','-i',dir+'/list.txt','-vf','scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:white,fps=30,format=yuv420p','-c:v','libx264','-crf','18','-preset','veryfast',out]);
    return tEnd - t0;
  }};
}
export const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
// smooth mouse move
export async function glide(page, x, y, steps=25){ await page.mouse.move(x,y,{steps}); }
export async function zoomAt(page, x, y, ticks, dir=-1, delay=60){ await page.mouse.move(x,y); await page.keyboard.down('Control'); for(let i=0;i<ticks;i++){ await page.mouse.wheel(0, dir*100); await sleep(delay);} await page.keyboard.up('Control'); }
