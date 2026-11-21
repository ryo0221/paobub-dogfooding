import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const source = JSON.parse(readFileSync('cad/extremities.model.json', 'utf8'));
const clip = (shape, boundary, keepLower) => {
  const sections = shape.loft;
  if (!sections || sections[0].plane !== 'xz') return shape;
  const at = boundary * 1000;
  const kept = sections.filter(section => keepLower ? section.w <= at : section.w >= at);
  const before = sections.findLast(section => section.w < at);
  const after = sections.find(section => section.w > at);
  if (before && after && !sections.some(section => section.w === at)) {
    const t = (at - before.w) / (after.w - before.w);
    const end = {plane:'xz', w:at, pts:before.pts.map((point,i)=>point.map((v,j)=>v+t*(after.pts[i][j]-v)))};
    if (keepLower) kept.push(end); else kept.unshift(end);
  }
  return {...shape, loft:kept};
};
const components = source.components.filter(c=>c.id==='foot' || c.id==='foot-mount' || c.id.startsWith('toe-') || c.id==='rear-toe')
  .map(c=>c.id.startsWith('toe-') ? {...c,shapes:c.shapes.map(s=>clip(s,-1.0,true))}
    : c.id==='rear-toe' ? {...c,shapes:c.shapes.map(s=>clip(s,.4,false))} : c);
mkdirSync('.paobub/cad', {recursive:true});
for (let batch=0; batch<3; batch++) {
  const forms = Array.from({length:12},(_,index)=>{
    const angle=batch*12+index;
    return {name:`${angle}度`,pose:{...Object.fromEntries(['bend-0','bend-1','bend-2','bend-rear'].map(id=>[id,angle])),'foot-lift':angle*.028}};
  });
  writeFileSync(`.paobub/cad/extremities-clearance-${batch}.model.json`, JSON.stringify({
    dir:`.paobub/cad/extremities-clearance-${batch}`, components, joints:source.joints, forms,
    allow:[['foot-mount','foot']]
  },null,2));
}
