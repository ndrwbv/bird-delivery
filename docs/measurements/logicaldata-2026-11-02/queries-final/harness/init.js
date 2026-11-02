/* №17ж observational init-script. No injected storage failure, no state/progress changes.
   Native marker publication must still precede legacy __boot; __startupTrace may exist earlier. */
(() => {
  const state = window.__startupBootGuard = { markerWrites: 0, bootAbsentAtMarker: true, earlyBootSeen: false };
  const nativeSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === 'dlv-single-marker-v1') {
      state.markerWrites++;
      if (window.__boot !== undefined) { state.bootAbsentAtMarker = false; state.earlyBootSeen = true; }
    }
    return nativeSet.call(this, key, value);
  };
})();

Object.defineProperty(window,"__streetGraphExportIdentity",{value:Object.freeze({"mapId":"seversk","mapHash":"feccf579eb6402d7cdf1f6f29288843bf792b645d0cb81c1006a2aeb0f8f13c3","editsHash":"b6634c2b88dc68358aee22c1c9046b821ee55bbe9308f63ed747fd20a2357c32","sourceHash":"b26caf3f59baa1bcf694fcd0336b4608b58e46447d5bd2d54c60beb746c41d85"}),writable:false,configurable:false});
