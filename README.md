# JSSCC — PCM Edition

**v0.3.0 · Experimental · maintained by GrappePie**

A browser MIDI-to-chiptune player derived from JSSCC, with an independently written experimental integer PCM engine informed by measurements of Gashisoft GXSCC B236E. This is not an official Gashisoft release, nor a claim of complete emulation.

[Open the player](https://grappepie.github.io/JSSCC/) · [Credits and licensing status](https://grappepie.github.io/JSSCC/credits.html)

## Using the player

Drop a `.mid`/`.midi` file or choose **Cargar MIDI**, then press Play. The browser synthesizes the sound locally. Pause, resume, seek, repeat, channel mute, instrument sets and PCM16 stereo WAV export are available. The previous Web Audio engine remains selectable. PCM export is bounded to ten minutes and MIDI input to 16 MiB.

The retro UI has live voice-count colors, envelope/output readings and timing fields. BUFFER WEB reports observed audio-heartbeat continuity, not the original Windows queue occupancy.

## Online Sequencer: catalog + click and play

Press **OS / Online Sequencer** and search by title/author. JSSCC first looks for the optional **OS Browser Bridge** extension. When installed, the extension performs the official catalog search through your normal browser session in an inactive Online Sequencer tab, returns only result metadata, closes the temporary tab, and JSSCC renders the cards in its own palette. Sort controls include Newest, Popular, Most Notes and Longest; date controls include Today, This week, This month and All time.

The extension is optional. Without it, JSSCC retains the bounded server-side catalog attempt and the exact official-search fallback. The extension does not bypass verification pages or anti-bot challenges: if Online Sequencer asks you to verify the browser, open the site normally and complete that check yourself. Install instructions are in [`extensions/os-browser-bridge`](extensions/os-browser-bridge/README.md).

On any card, **Escuchar chiptune** downloads that public sequence into memory through our bounded JSSCC Sequence Bridge, independently converts protobuf to Standard MIDI in a Web Worker, and automatically synthesizes it with the existing PCM player. The primary action never opens a file picker or saves a song download. Importing a local MIDI is a separate secondary option. Cancelling or closing the drawer cancels pending playback. Conversion warnings remain visible beside the source link.

The six bundled cards remain selected links checked on 2026-09-08, not a claim of a mirrored catalog. There is no official partnership or endorsement.

On-demand backend: `https://jsscc-sequence-bridge.lovable.app/api/public/sequence-bridge`. Only numerical Online Sequencer IDs are accepted, never arbitrary URLs. The auxiliary service is hosted in the owner's connected Lovable workspace, using its included resources; hosting has usage limits, not unlimited free availability. There is no account/login requirement in the player. Song bytes are not stored in localStorage, committed to this repository, or placed in downloads; short-lived caches exist in memory. Opening the library alone never requests song data. Remote thumbnails remain opt-in.

Supported conversion: note pitch/time/duration, mapped instruments, two MIDI ports, tempo, basic volume/pan, and sampled transitions. Not all Online Sequencer effects, custom synths, stacked sounds or continuous detuning are retained. Unavailable, malformed, oversized and excessively complex sequences return a visible error instead of a fake success or a silent switch to a file picker.

See [integration architecture, limits and deployment](docs/ONLINE_SEQUENCER_INTEGRATION.md).

## Development and verification

Serve this directory over HTTP (for example `python -m http.server 8000`) and visit localhost. AudioWorklet requires a supported secure context (HTTPS or localhost). Local MIDI playback does not need a backend. Automatic sequence retrieval requires the separately deployed bridge.

```sh
node --test tests/regressions.cjs tests/pcm-regressions.cjs tests/pcm-polyphony.cjs tests/ui-meters.cjs tests/edition-regressions.cjs tests/sequence-regressions.cjs
```

GitHub Actions also exercises the real HTTP player, native Chromium AudioWorklet, WAV exports, actual canvas pixels and the reference-library flow. Test outcomes apply to the cases covered, not to all devices or all music.

Product identity is in `js/edition-info.js`; audio and live-meter diagnostic versions are intentionally independent. The historical TypeScript UI lives in `src/` and its browser build in `js/jsscc.js`; modern PCM/UI modules are standalone JavaScript. Detailed reverse-engineering and validation limits are under `docs/`.

## Provenance and licensing status

Original JSSCC notice: **© 2017 meme.institute + Milkey Mouse**. Repository of provenance: [twilligon/JSSCC](https://github.com/twilligon/JSSCC); historical link: [milkey-mouse/JSSCC](https://github.com/milkey-mouse/JSSCC). The inherited README is retained in [docs/UPSTREAM_README.md](docs/UPSTREAM_README.md).

This edition is maintained by GrappePie, with development assistance from ChatGPT. New work does not erase upstream authorship. GXSCC is by Gashisoft; song rights remain with their respective authors/rights holders.

No explicit general upstream license was identified in its root/README during review. **This edition does not relicense the inherited code or assets and does not grant blanket redistribution rights.** Verify the permissions for each component before reuse/distribution; public code visibility alone is not a license. Consult [credits.html](credits.html) and GitHub's [licensing documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
