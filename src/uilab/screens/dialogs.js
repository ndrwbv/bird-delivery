/* Панель просмотра активных встреч: данные берутся из story.js. */
import { STORIES, PERSON } from '../../game/story.js';

export default function dialogScreens ({ t, DLG, log }) {
  const rows = STORIES.flatMap(s => s.chapters.map((c, i) => ({ id: s.id + ':' + i, story: s, chapter: c })));
  return [{
    id: 'dialogs', group: 'Диалоги', name: 'сценарные диалоги', auto: false,
    note: 'Показ реплик активных сценариев. В игре разговор происходит у квартиры.',
    knobs: [
      { k: 'dialog', label: 'встреча', type: 'sel', def: rows[0] ? rows[0].id : '',
        opts: rows.map(r => [r.id, t(r.story.name) + ' · ' + t(r.chapter.name), 'Сценарий']) },
      { k: 'fast', label: 'печатать быстро', type: 'bool', def: false },
    ],
    async show (o, tok) {
      const row = rows.find(r => r.id === o.dialog);
      if (!row) return;
      const host = PERSON.host(row.story.id), courier = PERSON.courier();
      for (const [i, line] of row.chapter.dialogue.entries()) {
        if (tok.dead) return;
        const own = line.speaker === 'courier', person = own ? courier : host;
        const choice = line.choices || [];
        await DLG.say({ compact: true, canonicalName: true, person, name: person.name, text: t(line.text), fillers: false,
          accept: choice[0] ? t(choice[0].text) : t('дальше'),
          decline: choice[1] ? t(choice[1].text) : undefined, stack: choice.length > 1,
          cps: o.fast ? 400 : undefined });
        log((i + 1) + '. ' + person.name + ': ' + t(line.text));
      }
    },
  }];
}
