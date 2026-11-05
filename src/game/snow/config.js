/* Метры, секунды и кг/м². Поле содержит зимний запас; сезон масштабирует
   его при выборке, не стирая колею при выходе в меню. */
export const SNOW = Object.freeze({
  TILE: 8,
  CELL: 0.125,
  CELLS: 64,
  DENSITY_LOOSE: 120,
  DENSITY_PACKED: 450,
  MAX_DEPTH: 8,
  FULL_TILES: 64,
  ARCHIVE_TILES: 384,
  ARCHIVE_CELLS: 32,
  PROTECT_RADIUS: 80,
  WEATHER_HZ: 2,
  MAX_CONTACT_DISTANCE: 12,
  MAX_CONTACT_CELLS: 8192,
  TIRE_WIDTH: 0.24,
  TIRE_LENGTH: 0.28,
  TIRE_CARRY: 0.16,
  TIRE_DROP_DISTANCE: 5,
  WHEEL_X: 0.89,
  WHEEL_FRONT: 1.4,
  WHEEL_REAR: -1.45,
  COMPACT_RATE: 32,
  WHEEL_TARGET: 0.88,
  FOOT_TARGET: 0.56,
  TRANSFER_STEP: 0.34,
  BARRIER_HEIGHT: 0.28,
  FRESH_RIDGE_COMPACTION: 0.18,
  RIDGE_HEADROOM: 0.35,
});

export const clamp01 = value => Math.max(0, Math.min(1, value || 0));
export const density = c => SNOW.DENSITY_LOOSE + (SNOW.DENSITY_PACKED - SNOW.DENSITY_LOOSE) * clamp01(c);
export const compactionOf = rho => clamp01((rho - SNOW.DENSITY_LOOSE) / (SNOW.DENSITY_PACKED - SNOW.DENSITY_LOOSE));
export const seasonFactor = snow => {
  const a = clamp01((snow - 0.04) / 0.86);
  return a * a * (3 - 2 * a);
};
