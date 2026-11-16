/** FU4: LR4's tower with windows in the Tembo deck's leaning glass. */
import type { BimDocument, BimElement } from '@editor-platform/bim-core';
import { sky5 } from './sky5';
export const deckWindowsAlong = [3_000, 11_000, 19_000, 27_000];
export function sky6(): BimDocument {
  const doc = sky5();
  doc.project.name = 'Sky tower (windows in the leaning glass)';
  if (!doc.types.some((t) => t.id === 't-window-1800'))
    doc.types.push({ id: 't-window-1800', kind: 'window', name: 'Window 1800', widthMm: 1800, heightMm: 1500 });
  const windows: BimElement[] = [];
  for (const e of doc.elements)
    if (e.kind === 'wall' && /^d1-cw-/.test(e.id))
      for (const [k, alongMm] of deckWindowsAlong.entries())
        windows.push({ id: `${e.id}-win-${k + 1}`, kind: 'window', typeId: 't-window-1800', hostId: e.id, alongMm, sillMm: 900, flipFacing: false });
  doc.elements.push(...windows);
  return doc;
}
