/**
 * Design の原稿（docs/finished-pages.json など）から、ページの画像を書き出す。
 * ページの枠ごとに Editor Platform の exportDesignFrameAreaSvg で SVG にし、Chromium で PNG にする。
 * 出力は「元の原稿から出し直す」決まりのため、ページの画像の正本はこの書き出し（compose.py の画像は下書き）。
 *
 * usage（Editor Platform のチェックアウトで）：
 *   EP_DIR=<open-editor-platform> bash tools/pages/export-pages.sh DESIGN_JSON OUT_DIR [WIDTH]
 * 先に Editor Platform の isDesignWithPaths で原稿を確かめる。
 * OUT_DIR/<page id>.png（幅 WIDTH、既定は原稿と同じ 2000）と <page id>.svg を書く。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { exportDesignFrameAreaSvg, isDesignWithPaths } from '@editor-platform/design/model';

const [designPath, outDir, widthArg] = process.argv.slice(2);
const doc = JSON.parse(readFileSync(designPath, 'utf8'));
if (!isDesignWithPaths(doc)) throw new Error(`${designPath} は Design の原稿として読めない（isDesignWithPaths）`); // PaoBub で開けない原稿からは書き出さない
console.log('isDesignWithPaths: ok');
mkdirSync(outDir, { recursive: true });
const pages: { id: string; width: number; height: number }[] = [];
for (const p of doc.pagination.pages) {
  const frame = doc.elements.find((e: { id: string }) => e.id === p.frameId);
  const svg = exportDesignFrameAreaSvg(doc, p.frameId, { background: '#ffffff' });
  writeFileSync(`${outDir}/${p.frameId}.svg`, svg);
  pages.push({ id: p.frameId, width: frame.bounds.width, height: frame.bounds.height });
}
// Chromium で PNG に（日本語の書体はシステムの書体。SVG の font-family のとおり）
const { chromium } = createRequire(import.meta.url)('playwright'); // 入っている Playwright（NODE_PATH）
const browser = await chromium.launch();
const width = Number(widthArg || 0);
// 原稿の書体名（Editor の既定 Noto Sans CJK JP）を、この環境にある日本語の書体に結び付ける。
// 結び付けないと、Chromium が中国語の字形の書体で代わりに組むことがある。FONT で書体を変えられる（既定は IPAゴシック）
const font = process.env.FONT || 'IPAGothic';
const fontFace = `@font-face{font-family:"Noto Sans CJK JP";src:local("${font}")}`;
console.log(`font: Noto Sans CJK JP -> ${font}`);
for (const p of pages) {
  const scale = width ? width / p.width : 1;
  const page = await browser.newPage({ viewport: { width: Math.round(p.width * scale), height: Math.round(p.height * scale) }, deviceScaleFactor: 1 });
  const svg = readFileSync(`${outDir}/${p.id}.svg`, 'utf8');
  await page.setContent(`<!doctype html><html><head><style>${fontFace}</style></head><body style="margin:0;background:#fff"><div style="width:${p.width * scale}px;height:${p.height * scale}px">${svg.replace('<svg', `<svg width="${p.width * scale}" height="${p.height * scale}"`)}</div></body></html>`);
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${outDir}/${p.id}.png`, clip: { x: 0, y: 0, width: Math.round(p.width * scale), height: Math.round(p.height * scale) } });
  await page.close();
  console.log(p.id);
}
await browser.close();
