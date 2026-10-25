/* Опора поднятого грунта под четырьмя колёсами. Кузов поднимается осями,
   вместо скачка всей машины, когда через границу проходит её середина.
   Высоту обычного рельефа, мостов и крыш этот расчёт не меняет. */
export function landCarSupport(V, offsetAt, dt) {
  const fx=Math.sin(V.h),fz=Math.cos(V.h),sx=fz,sz=-fx;
  const contact=(f,s)=>{
    const x=V.x+fx*f+sx*s,z=V.z+fz*f+sz*s,r=.32;
    return (offsetAt(x-fx*r,z-fz*r)+2*offsetAt(x,z)+offsetAt(x+fx*r,z+fz*r))/4;
  };
  const fl=contact(1.4,.9),fr=contact(1.4,-.9),bl=contact(-1.45,.9),br=contact(-1.45,-.9);
  const target=(fl+fr+bl+br)/4;
  let p=V.landPose;
  if(!p||Math.hypot(V.x-p.x,V.z-p.z)>8)p=V.landPose={lift:target,x:V.x,z:V.z};
  p.lift+=(target-p.lift)*(1-Math.exp(-20*dt));p.x=V.x;p.z=V.z;
  return {delta:p.lift-offsetAt(V.x,V.z),front:(fl+fr)/2,back:(bl+br)/2,left:(fl+bl)/2,right:(fr+br)/2};
}
