/* №15а: useful manager messages, no destruction conversation, pizzeria growth only in chat.
   npm run probe -- --mode=steam --size=deck --cpu=3 --q='gfx=high&gfxdev=deck&managershot'
     --eval=tools/probe-checks/manager-messages.js --max=0 --errors
   Add --lang=en for the English rating; document.documentElement.lang selects assertions.
   RU bundle/late text assertions remain strict; English also checks the exact reaction is displayed.
   Growth uses actual delivery counting at each threshold; no money/threshold rules are changed. */
await onShift(); autopilot(false); d.SBX.god = true; d.SBX.noStall = true;
await run(4.8);
const lang = (document.documentElement.lang || '').toLowerCase().split('-')[0];
const en = lang === 'en';
const out = { lang, failures: [], ratings: [], callbacks: 0 };
const check = (ok, why) => { if (!ok) out.failures.push(why); };
check(lang === 'ru' || en, 'manager messages test supports actual document language ru/en');
const N = window.__NQ;
const isRating = text => /наш рейтинг вырос|our rating has risen/i.test(text);
const reactionShown = rec => !!(rec && rec.m && rec.m.said && rec.m.el.isConnected && !rec.m.el.classList.contains('out')
  && rec.m.el.querySelector('p:not(.typing)')?.textContent.trim());
const messages = () => N.LOG.filter(e => e.act === 'show' && e.kind === 'boss');
const text = () => [...document.querySelectorAll('#chat .cm:not(.out) .cm-b p:not(.typing)')].map(p => p.textContent).join('\n');
d.CHAT.clear(); await run(0.6);
const b0 = messages().length;
const empty = d.CHAT.say('   ', () => out.callbacks++);
check(empty === null && out.callbacks === 1 && messages().length === b0 && !d.CHAT.busy(), 'empty message has no typing/wait but keeps its callback');
// A large destruction count used to schedule a separate conversation even on an ordinary delivery.
d.HAVOC.H.n.fence = 22; d.HAVOC.H.n.car = 9; d.HAVOC.H.n.bin = 7;
const plain = { pay: { fee: 100 }, persons: [], peds: [] };
d.bossOnDeliver({ idx: 0, stops: [plain] }, plain, true, 0);
await run(2.8);
check(!d.CHAT.busy() && messages().length === b0, 'destruction recap creates no message or delayed wait');
check(d.HAVOC.counts().fence === 22 && d.HAVOC.counts().car === 9, 'daily task counters preserved');
const i = d.DIST.at(d.V.x, d.V.z) >= 0 ? d.DIST.at(d.V.x, d.V.z) : d.DIST.cur();
for (const stage of [2, 3, 4, 5]) {
 d.CHAT.clear(); await run(0.6);
 d.GROW.set(i, d.GROW.G.AT[stage - 1] - 1);
 const at = N.LOG.length;
 d.GROW.delivered(d.V.x, d.V.z);
 // More frames/deliveries within the same stage must not announce it again.
 d.GROW.delivered(d.V.x, d.V.z); d.GROW.delivered(d.V.x, d.V.z);
 await until(() => messages().some(e => isRating(e.text) && e.text.includes(String(stage))), 5000);
 await run(0.9);
 const news = N.LOG.slice(at).filter(e => e.act === 'show' && e.kind === 'boss' && isRating(e.text));
 const expected = en ? 'Team, our rating has risen to ' + stage + ' stars. Well done.'
   : 'Коллеги, наш рейтинг вырос до ' + stage + ' звёзд. Молодцы.';
 check(news.length === 1 && news[0].text === expected, 'one correctly declined real rating message for stage ' + stage);
 if (en) check(news.every(e => !/[А-Яа-яЁё]/u.test(e.text)), 'English rating contains no Russian text for stage ' + stage);
 check(!N.LOG.slice(at).some(e => e.kind === 'line' && /пиццерия|рейтинг|pizzeria|rating/i.test(e.text)), 'no central rating announcement for stage ' + stage);
 check(text().includes(expected), 'rating is visible in right chat for stage ' + stage);
 out.ratings.push({ stage, expected, count: d.GROW.counts[i], messages: news.map(e => e.text) });
 if (stage === 2 && new URLSearchParams(location.search).has('managershot')) await shot('/tmp/bird-manager-rating-' + lang + '.png');
}
d.CHAT.clear(); await run(0.6);
const bundle = d.CHAT.react('bundle'); await run(1);
check((en ? (reactionShown(bundle) && text().includes('All addresses on time. Well done.') && !/[А-Яа-яЁё]/u.test(text())) : text().includes('Все адреса в срок. Молодец.'))
  && !/развоз закрыт|проверь коробки|dispatch (?:is )?closed|check (?:the )?boxes/i.test(text()), 'bundle reports actual completion without empty instruction');
d.CHAT.clear(); await run(0.6);
const late = d.CHAT.react('late', () => out.callbacks++); await run(1);
check(out.callbacks === 2 && (en ? (reactionShown(late) && text().includes('The pizza got cold. The customer is unhappy; we will deduct the replacement from your pay.') && !/[А-Яа-яЁё]/u.test(text())) : /Пицца остыла|Клиент недоволен/i.test(text())), 'real order problem and its payment callback remain');
d.CHAT.clear(); await run(0.6);
check(out.callbacks === 2, 'clearing displayed message does not repeat payment callback');
out.crash = d.crashlog.entries(); check(!out.crash.length, 'crash log empty');
if (out.failures.length) throw Error(JSON.stringify(out));
return out;
