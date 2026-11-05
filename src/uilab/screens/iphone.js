/* Изолированные состояния телефона для просмотра и скриншотов без запуска города. */
export default function iphoneScreens ({ HUDFONE, HUDMAP, t, log, makePerson, faceDataURL }) {
  return [{
    id: 'iphone', group: 'Телефон в HUD', name: 'iPhone 4 · iOS 5–6',
    note: 'Слева — карта. В телефоне сначала яркая карточка: аватарка, имя, оставшиеся метры и время; затем лидеры смены. После доставки — единый праздничный итог.',
    knobs: [
      { k: 'phase', label: 'состояние', type: 'sel', def: 'dock', opts: [['dock', 'карта и телефон внизу'], ['order', 'новый заказ в телефоне'], ['paid', 'доставлено и выплата'], ['message', 'новое сообщение'], ['rating', 'рейтинг после заказа'], ['courier', 'заработок за смену'], ['home', 'домашний экран'], ['live', 'анимация от сообщения']] },
      { k: 'reaction', label: 'реакция гостя', type: 'sel', def: 'happy', opts: [['happy', 'понравилось'], ['angry', 'не понравилось'], ['ok', 'нормально']] },
      { k: 'text', label: 'текст сообщения', type: 'text', def: 'Клиент уже ждёт. Ты где?' },
    ],
    show (o) {
      HUDMAP.demoMap();
      HUDFONE.setVisible(true);
      const avatar = faceDataURL(makePerson({ seed: 4711, fem: true }), 64);
      if (o.phase === 'live') {
        HUDFONE.demo('dock', String(o.text || ''), avatar);
        HUDFONE.receive({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: String(o.text || '') });
      } else {
        HUDFONE.demo(o.phase, String(o.text || ''), avatar);
        if (o.phase === 'paid') {
          const mood = o.reaction || 'happy', tip = mood === 'happy' ? 150 : 0;
          HUDFONE.showPayment({ name: 'Света Т.', avatar: faceDataURL(makePerson({ seed: 4711, fem: true }), 96, mood), mood, duration: Infinity,
            amount: '+' + (700 + tip) + ' ₽', money: (3050 + tip) + ' ₽',
            breakdown: [{ label: t('заказ'), amount: '+700 ₽' }, { label: t('чаевые'), amount: tip ? '+150 ₽' : '0 ₽', kind: 'tip' }] });
        }
      }
      log('телефон: ' + o.phase);
    },
  }];
}
