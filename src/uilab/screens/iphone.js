/* Изолированные состояния телефона для просмотра и скриншотов без запуска города. */
export default function iphoneScreens ({ HUDFONE, t, log }) {
  return [{
    id: 'iphone', group: 'Телефон в HUD', name: 'iPhone 5s · курьерский HUD',
    note: 'Телефон выходит из правого нижнего угла и туда же возвращается. На уменьшенном экране видны карта, текущий заказ, деньги и жизни. Накладная открывается в приложении «Курьер», сообщение и баннер — внутри телефона.',
    knobs: [
      { k: 'phase', label: 'состояние', type: 'sel', def: 'dock', opts: [['dock', 'видно карту и заказ'], ['order', 'накладная в приложении'], ['banner', 'сообщение + уведомление'], ['big', 'переписка крупно'], ['map', 'приложение «Карты»'], ['home', 'домашний экран'], ['live', 'анимация от сообщения']] },
      { k: 'text', label: 'текст сообщения', type: 'text', def: 'Клиент уже ждёт. Ты где?' },
    ],
    show (o) {
      HUDFONE.setVisible(true);
      if (o.phase === 'live') {
        HUDFONE.demo('dock', String(o.text || ''));
        HUDFONE.receive({ name: t('Ирина Сергеевна'), role: t('управляющая'), text: String(o.text || '') });
      } else HUDFONE.demo(o.phase, String(o.text || ''));
      log('телефон: ' + o.phase);
    },
  }];
}
