/* Тёплая бумажная палитра карт начала 2010-х для приложения в телефоне HUD.
   Цвета относятся только к 2D-карте: материалы 3D-города не меняются. */
export const PHONE_MAP = Object.freeze({
  land: '#e9e4d6', water: '#a9d7e5', lot: '#e4dfd2', parkLot: '#d2dfc4',
  green: '#c9e1aa', forest: '#b4d797', playground: '#e7d6ad',
  path: '#f7f4e9', sidewalk: '#d5d2c7', roadEdge: '#d3b67e',
  road: ['#eead4e', '#f3bd67', '#f4cc83', '#f5d89b', '#f7eed8', '#faf8ed', '#eee9da', '#faf8ed'],
  bridge: '#b5b4ac', crossing: '#fffaf0',
  building: '#d6d4c9', publicBuilding: '#c5c9c6', shop: '#dfd2bf', industrial: '#c2c6c4',
  buildingEdge: '#a7a89f', street: '#5e625f', streetHalo: '#f8f7f0',
  radarRoad: '#faf8ee', radarMajor: '#f2c36d', radarEdge: '#d7c9a8',
});

export const phoneBuildingColor = kind => kind === 'pub' || kind === 'church' ? PHONE_MAP.publicBuilding
  : kind === 'shop' ? PHONE_MAP.shop : kind === 'ind' ? PHONE_MAP.industrial : PHONE_MAP.building;
