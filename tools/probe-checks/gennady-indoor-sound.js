if (!await until(() => !!document.querySelector('.sx')?.__st, 15000)) throw new Error('Подъезд не открылся');
await run(3);
const a = d.Snd.amb.DEBUG;
const targets = a.targets();
const active = Object.entries(targets).filter(([, v]) => v > 0.02).map(([name]) => name);
if (!active.includes('amb-stairwell') || active.some(name => name !== 'amb-stairwell'))
  throw new Error('В подъезде выбран уличный фон: ' + JSON.stringify({ active, targets, mode: a.mode }));
return { active, targets, mutedMode: a.mode, scene3d: !!document.querySelector('.sx')?.__st?.()?.d3 };
