// Stable patches shared by ground relief, soil palette and planting.
export function smooth(from,to,value) {
  const t=Math.min(1,Math.max(0,(value-from)/(to-from)));
  return t*t*(3-2*t);
}

function hash(x,z) {
  let bits=Math.imul(x,1640531513)^Math.imul(z,1199540897);
  bits=Math.imul(bits^(bits>>>16),668265263);
  return ((bits^(bits>>>15))>>>0)/4294967295;
}

function noise(x,z) {
  const u=Math.floor(x),v=Math.floor(z);
  const a=smooth(0,1,x-u),b=smooth(0,1,z-v);
  const low=hash(u,v)*(1-a)+hash(u+1,v)*a;
  const high=hash(u,v+1)*(1-a)+hash(u+1,v+1)*a;
  return low*(1-b)+high*b;
}

export function relief(x,z) {
  const broad=noise(x/29+41,z/24-27)-0.48;
  const banks=noise(x/12-61,z/10+51)-0.5;
  const hollows=noise(x/6+31,z/7+91)-0.5;
  const ripples=noise(x/3.1-13,z/3.6+18)-0.48;
  return 3.78*broad+1.76*banks+0.69*hollows+0.43*ripples;
}

export function soilPattern(x,z) {
  const exposed=noise(x/33+63,z/27-55)*0.66
    +noise(x/6-41,z/7+38)*0.25+noise(x/1.8+22,z/2.1-34)*0.09;
  return {
    bare:smooth(0.56,0.74,exposed),
    sand:smooth(0.34,0.72,noise(x/46-16,z/37+76)),
    vigor:noise(x/17+13,z/14-56),
  };
}

export function treeHabitat(x,z) {
  return noise(x/41-22,z/38+17)*0.75+noise(x/12+17,z/14-32)*0.25;
}
