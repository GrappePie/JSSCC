# JSSCC — PCM Edition

**v0.1.0 · Experimental · maintained by GrappePie**

A browser MIDI-to-chiptune player derived from JSSCC, with an independently written experimental integer PCM engine informed by measurements of Gashisoft GXSCC B236E. This is not an official Gashisoft release, nor a claim of complete emulation.

[Open the player](https://grappepie.github.io/JSSCC/) · [Credits and licensing status](https://grappepie.github.io/JSSCC/credits.html)

## Using the player

Drop a `.mid`/`.midi` file or choose **Cargar MIDI**, then press Play. The browser synthesizes the sound locally. Pause, resume, seek, repeat, channel mute, instrument sets and PCM16 stereo WAV export are available. The previous Web Audio engine remains selectable. PCM export is bounded to ten minutes and MIDI input to 16 MiB.

The retro UI has live voice-count colors, envelope/output readings and timing fields. BUFFER WEB reports observed audio-heartbeat continuity, not the original Windows queue occupancy.

## Online Sequencer reference library — first stage

The **OS / Online Sequencer** button opens a palette-matched horizontal card library. The bundled entries are selected links checked on 2026-09-08, **not a live feed**. Filter by title/author, add an Online Sequencer URL/ID, open a song on its official page, and associate a locally exported MIDI to play it through PCM Edition. The selected MIDI is kept only in RAM for this session (32 MiB total); only user-added link metadata is saved locally.

Automatic cross-origin catalog/sequence loading is **not implemented**. The catalog and sequence-data responses inspected on 2026-09-08 did not include an Access-Control-Allow-Origin header for this page. We do not use an open proxy, scraped song archive, external credentials or background polling. An approved API/CORS arrangement or agreed server adapter is the next step. There is no official partnership. Remote thumbnails are opt-in. The OS badge is a locally styled label, not their official logo.

See [integration scope and evidence](docs/ONLINE_SEQUENCER_INTEGRATION.md).

## Development and verification

Serve this directory over HTTP (for example `python -m http.server 8000`) and visit localhost. AudioWorklet requires a supported secure context (HTTPS or localhost). No production backend is required for the current functionality.

```sh
node --test tests/regressions.cjs tests/pcm-regressions.cjs tests/pcm-polyphony.cjs tests/ui-meters.cjs tests/edition-regressions.cjs
```

GitHub Actions also exercises the real HTTP player, native Chromium AudioWorklet, WAV exports, actual canvas pixels and the reference-library flow. Test outcomes apply to the cases covered, not to all devices or all music.

Product identity is in `js/edition-info.js`; audio and live-meter diagnostic versions are intentionally independent. The historical TypeScript UI lives in `src/` and its browser build in `js/jsscc.js`; modern PCM/UI modules are standalone JavaScript. Detailed reverse-engineering and validation limits are under `docs/`.

## Provenance and licensing status

Original JSSCC notice: **© 2017 meme.institute + Milkey Mouse**. Repository of provenance: [twilligon/JSSCC](https://github.com/twilligon/JSSCC); historical link: [milkey-mouse/JSSCC](https://github.com/milkey-mouse/JSSCC). The inherited README is retained in [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

This edition is maintained by GrappePie, with development assistance from ChatGPT. New work does not erase upstream authorship. GXSCC is by Gashisoft; song rights remain with their respective authors/rights holders.

No explicit general upstream license was identified in its root/README during review. **This edition does not relicense the inherited code or assets and does not grant blanket redistribution rights.** Verify the permissions for each component before reuse/distribution; public code visibility alone is not a license. Consult [credits.html](credits.html) and GitHub's [licensing documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
