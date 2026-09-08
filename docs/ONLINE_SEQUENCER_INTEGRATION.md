# One-click Online Sequencer playback — PCM Edition 0.2.0

## Actual architecture

A card's primary button obtains one public sequence by numerical ID, through the owner's JSSCC Sequence Bridge hosted separately on Lovable. The UI remains on GitHub Pages. A dedicated browser Worker independently decodes protobuf and writes Standard MIDI. An in-memory File is passed to the existing MIDI parser and selected synthesizer, then playback starts. No file dialog, download link, disk save, MP3 stream, iframe player, third-party executable code or music samples are used in this path.

Backend endpoint: `https://jsscc-sequence-bridge.lovable.app/api/public/sequence-bridge`
Hosting project: `9344e140-d83e-417e-ac98-7e37f6d689ea` (owner's Lovable workspace).
Backend source: `src/routes/api/public/sequence-bridge.ts`, commit `1bd4bf5cf9fdbbd328226046689f389cd6d87ee1` in that project. It is a TanStack Start server route, not a database-backed function. No database, paid API, upgrade or new subscription was provisioned. Included plan resources have limits; the owner controls hosting and availability.

The fixed upstream path is `https://onlinesequencer.net/app/api/get_proto.php?id=<integer>`, also used in Online Sequencer's own SequencePlayer project. This is an interoperability use of public sequence data, not a stable API contract or official partnership. It does not grant redistribution rights to songs. The historical CORS probe remains documented separately: the service solves cross-origin transport; renaming a Blob does not solve format conversion.

## Network and safeguards

Only GET/OPTIONS, positive IDs of at most nine digits, no arbitrary URL, credentials or upstream cookies. Reject non-200, redirects and HTML; no retry of access errors or CAPTCHA. Bridge origin allowlist: GitHub Pages plus local HTTP development; requests without Origin can be made by non-browser clients. CORS is not authentication. Limits: 12-second upstream timeout, 4MiB payload, eight concurrent upstream jobs, 20 requests/minute per hashed IP, 32-entry/16MiB/5-minute memory cache. These limits are per running server instance, not global guarantees. Infrastructure providers may retain their normal network logs; the application does not log song bodies.

The browser adds a 22-second total request timeout, checks the sequence ID header/content type/actual byte count, and limits worker conversion to 15 seconds. Memory cache: up to eight converted sequences, 32MiB, five minutes; cleared by page reload. Cancellation and player controls invalidate pending UI requests. A late response cannot automatically replace a manually selected song. The previous playable MIDI is retained on download/decoding failure. Manual MIDI import remains independent and explicitly labeled.

## Conversion scope

Own bounded protobuf reader and MIDI writer, no copied Online Sequencer player implementation. Protocol field facts from the organization's SequenceProto.java and NoteTypeProto.java. C0 is enum 0; sixteenth positions map to quarter-note MIDI time with PPQ960. Melodic program and percussion correspondences follow the publicly served MIDI-export conventions checked on 2026-09-08. Cloned instruments preserve separate channel state up to 30 melodic tracks plus two independent drum kits. When there are more than two kits they are combined on a drum channel, centering pan and applying volume at each hit; this is explicitly reported, not claimed lossless.

Tempo, volume, expression and pan become MIDI events. Blended transitions are sampled every 1/16 quarter pulse. Detuning is rounded to semitones at Note On, not rendered as a continuous glide. Custom synth envelopes/effects/layers are not retained and produce warnings. Limits: 100000 input notes, 12000 markers, 300000 MIDI events, 4MiB sequence, 16MiB converted MIDI, 10 minutes. Very short or zero-velocity notes may be omitted; out-of-range notes and clipped velocity are reported. These conversions deliberately reinterpret the piece as chiptune; exact Online Sequencer sound equivalence is not claimed.

## Preserved behavior

The PCM core, waveform data, audio synthesis algorithms, Worklet and meters are unchanged. A small integration hook authorizes the native AudioContext from the initial user click before asynchronous fetching, and announces manual transport/file actions for cancellation. An already paused song is not resumed merely while a request is loading. The library's catalog remains a dated selection with safe source/author links, not a live discovery feed.

## Verification

Node checks cover real protobuf fixtures, malformed/truncated input, tempo, clone channels, percussion, controllers, bounds, cancelled reads and cache expiry. HTTP browser checks use a declared synthetic protobuf response plus the actual Worker/parser/AudioWorklet, verifying no file chooser or download, successful automatic playback, cancel, failure and manual fallback. A separate opt-in live smoke test invokes the real deployed backend and a public Online Sequencer ID with no network response substitution. It saves metrics, not song payloads or converted files. Test success must be established from a completed run; the presence of tests does not assert they passed.

Primary references:
- https://github.com/onlinesequencer/SequencePlayer/blob/main/src/main/java/net/onlinesequencer/player/protos/SequenceProto.java
- https://github.com/onlinesequencer/SequencePlayer/blob/main/src/main/java/net/onlinesequencer/player/protos/NoteTypeProto.java
- https://github.com/onlinesequencer/SequencePlayer/blob/main/src/main/java/net/onlinesequencer/player/util/PlayerEngine.java
- https://onlinesequencer.net/sequences
