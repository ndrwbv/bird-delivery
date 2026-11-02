# q17b: targeted ordinary district 3/7 coverage — read-only plan, 2026-11-02

Status: no source/tools/docs edits, build, game run, full hash traversal or new CLI. This is an admission/export plan, not proof of equal inputs or permission to broaden production eligibility.

## Current-source blocker

The requested binary exports cannot run honestly on SAME CURRENT final source. `src/game/landdata/land-package-export.js` currently requires `runtime.district===0` in checkBefore and records district 0 in conditions; `tools/land-package-export-host.cjs` independently requires conditions.district===0. A true district 3 or 7 export will fail these guards. Do not alter the fixture later, lie in runtime metadata, or switch pizzeria after fingerprinting to bypass them.

`land-package-reader.js` correctly returns unsupported-district BEFORE preclean hash for district!=0. Keep that production guard unchanged until actual export evidence and a separate decision. With no source change, only generated startup/picker pilots for 3/7 are possible, not the requested ordinary land files.

Smallest next authorized code step, if root chooses this tail: experimental EXPORT-ONLY explicit districts [0,3,7] in producer and host, actual runtime district in conditions (no hardcoded 0), tests rejecting all other districts and mismatched metadata. It changes functional sourceHash: create ONE new common immutable build + source/build receipt before both exports; do not reuse the old catalog as an exact-source hit. Reader remains district0-only. No implementation prepared here.

## Honest progress descriptors

Original saved fixtures are small JSON native storage values:

- `/tmp/bird-startup17-series-5a20287/saved-near-1-fixture.json`, SHA256 b00382a13530f84154b63ea41871b2d73ebba342cf7ba4f30d4e85d60fb7cf35, initial district 0.
- `/tmp/bird-startup17-series-5a20287/saved-far-1-fixture.json`, SHA256 e2f0e910a4a7f61115287652cc896cbc63f985a0eeeecabc6acf081cc75df4d0, initial district 7.

Copy the explicit descriptors, not their old seed7 outputs/17a identities. Shared progress is:

```
dlv-shifts = 40
dlv-dist-open = 8
dlv-dist-shifts = [4,5,5,6,6,7,7,0]
dlv-city-party = true
dlv-city-mode = false
dlv-msk-wallet = 30000
dlv-msk-guide = 1
dlv-msk-tut = "1"
dlv-msk-nostut = 1
dlv-shift-tut = 1
dlv-lang = "ru"
dlv-sound = false
```

For the near target, derive the original near descriptor with `dlv-district=3`; for far retain 7. Both additionally store `dlv-gfx={deck:{p:"high",rv:2}}`, because absent Deck settings default to mid. Preserve all other values. These describe synthetic mature saved careers with consistent counts; not a claim that an uninterrupted human played them. Counts sum 40 and meet current unlock requirements; they also pass non-debug CITYOPEN repair (old minimum 26), unlike setting opened=8 in a fresh career.

For `DIST.cur()` alone, district plus a consistent opened/counts tuple suffices to prevent clamp. That is not sufficient for this acceptance: all-open, acknowledged party and 40 completed shifts give the existing normal district picker without an unrelated first-shift/tutorial/party branch. Do not optimize away that meaningful progress.

Do NOT copy or handcraft dlv-single-marker-v1, journal, backup, reset backup, saveId, ownerId, transaction IDs or profile namespace metadata. Each isolated process starts from raw canonical keys above. Normal `migrateSingleProgress()` runs after platform/i18n and before game/map import, creates its own verified owner/marker via crypto, and moves the canonical career. Assert verified marker exists, no migration error, and selected progress survives. No reset, direct DIST.set(), teleport, runtime storage rewrite or new order/debug completion.

## Before-menu and normal UI evidence

`DIST.cur()` reads stored district clamped to opened-1. During city construction game calls `buildDistrictPizzerias(); usePizzeria(DIST.cur())`, BEFORE late pots/cleanContours. `usePizzeria` can fall back to PIZZERIAS[0], so assert all of:

- initial cur===target, opened===8, city===false, partySeen===true;
- PIZZERIAS[target] nonnull, PZ_CUR===PIZZERIAS[target], pizzeria index===target, and record actual coordinates;
- these conditions hold before ordinary Go/menu choice and before affected builders; fingerprint record must report the actual target district;
- ordinary descriptor provider=edl-owned-fnv1a-mulberry32-v1, ordinaryAtImport=true, hookOwned=true, baseSeed=0x5EED; host seed===null. Omit --seed entirely. Normal EDL-owned __lateSeed is expected, not an external override.

This order matters: pots avoids the current pizzeria; changing district AFTER menu/build cannot prove that earlier geometry used the desired pizzeria.

Existing `tools/probe-checks/startup-ready.js` already accepts startupdistrict=3/7 as an expected value and performs ordinary Go -> visible selected `.dp-card[data-key="target"] .dp-go` -> one normal click -> actual drive/control. It verifies district/pizzaIndex/physical district, and requires pickerClicks for positive targets. The query is an assertion, not a progress setter. Use this existing admission if a separate UI pilot is authorized.

Existing `land-package-export.js` eval deliberately stays in the menu and only waits for ready/failed; it DOES NOT exercise the picker. Thus two current export-eval runs cannot also claim picker acceptance. Options: authorize a preceding existing generated startup-ready admission, or explicitly extend export acceptance to record pre-menu/pizzeria and then run the same normal UI flow after capture. Do not silently add another game process or claim it already happened. Host ordinary export forbids external --init-script, so do not append bootstrap observer through that forbidden route; marker ordering can be observed in a separate admitted generated pilot or a separately authorized bounded host diagnostic.

## Two targeted exports, once source/preconditions are authorized

Use the same new immutable common build/receipt, normal Steam adult career, stored high Deck, CPU3 + bootcpu, mute, separate cold process/session and external outputs; saved cases WITHOUT --fresh, so effective nointro. Existing fixture and host export options only; no new CLI/tool, seed override, external init, slowboot/nolate or rearranged career.

1. Near descriptor target 3; existing query family gfx=high&gfxdev=deck&mute&startupdistrict=3 plus landexport17b; ordinary export host/eval.
2. Far descriptor target 7; exactly the same family with startupdistrict=7 plus landexport17b.

Execute sequentially, stop on first unexpected failure, preserve raw/run/receipt/metadata/argv/status/signal. Existing source/build verification and bounded transport remain strict. Each export already performs byte-exact capture/encode/decode/restore/re-encode plus repeat restore in an independent data target. That is its own round-trip repeat, NOT an independently generated second city. If “own repeat” means independent generation reproducibility, it requires two runs PER target (four total), explicitly authorized, not silently counted as two.

Compare each target's actual precleanHash, complete identity/actual9 params, rawBytes/rawSHA, wire bytes/SHA, sampled heights/sideHeights/domain/parts/boundaries, repeated restore, cleanCalls=1/RNGclean=0, preactivation/deferred/freshness, runtime/PIZZA evidence and errors. Never infer preclean equality from district label or old seed7 files. Same new-source preclean/identity and raw bytes can naturally share one catalog payload; different preclean needs separate exact entries even if some data happens to match. Different raw payloads require measured package/runtime cost (potentially hundreds of MB combined), not a wildcard district hit. Comparing old-source0 data to new-source3/7 may be diagnostic only; exact source-compatible district0 evidence needs a same-build0 export too, separately approved.

Decision after facts: retain misses, or explicitly extend only demonstrated district/progress closure. Two mature fixtures do not establish all seasons/donations/careers/query combinations and do not justify auto-enabling all districts. No startup speed claim follows from this plan.
