import * as K from '../.paobub/cad/kit.mjs';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const source = JSON.parse(readFileSync('cad/extremities.model.json', 'utf8'));
const components = source.components.filter(c =>
  c.id === 'foot' || c.id === 'foot-mount' || c.id === 'rear-toe' || c.id.startsWith('toe-'));
components.push({
  id: 'target', name: 'target',
  shapes: [K.disc('target-cylinder', '#7d838c', .74, 1.74, -.30, .15, .15)]
});
mkdirSync('.paobub/cad', {recursive:true});
writeFileSync('.paobub/cad/extremities-grasp.model.json', JSON.stringify({
  dir: '.paobub/cad/extremities-grasp', components, joints:source.joints,
  forms:source.forms, allow:source.allow
}, null, 2));
