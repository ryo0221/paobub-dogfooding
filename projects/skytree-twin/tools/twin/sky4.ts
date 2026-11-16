/** #936: the K3 tower with its tubes as steel pipes (assumed walls, not from a drawing). */
import type { BimDocument, BimProfile } from '@editor-platform/bim-core';
import { sky3 } from './sky3';
export const walls: Record<string, [number, number, string]> = {
  't-leg': [2300, 100, 'Leg pipe 2300x100'],
  't-leg-hi': [1600, 60, 'Leg pipe 1600x60'],
  't-ring-tube': [1200, 40, 'Ring pipe 1200x40'],
  't-ring-tube-hi': [900, 32, 'Ring pipe 900x32'],
  't-brace': [900, 32, 'Brace pipe 900x32'],
  't-brace-hi': [600, 25, 'Brace pipe 600x25'],
};
export function sky4(): BimDocument {
  const doc = sky3();
  doc.project.name = 'Sky tower (steel pipes)';
  for (const t of doc.types) {
    const w = walls[t.id];
    if (!w || !('profile' in t)) continue;
    t.profile = { shape: 'pipe', diameterMm: w[0], wallMm: w[1] } as BimProfile;
    t.name = w[2];
  }
  return doc;
}
