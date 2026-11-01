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
