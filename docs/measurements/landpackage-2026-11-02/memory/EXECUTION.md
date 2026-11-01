# Execution record preparation — no process launched

Root-approved PROTOCOL.md / pins.json / memory-eval.js / pair-gate.mjs / conditions / templates are unchanged.

Only after explicit coordinator GO, one foreground invocation at a time:

```sh
node /tmp/bird-ordinary17b-memory/run-memory-once.mjs generated --go
```

It spawns exactly pins.commands.generated (`npm run probe -- ...`) and records the actual npm pid/argv, clocks, status/signal and before/after hashes. It does not launch cache. STOP after any unexpected failure; no retry or reused output. A template is never copied as PASS.

Only after first actual generated admission PASS and coordinator continuation:

```sh
node /tmp/bird-ordinary17b-memory/run-memory-once.mjs cache --go
```

Both actual raw texts and records then go to the reviewed pure validateMemoryPair, with exactly seven observedHashes keys from small current eval/pairGate/fixture/catalog/index/probe/probePage. The helper does not edit the reviewed protocol/pins or read payload/build trees. Small measured-input copies are separately retained for each run. It refuses any preexisting raw/log/run evidence and does not resume a partial attempt.

Before execution raw/stdout/stderr do not exist: their SHA is null/exists false, not a fabricated empty successful report. After exit first report/log SHA is retained even on failure. `pid` is the actual spawned npm launcher; the renderer/Electron process origin is independently recorded by existing probe startupHost. No physical Deck claim, no phase/time threshold adjustments or automatic next measurement.
