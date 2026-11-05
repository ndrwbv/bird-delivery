/* Реакция на холодную пиццу фиксируется один раз на адрес, отдельно от начисления. */
export const COLD_REACTION = { UPSET: 0.7, MANAGER_NOTE: 0.25 };

export function result (stop, cold, why = '') {
  if (!stop.coldResult) stop.coldResult = {
    cold, coldWhy: cold ? why : '',
    coldUpset: cold && Math.random() < COLD_REACTION.UPSET,
    coldNote: cold && Math.random() < COLD_REACTION.MANAGER_NOTE,
  };
  return stop.coldResult;
}
