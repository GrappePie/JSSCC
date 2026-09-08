# Panel startup ordering — follow-up to PCM Edition publication

The first post-merge check of PR #13 failed its final no-browser-exceptions assertion. The library's preceding 22 checks passed, but the accumulated page errors were `Cannot read properties of undefined (reading 'addHitRegion')` and `Cannot read properties of undefined (reading 'width')`.

Evidence: run 34280759943, artifact 10077528775, SHA-256 `1d70c80072794056ab7095cceffd552d5cb8bd9570a8a2e9791857eb9abb52ec`. All archived sources were byte-identical to the successful pre-merge run. This failure was not hidden by repeating the same job until green.

## Root cause and minimal fix

The inherited renderer waited for `window.load` to create its canvas and hit detector. Its image/manifest loader could finish first and immediately call `addUIHitRegions` / `addConfigHitRegions`, which use those fields. Fast resource completion exposed an ordering race, not a PCM or Online Sequencer network failure.

The renderer's own asset-complete callback now calls the existing idempotent `initCanvas()` before notifying subsequent asset observers. The original two-event first-paint gate remains intact. The matching TypeScript source and shipped JavaScript are updated together, with a cache key for the browser bundle. No synthesizer, parser, voice, audio clock or library functionality is changed.

## Regression coverage

The Node ordering fixture reproduces the assets-first failure on the prior code; window-first and already-loaded cases passed. After the fix all three orders initialize once and paint once. A source-parity check covers TypeScript and shipped JavaScript. The full local Node run passes 105 tests without failures or skips.

The new HTTP browser test holds one test-only image pending to force assets to finish before window.load, while using the actual production scripts, palettes, images and renderer. It checks both panels and repeated navigations, then releases the image and opens the library. This is deliberately controlled resource timing, not a mocked renderer. Existing audio/export/library tests remain mandatory.

Local browser navigation was blocked by the container; only completed GitHub Actions results establish HTTP/browser success. Consult the finished PR run and its inspected artifact for results. The temporary hash-checked blob preparation workflow is absent from this change's final tree; normal CI still has contents-read permissions only.
