await onShift();
const states = [];
for (let i = 0; i < 16; i++) {
  await run(1);
  states.push({ second: i + 1, phase: d.S.state, text: document.querySelector('#chat')?.textContent?.slice(0, 220) || '' });
}
return { pizzeria: d.PIZZA?.name, manager: d.CHAT.person()?.fem, states };
