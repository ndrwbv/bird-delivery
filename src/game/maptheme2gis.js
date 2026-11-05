/* Тёплая бумажная палитра карт начала 2010-х для приложения в телефоне HUD.
   Цвета относятся только к 2D-карте: материалы 3D-города не меняются. */
export const PHONE_MAP = Object.freeze({
  land: '#f4ebd2', water: '#80c9e9', lot: '#efe4c9', parkLot: '#c5e7a5',
  green: '#aede82', forest: '#83c56d', playground: '#f8d27d',
  path: '#fff8df', sidewalk: '#dcd7bc', roadEdge: '#dda256',
  road: ['#f79732', '#ffb449', '#ffd06a', '#ffe09a', '#fff1ce', '#fff9e6', '#f2e7cb', '#fff9e6'],
  bridge: '#b5b4ac', crossing: '#fffaf0',
  building: '#d6d4c9', publicBuilding: '#c5c9c6', shop: '#dfd2bf', industrial: '#c2c6c4',
  buildingEdge: '#a7a89f', street: '#5e625f', streetHalo: '#f8f7f0',
  radarRoad: '#fff9e6', radarMajor: '#ffbd4c', radarEdge: '#dbc293',
});

export const phoneBuildingColor = kind => kind === 'pub' || kind === 'church' ? PHONE_MAP.publicBuilding
  : kind === 'shop' ? PHONE_MAP.shop : kind === 'ind' ? PHONE_MAP.industrial : PHONE_MAP.building;
