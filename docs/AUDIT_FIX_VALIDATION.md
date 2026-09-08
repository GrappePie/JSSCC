# JSSCC audit repair — audit-fix-20260908.1

**Functional repairs, not a declaration of GXSCC equivalence.** This change replaces the broken runtime paths and makes functional/audio checks reproducible. No original GXSCC WAV has been rendered or compared in this repair. There is no measured fidelity percentage.

## Repairs

- Rebuild the malformed runtime data adapter from the supplied, byte-verified JSON. Fix the additional closing brace, inconsistent bank lengths (126/129 instead of 128), extra envelope record and mismatched final envelope entries. Runtime data now has 33 waves, eight banks of 128 entries and 128 envelope records; no runtime dependency on the old malformed raw adapter.
- Use explicit scoped MIDI variables and bounded chunk reads. Reject truncation, zero timing, invalid data and format 2 rather than mixing independent sequences. Preserve same-tick event order and fix the SysEx payload offset. Support synchronous formats 0/1, SMPTE timing and two MIDI ports. SysEx is retained with a warning, not synthesized.
- Pause owns its playback state and suspends the audio context, preserving nonzero position, ongoing notes and queued events. Resume continues; arbitrary pointer clicks no longer resume audio. Stop cancels scheduled and releasing nodes.
- Use channel buses for CC7 volume, CC11 expression, CC10 pan and mute, including already sounding notes. Reset releases sustained notes. Program changes preserve existing voice timbres. Multiple overlapping Note Ons are not all stopped by one Note Off.
- Fix the Fourier sine-coefficient sign and Nyquist scaling; test reconstruction of DC-removed source samples. This mathematical test does not validate the original mixer's resampling or waveform generation.
- Count release tails until their scheduled end. The chosen oldest-voice policy is explicit and NOT verified against the original allocator.
- Remove the invented parity-based Program 50 drum mapping. All drum timbres and its special program behavior remain unverified approximations.
- Remove inherited fake sine-wave channel activity. Meters now reflect active voice/velocity/controller state (not calibrated hardware VU).
- Add real WAV export through the SAME Synth implementation used for playback, including the existing canvas Export button. PCM16, stereo, 44100 Hz; default 8-second tail, no automatic normalization. Hard clipping remains possible with unusually loud/dense material; output level is adjustable.

## Evidence and reproduction

The automated workflow `.github/workflows/audio-regression.yml` runs the required Node suite, full HTTP-site Chromium checks, corpus generator and WAV comparator self-test. Its artifact contains the exact tested source, commit SHA, JSON/log results, a browser screenshot, synthetic web WAVs and 184 original synthetic MIDI probes. The original EXE and original-reference audio are NOT included.

```sh
node --test tests/regressions.cjs
python -m pip install playwright==1.55.0 numpy==2.2.6
python -m playwright install --with-deps chromium
python tests/browser_regressions.py test-results
node tools/generate_corpus.cjs test-results/corpus
python tools/compare_wavs.py --self-test
```

The Node suite has 39 checks. Its audio-node mocks test scheduling/state, not PCM. Chromium uses actual AudioContext and OfflineAudioContext for PCM checks and the real original canvas. It tests picker/drop, native and original canvas transport, export, CC7/11/10, mute, no console exceptions, and rendering all 128 programs through all eight banks (1,024 combinations). These are functional checks, NOT original-vs-web comparisons.

A local run also supports `--embedded` when the host environment prohibits browser HTTP navigation. That mode substitutes only asset delivery and an empty cookie store; audio and application logic remain real. CI runs the normal HTTP mode, without those substitutions. Refer to the run's actual result instead of assuming success merely because the workflow exists.

### Data provenance

Original EXE SHA-256:
`1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`

SHA-256 of `JSON.stringify(GXSCC_EXACT_DATA)` after regeneration, independently checked against the supplied JSON:
`0d751ab90311fee90c9cb9c613c6159e9c4d08d8d554cfa270a5e6e750be7766`

Regenerate with:
```sh
python tools/regenerate_data.py gxscc_b236_exact_tables.json js/gxscc-exact-data.js
```
The earlier binary audit checked 33 waveform records at file offset `0x51158`, eight contiguous 128-DWORD maps at `0x53dac`, and 128 five-DWORD envelope records at `0x551b0`. This verifies numbers, not their complete interpretation. 44100 Hz remains an assumed envelope reference, explicitly marked in the runtime.

## Original-vs-web comparison protocol — pending

1. Generate the 184-probe MIDI corpus. Start with `gm-000.mid`, `gm-016.mid` and `drum-038.mid`. These are isolated synthetic notes, not songs.
2. Render each probe in the supplied GXSCC B236E with SCC like Full-Set. Record all preferences: sample rate, mono/stereo, filter, master level and other processing. Export uncompressed PCM16 WAV at 44100 Hz, stereo. Do not silently normalize its output.
3. Load the same MIDI in this page, use the same bank, set web output level to 0.12, and Export WAV. Keep each output labeled `original` or `web`. The web's master scale is not known to match the original's scale.
4. Compare each pair:
```sh
python tools/compare_wavs.py original.wav web.wav --output comparison.json
python tools/compare_wavs.py original.wav web.wav --align-onset --output comparison-aligned.json
```
5. Read both raw and optional onset-aligned results. The tool reports durations, untouched amplitude/RMS, sample RMSE, maximum error, a bounded-window spectral difference and any uncompared tails. It requires matching sample rates/channels, with no hidden resampling/downmixing. Its first-threshold onset alignment can be misleading for noise and very slow attacks; it is not sample-perfect synchronization or a perceptual score.

No GXSCC-reference pairs currently exist in this evidence. Comparator self-tests use synthetic equal and half-amplitude signals only. A pass there validates the comparison utility, not GXSCC compatibility.

## Remaining limitations

Percussion frequencies/noise/envelopes, the fifth envelope field, envelope curve/units, mixer/filter/velocity scaling, voice-stealing policy and special drum Program 50 are not proven equivalent. SysEx and aftertouch are not synthesized. Seeking reconstructs held/key-down melodic notes and controllers but restarts oscillator phase and does not reconstruct already-releasing or percussion tails. Only Chromium is tested in this change. Export is limited to 15 minutes including its tail to bound memory. The application is explicitly labeled experimental until paired original audio and wider behavior checks support stronger claims.
