// Crown proportions and pigment are picked once per tree, across all detail levels.
export const TREES = {
  maple:  {width:1.18,height:0.89,face:0,leaf:[48,86,24],outer:[78,109,27],bark:['#6c4932','#79543a','#8c6244','#57412b'],branches:7},
  linden: {width:1.04,height:1.12,face:1,leaf:[32,70,32],outer:[56,96,44],bark:['#694728','#7b5434','#866242','#543723'],branches:6},
  birch:  {width:0.84,height:1.24,face:2,leaf:[65,92,28],outer:[87,109,36],bark:['#aa8660','#cfaa77','#95724f','#68503d'],branches:8},
  poplar: {width:0.82,height:1.32,face:2,leaf:[24,61,45],outer:[39,82,60],bark:['#716354','#877869','#766758','#50463b'],branches:6},
  rowan:  {width:0.89,height:0.91,face:3,leaf:[55,86,32],outer:[80,104,39],bark:['#765842','#8d6b50','#9d7860','#60462f'],branches:9},
  pine:   {width:0.90,height:1.09,face:3,leaf:[25,55,35],outer:[40,74,44],bark:['#6b4b32','#855b3b','#985f3e','#51412d'],branches:5},
};
const broadleaf = [TREES.maple,TREES.linden,TREES.birch,TREES.poplar,TREES.rowan];

export function treeStyle(x,z,conifer) {
  if(conifer) return TREES.pine;
  const seed=Math.imul(Math.round(x*10),73856093)^Math.imul(Math.round(z*10),19349669);
  return broadleaf[(seed>>>0)%broadleaf.length];
}

export function trunkRadiusAt(base,position) {
  const t=Math.max(0,position);
  if (t < 0.09) return base*(1-t*2.2);
  if (t < 0.48) return base*(0.802-(t-0.09)*0.66);
  return base*Math.max(0.14,0.5446-(t-0.48)*1.18);
}

export const SPRUCE = {
  width:0.84, height:1.42, face:3, leaf:[18,44,23], outer:[47,77,42],
  bark:['#55422e','#6c5136','#80674a','#423a2b'],
};

export const DRY = {
  width:0.97, height:1.0, face:2, leaf:[74,77,41], outer:[104,105,56],
  bark:['#786956','#93836d','#63594c','#534c41'],
};
