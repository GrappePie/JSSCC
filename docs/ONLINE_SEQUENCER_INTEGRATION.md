# Online Sequencer: scope of this first integration

Date: 2026-09-08. Product JSSCC — PCM Edition 0.1.0. No official partnership has been requested or established.

## Confirmed observations

A bounded, unauthenticated network probe on the user's GitHub runner requested the public sequence catalog, a sequence page and the sequence-data endpoint used by Online Sequencer's own SequencePlayer project. All returned HTTP 200, but none of these replies contained `Access-Control-Allow-Origin` for the request's `Origin: https://grappepie.github.io`. Success from Python is **not** success from cross-origin browser JavaScript.

Evidence: `ONLINE_SEQUENCER_HEADERS_20260908.json`; run https://github.com/GrappePie/JSSCC/actions/runs/34277835715 . The data URL is visible in the official source at https://github.com/onlinesequencer/SequencePlayer/blob/main/src/main/java/net/onlinesequencer/player/util/PlayerEngine.java . This is not evidence of a documented stable third-party catalog API or of unrestricted music redistribution rights. The original sequence page exposes Export MIDI. The data endpoint serves binary sequence data, not a Standard MIDI File; a future importer cannot merely rename it to `.mid`.

No automated catalog polling or proxy is deployed. The probe workflow is a manually repeatable diagnostic, not a data-refresh service. Full third-party HTML/scripts, sequence data and session headers are not committed.

## Working functionality

- A native dialog/drawer, horizontally scrollable song cards, keyboard navigation and reduced-motion support, using the current JSSCC palette.
- Six real title/author/URL references from a single catalog response, explicitly labeled a dated selection, never Newest/Popular/live. No play counts or freshness claims.
- Strict Online Sequencer link/ID validation; canonical HTTPS URLs; no arbitrary remote fetch URL.
- Official-page links open safely in a new tab. No iframe, third-party JavaScript or login form.
- The user exports MIDI in the original site and chooses it on a card. The existing JSSCC file parser and audio engine play the actual local MIDI. The association is user-supplied and not independently verified; the original filename remains visible.
- User-added link metadata is localStorage-only, bounded to 40 entries. MIDI files are memory-only, bounded to 32 MiB total and 16 MiB each. Bad input leaves existing playback intact. Reloading discards associated MIDI files.
- Optional remote thumbnails load only after explicit opt-in; without it opening the library makes no request to Online Sequencer. Placeholder OS labels are not counterfeit song previews or an official logo.

## Not implemented / next agreement

A live server-side catalog, URL-to-MIDI automatic import, official logo license, and a collaboration are not included. A possible agreement should cover an official list/sequence endpoint, allowed origin or approved server adapter, rate limits and caching, metadata/thumbnail attribution and takedown, downloadable/public-only sequences, and music permissions. The desired future flow is card → authorized note/MIDI retrieval → validated conversion → existing PCM engine, with a link to the author and original preserved.

No paid hosting service, new account or external message was created. See the unsent discussion draft in `ONLINE_SEQUENCER_OUTREACH_DRAFT.md`.

## Audio invariants

No synthesis, parser, Worklet, bridge, meter or transport module is changed by this feature. The edition layer replaces only the clickable repository-link callback when the inherited UI is ready; the historical TypeScript and browser build remain unchanged. Visible notices retain upstream copyright. Product version does not replace diagnostic engine/UI versions.

Sources: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS ; https://onlinesequencer.net/sequences ; https://onlinesequencer.net/privacy ; https://onlinesequencer.net/1536400 .
