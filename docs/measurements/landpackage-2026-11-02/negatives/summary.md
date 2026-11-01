# Ordinary package negative acceptance

adult Steam / high / Deck1280x800 emulation / CPU3, ordinary EDL no probe seed

4 / 4 PASS, one attempt each; no retries. Errors / uncaught / partial cache publication / late cache publication: zero.

| Case | Reason | Clean / activate / align | W metres | Asset reads |
|---|---|---|---|---|
| missing-asset | land-package-reader:READ_HTTP_404 | 1 / 1 / 1 | 4.914 | 1 |
| wrong-wire-sha | land-package-reader:FILE_HASH_MISMATCH | 1 / 1 / 1 | 4.555 | 1 |
| cancel-preparing | land-package-reader:ACCEPTANCE_CANCEL_PREPARING | 1 / 1 / 1 | 4.784 | 1 |
| input-miss | input-miss | 1 / 1 / 1 | 4.774 | 0 |

Cancellation reached preparing after real decode. Baseline prepared model/packed/grid references stayed unchanged; before and immediately after cancel: built/supportReady/maskReady false, mask cells/triangles/published/commit0. Cleaned true / bufferHeld false before generated fallback. Full evidence is in summary.json and cancel-preparing/raw.json.

Each run.json retains exact actual argv, init/eval/fixture/probe hashes, status/signal, first raw SHA and stdout/stderr SHA. The common stock startup-ready Go/tutorial/W/bootstrap path was reused unchanged; fault injection only touched the exact land fetch or called cancel in preparing. Missing response was synthetic, so no browser404 filtering was needed.

This is a functional negative acceptance, not a timing/memory comparison. Source fingerprint 0fd44d87acaaefeef93da4ac376070cd5a22474af7c4ffbf7c75e557704ec07e is not a Git commit. Original build and runtime were not modified.
