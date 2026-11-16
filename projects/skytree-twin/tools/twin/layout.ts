import { twinBim } from './twin-bim';
import { boxBodies } from './boxes';
const bim = twinBim();
const b = boxBodies(bim);
const groups = new Map<string, number[][]>();
for (const [id, x] of b) {
  const g = id.replace(/^b\d\d-/, 'band-').split('-').slice(0, 2).join('-').replace(/\d+$/, '');
  const cur = groups.get(g) ?? [[1e12, 1e12, 1e12], [-1e12, -1e12, -1e12]];
  for (let i = 0; i < 3; i++) { cur[0]![i] = Math.min(cur[0]![i]!, x.bounds[0][i]); cur[1]![i] = Math.max(cur[1]![i]!, x.bounds[1][i]); }
  groups.set(g, cur);
}
for (const [g, [lo, hi]] of [...groups].sort()) console.log(g.padEnd(20), lo!.map((v) => (v / 1000).toFixed(0)).join(','), '→', hi!.map((v) => (v / 1000).toFixed(0)).join(','));
