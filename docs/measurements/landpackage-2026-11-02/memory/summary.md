# Ordinary17b memory: one generated/cache pair

Adult Steam, ordinary EDL without seed/init/quality override, saved Deck high1280x800, rendererCPU3, title/menu checkpoint; macOS emulation, not physical Steam Deck. Not a timing series.

Identical49 naturally ready IDs, radius832 plus ready640, same position; same IDs before/after2GC and across variants. Both actual processes and the pure original-raw-text pair gate PASS. No retries.

All values below retain existing helper MB/MiB reporting; distinct/overlapping measures are not summed. These are n1 observations, not a promised exact saving.

| Measure | Generated | Cache |
|---|---:|---:|
| Startup-window macOS footprint peak | 2091 | 1859 |
| Startup-window footprint at end (before GC) | 1735 | 1349 |
| After2GC renderer process working set | 2907 | 2551 |
| After2GC GPU-process working set | 872 | 874 |
| After2GC macOS footprint | 1714 | 1327 |
| After2GC JS heap | 839 | 836.1 |
| After2GC estimated GL total | 505.4 | 504.9 |
| GL buffers | 353.8 | 353.4 |
| GL textures | 115.4 | 115.4 |
| GL renderbuffers | 1 | 1 |
| GL framebuffer estimate | 35.2 | 35.2 |
| JS typed-array backing retained by GL wrappers | 27.8 | 27.4 |

The footprint watch was closed before either forced GC. Generated watch: n=1259, ms=117529, exact=True, sampled peak=2079. Cache: n=1111, ms=102379, exact=True, sampled peak=1843. Poll cadence varies; these windows are not timing-series measurements.

## Whole-process sampled peaks — separate scope

| 200ms sampled working-set peak through GC/metadata | Generated | Cache |
|---|---:|---:|
| Renderer page | 2917 | 2566 |
| GPU process | 888 | 874 |
| Samples n | 625 | 552 |

The generated global GPU888 sample is guaranteed AFTER the startup footprint watch closed (raw clock bounds retained in summary.json). It must not be reported as a GPU startup-window peak or added to the footprint peak. The raw global sampler also remains active during2GC and the later catalog metadata observation. Cache global GPU874 is a different whole-run observation. Exact T0 is not exported; do not invent precise cross-clock peak epochs.

## Scene counts and phase visibility

Geometries: 6504 / 6493; textures: 65 / 65; programs: 228 / 228. The geometry-count difference is disclosed: equal ready IDs are coverage equality, not a claim of byte-exact geometry counts.

Generated missed phase markers: []. Cache: ["inputCopy", "decompressing", "rawCopy"]. 50ms observation can miss short phases; memProc phase points have NO forced GC and are not phase maxima. Full clocks/fields are in summary.json and unchanged raw reports.

Source fingerprint `0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e` is not a Git commit. No payload/build was traversed or re-read by host measurement/summary; only reviewed small eval/gate/fixture/catalog/index/probe/probePage pins were hashed before and after. Actual argv/pid/start/end/status/signals/raw/log SHA are in generated-run.json and cache-run.json; templates remain explicitly unexecuted historical preparation.
