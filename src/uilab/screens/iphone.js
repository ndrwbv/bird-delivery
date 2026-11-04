/* Изолированные состояния телефона для просмотра и скриншотов без запуска города. */
export default function iphoneScreens ({ HUDFONE, HUDMAP, t, log }) {
  return [{
    id: 'iphone', group: 'Телефон в HUD', name: 'iPhone 4 · iOS 5–6',
    note: 'Карта и заказ видны слева в HUD. Телефон выглядывает снизу справа: внутри сообщения, новая накладная, рейтинг и заработок за смену.',
    knobs: [
      { k: 'phase', label: 'состояние', type: 'sel', def: 'dock', opts: [['dock', 'карта и телефон внизу'], ['order', 'новый заказ в телефоне'], ['paid', 'доставлено и выплата'], ['message', 'новое сообщение'], ['rating', 'рейтинг после заказа'], ['courier', 'заработок за смену'], ['home', 'домашний экран'], ['live', 'анимация от сообщения']] },
      { k: 'text', label: 'текст сообщения', type: 'text', def: 'Клиент уже ждёт. Ты где?' },
    ],
    show (o) {
      const map = HUDMAP.demoMap();
      map.classList.toggle('hios-awaiting-order', o.phase === 'order' || o.phase === 'rating');
      HUDFONE.setVisible(true);
      if (o.phase === 'live') {
        HUDFONE.demo('dock', String(o.text || ''));
        HUDFONE.receive({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: String(o.text || '') });
      } else {
        HUDFONE.demo(o.phase, String(o.text || ''));
        if (o.phase === 'paid') HUDMAP.payment({ name: 'Света Т.', amount: '850 ₽', money: '3 200 ₽' });
      }
      log('телефон: ' + o.phase);
    },
  }];
}
