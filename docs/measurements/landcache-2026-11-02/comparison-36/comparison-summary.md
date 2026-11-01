# Same-build generated/cache A/B

Steam high, Deck1280x800 emulation, renderer CPU3; not physical Steam Deck; OS/driver caches uncontrolled

36 / 36 PASS. Each cell: median [min–max] in seconds, n=3. No retries. Memory not measured.

| Case | Process cache | Variant | Navigation → control | Process → control | Click → control |
|---|---|---|---|---|---|
| newbie | cold | generated | 80.998 [78.608–81.239] | 81.253 [78.853–81.495] | 71.132 [69.413–71.305] |
| newbie | cold | cache | 65.037 [64.831–65.247] | 65.290 [65.079–65.496] | 55.232 [55.130–55.459] |
| newbie | warm | generated | 80.593 [80.184–81.180] | 80.793 [80.386–81.384] | 70.800 [70.341–71.311] |
| newbie | warm | cache | 65.168 [65.062–65.227] | 65.378 [65.261–65.429] | 55.277 [55.169–55.394] |
| saved-near | cold | generated | 81.311 [81.251–81.477] | 81.554 [81.508–81.732] | 71.418 [71.386–71.610] |
| saved-near | cold | cache | 65.720 [65.446–65.780] | 65.976 [65.700–66.033] | 55.815 [55.511–55.878] |
| saved-near | warm | generated | 81.044 [80.936–81.455] | 81.246 [81.138–81.658] | 71.225 [71.102–71.559] |
| saved-near | warm | cache | 65.381 [65.318–65.392] | 65.583 [65.519–65.593] | 55.447 [55.377–55.448] |
| saved-far | cold | generated | 71.907 [71.618–72.202] | 72.163 [71.871–72.442] | 61.998 [61.865–62.261] |
| saved-far | cold | cache | 55.905 [55.893–56.364] | 56.155 [56.141–56.621] | 46.054 [45.965–46.585] |
| saved-far | warm | generated | 71.864 [71.749–71.889] | 72.064 [71.949–72.092] | 61.987 [61.987–62.065] |
| saved-far | warm | cache | 55.874 [55.853–56.214] | 56.074 [56.054–56.415] | 46.065 [46.051–46.354] |

Synchronous main JS elapsed stages below use exclusiveWorkMs only, same n=3 median [min–max], seconds. Shared validation includes decode and restore validation.

| Case | Phase | Variant | Main JS elapsed | Clean | Preclean | Decode excl. validation | Validation | Restore prepare | Commit | Near surface |
|---|---|---|---|---|---|---|---|---|---|---|
| newbie | cold | generated | 71.870 [70.051–72.004] | 20.251 [20.104–20.270] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 16.074 [15.930–16.140] |
| newbie | cold | cache | 57.737 [57.504–57.847] | 0.000 [0.000–0.000] | 1.846 [1.831–1.943] | 1.529 [1.524–1.549] | 2.018 [2.018–2.025] | 0.761 [0.750–0.779] | 0.000 [0.000–0.000] | 16.043 [16.014–16.182] |
| newbie | warm | generated | 71.531 [71.149–72.104] | 20.236 [19.836–20.528] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 16.120 [15.902–16.178] |
| newbie | warm | cache | 57.859 [57.755–58.048] | 0.000 [0.000–0.000] | 1.876 [1.865–1.914] | 1.575 [1.482–1.576] | 2.007 [2.003–2.012] | 0.760 [0.755–0.778] | 0.001 [0.000–0.001] | 16.143 [16.015–16.209] |
| saved-near | cold | generated | 71.879 [71.860–72.258] | 20.238 [20.232–20.499] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 16.159 [16.129–16.184] |
| saved-near | cold | cache | 58.023 [57.907–58.286] | 0.000 [0.000–0.000] | 1.861 [1.846–1.869] | 1.555 [1.546–1.599] | 2.010 [1.999–2.035] | 0.753 [0.746–0.769] | 0.000 [0.000–0.001] | 16.214 [16.074–16.259] |
| saved-near | warm | generated | 71.802 [71.705–72.189] | 20.193 [20.154–20.264] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 16.049 [16.031–16.247] |
| saved-near | warm | cache | 57.992 [57.846–58.112] | 0.000 [0.000–0.000] | 1.851 [1.830–1.854] | 1.546 [1.545–1.556] | 2.007 [1.989–2.011] | 0.761 [0.743–0.769] | 0.000 [0.000–0.000] | 16.194 [16.158–16.243] |
| saved-far | cold | generated | 59.351 [59.119–59.504] | 20.358 [20.234–20.379] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 3.497 [3.468–3.535] |
| saved-far | cold | cache | 45.210 [45.141–45.489] | 0.000 [0.000–0.000] | 1.854 [1.851–1.884] | 1.558 [1.544–1.560] | 2.023 [1.992–2.035] | 0.761 [0.758–0.768] | 0.000 [0.000–0.001] | 3.572 [3.504–3.600] |
| saved-far | warm | generated | 59.152 [59.021–59.477] | 20.276 [20.186–20.561] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] | 3.453 [3.443–3.481] |
| saved-far | warm | cache | 45.372 [45.270–45.519] | 0.000 [0.000–0.000] | 1.862 [1.856–1.904] | 1.555 [1.498–1.584] | 2.024 [2.011–2.025] | 0.760 [0.752–0.766] | 0.000 [0.000–0.000] | 3.560 [3.499–3.572] |

These inclusive/window values overlap the exclusive stages above and each other; they are NOT added. No exact full-cache wall interval is available from start/end marks. The whole path is already included in navigation → control.

| Case | Phase | Variant | late.raisedland inclusive main JS elapsed | Cache I/O window | Native digest window |
|---|---|---|---|---|---|
| newbie | cold | generated | 22.249 [22.124–22.272] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| newbie | cold | cache | 8.323 [8.266–8.414] | 0.385 [0.372–0.390] | 0.109 [0.107–0.112] |
| newbie | warm | generated | 22.188 [21.806–22.517] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| newbie | warm | cache | 8.329 [8.255–8.450] | 0.294 [0.267–0.374] | 0.114 [0.113–0.114] |
| saved-near | cold | generated | 22.247 [22.216–22.479] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| saved-near | cold | cache | 8.339 [8.278–8.376] | 0.374 [0.287–0.403] | 0.107 [0.106–0.116] |
| saved-near | warm | generated | 22.241 [22.235–22.282] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| saved-near | warm | cache | 8.288 [8.242–8.318] | 0.296 [0.295–0.375] | 0.111 [0.110–0.115] |
| saved-far | cold | generated | 22.365 [22.233–22.373] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| saved-far | cold | cache | 8.330 [8.276–8.423] | 0.364 [0.268–0.377] | 0.108 [0.107–0.111] |
| saved-far | warm | generated | 22.246 [22.146–22.547] | 0.000 [0.000–0.000] | 0.000 [0.000–0.000] |
| saved-far | warm | cache | 8.378 [8.305–8.520] | 0.262 [0.254–0.302] | 0.111 [0.108–0.112] |

More stages, raw values, cache wait unions and maximum trace work steps are in comparison-summary.json. Wait windows overlap; do not add their totals. Process latency includes child launch to control; the one full source/build preflight is outside these measured processes. Navigation and click are different origins. Current harness and exact applied patch are separately pinned in manifest.json.

Frozen input fingerprint: `fdb6923c13afc8f369b8c02931174fb953706d52fb5d3f347683dab0f2f6fcce` (not a Git commit). Immutable build hash: `382750aa2e2bf4cbfc5943c08b05c1b333f65ac419668c6f5c0d3917ba17760a`. Runtime protocol 2, bootstrap guard 2, comparison manifest 3, comparison config 1. Exact gate/harness/applied-patch hashes are pinned in gates.json and manifest.json.

Old18 is diagnostic only and excluded from these paired results. Sub-millisecond commit values may round to 0.000 seconds in the table; comparison-summary.json retains measured fractional milliseconds. Main JS elapsed measures synchronous wall elapsed, not OS CPU time. No memory conclusion or exact full-cache wall time is inferred from sums of stages.
