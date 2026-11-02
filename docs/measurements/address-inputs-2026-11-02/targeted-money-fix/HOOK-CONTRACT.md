# Pending prerequisites; no runtime patch applied

Root accepted this narrow diagnostic prerequisite after coverage release. These external scripts are intentionally fail closed on the frozen coverage build. They do not modify world state, request a different RNG, or supply an early address key.

1. Add `?addressclosure17b` as an alternative condition ONLY for `createAddressCatalogRecorder` (near `const ADDRESS_CATALOG`). Preserve existing `?logicalexport17b`; the new flag must NOT enter `STREET_GRAPH_EXPORT`, encode/decode the graph, alter roads, or install a reader. All existing emissions, mergeDoorsOnce and sealSpots stay at their original barriers and reuse original arrays/rows.
2. Immediately after `SEAS.initSeasons(...)` and `LATE.enable(...)`, BEFORE `STARTUP.work('city.syncBuild', ...buildCity())`, publish an immutable own data property `window.__addressClosure17bInitial`, only under the new flag. Freeze the root and every nested owned data object/array. Capture current scalars/read-only projections; deep-clone the six raw car storage values with structuredClone before freezing (never freeze live Store.get objects or arrays); no new Three objects, RNG calls, IDs, new seeding/yield, setter, flush, startRun, save write or copying whole globals. `AUTO.current()` currently reads its derived spec without writing storage; choose only fields needed below, not translated names.
3. Extend the existing `__landPackage17bPreLate` observer condition inside buildCity after PIZZA selection from `landexport17b` to `landexport17b || addressclosure17b`. Keep its exact readonly payload/property semantics and normal position before curbs/late jobs. No forced PZ selection. This observes physical PZ after it exists; do not invent PZ before buildCity.

Exact initial shape consumed by the draft:

```js
{
 phase: 'before-city-syncBuild', at: performance.now(),
 mapId: MAP.id, mode: import.meta.env.MODE, adult: !!ADULT, career: !!CAREER,
 intro: !!INTRO, editor: !!EDL.ED.on || !!window.__EDITOR,
 language: document.documentElement.lang,
 season: { value: SEAS.seasonValue(), forced: SEAS.seasonForced(), saved: Store.get('dlv-season', null) },
 donation: { trashRaw: Store.get('dlv-don-trash', 0), trashGoal: ECON.DONATE.trash.goal, trashFraction: donated('trash') },
 district: { current: DIST.cur(), opened: DIST.opened(), city: DIST.city() },
 car: { id: AUTO.current().id,
   inputs: { // own raw storage projections, always the same keys in this order
     'dlv-car-owned': Store.get('dlv-car-owned', null),
     'dlv-car-cur': Store.get('dlv-car-cur', null),
     'dlv-car-up': Store.get('dlv-car-up', null),
     'dlv-car-L': Store.get('dlv-car-L', null),
     'dlv-car-paint': Store.get('dlv-car-paint', null),
     'dlv-car-eng': Store.get('dlv-car-eng', null)
   }
 },
 graphics: { preset: GFX.preset(), device: GFX.DEBUG.dev },
 ordinary: EDL.rngDescriptor()
}
```

No fields carry full build/file SHA or a guessed precleanHash. Actual initial descriptor is an observation of evaluated inputs, not proof of complete input closure. Other raw progress keys and exact query/fixture are retained externally in the run records. At the menu the eval also checks actual physical PZ and the real sealed catalog. Later ordinary Go may change season via weather.shiftStart; that later stored value is recorded separately and is never substituted for the initial season.

Build requirement: implement/review hook on a NEW source; one immutable Steam build with honest source/build inventory. Do not reuse measured source2a/coverage build identity. An unbundled diagnostic build may take the genuine generated land fallback; this is not a cache timing/coverage acceptance. Preserve exact source/harness/build pins in config before any process; root grants a separate heavy slot.
