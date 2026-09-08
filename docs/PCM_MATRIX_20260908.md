# B236E PCM kernel and full-bank reference matrix

Version: `pcm-research-20260908.3`. Date: 2026-09-08.
Base published commit: `2d7671f25c0b1db1fec3b101feb02f5a60c9b71a`.

**This is an independently written, experimentally validated partial emulator. It is not a complete bit-identical replacement for GXSCC.** Prefix equality below is deliberately not presented as a whole-song or perceptual fidelity percentage.

## Provenance and scope

The unchanged GXSCC B236E executable was run on native Windows through its Authoring UI. Only the executable with SHA256 `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a` was accepted. The executable was downloaded temporarily from Gashisoft, hash-checked before execution, and excluded from all commits and delivered evidence. The supplied original was also disassembled locally using objdump; no synthesis code from the EXE is executed by the web player.

Successful native matrix run: https://github.com/GrappePie/JSSCC/actions/runs/34249333054
Research commit: `daca1141fe6334ace82621169229355093bb2644`.
Artifact: `10065505132`, `b236e-full-matrix`.
Archive SHA256: `dd6ecad8da1998d980bf5795eaa30dda4d6a2e30297adf990a670f88bd2bc25e`.

The first matrix startup attempt failed before rendering and is not counted as evidence. The successful run exports 12 WAVs, with exact input MIDIs, settings screenshots/control enumeration, saved preferences, manifests and output hashes. Settings are 44100 Hz, stereo, no low-pass filter, no auto-detune, GASHISOFT PSG Drum. Each bank selection is read back from the original UI. No automatic normalization, channel downmix or resampling is used in comparisons.

The corpus has 1,358 cases:

| Corpus | Cases |
|---|---:|
| 128 programs in each of eight original banks | 1,024 |
| Five programs, three pitches, three velocities | 45 |
| Static pan/volume/expression and nine chord sizes | 26 |
| Live controllers, bend, Hold1, mode/master SysEx and drum PC50 | 22 |
| One short note per second over four minutes | 241 |

All inputs specify 120 BPM and 480 ticks/quarter. Matrix generation and the hash-checked native UI driver remain on `research/gxscc-original-reference` in `tools/original_matrix_20260908.py`, `tools/run_original_matrix.py`, and `tools/original_reference_probe.py`.

## Recovered processing, not per-instrument volume patches

The new pure-JavaScript kernel calculates stereo PCM directly. Unlike the previous engine, it does not ask PeriodicWave to reconstruct melodic timbres and does not discard the table mean.

- At `0x401cff..0x401dd3`, the oscillator integrates a piecewise-constant table on 32 cells, with 1024 phase subdivisions per cell. Signed integer division truncates toward zero. Table samples are signed bytes multiplied by their original waveform gain.
- Native pitch calculations use the float32 base C4 value `261.6300048828125`, the recovered semitone constants, float32 periods/cycle boundaries, and linear interpolation between semitones for cents. The second waveform DWORD is an octave displacement: waveform15 has -1, not a generic unused flag.
- The envelope stages run as integer accumulators on `65535 << 14`, including integer division of stage increments and normal/alternate key-off.
- Mixer operations at `0x401dbe..0x401f9e` use separate integer right shifts, linear left/right weights, division by3, MIDI master volume, then clipping to [-32767,32767]. A centred pan has weights63 and64. No corrective gain was fitted separately to violin or overdrive guitar.

The user output slider is retained. Its default0.25 maps to unity relative to the integer kernel; playback and export use the same mapping. Raising it can exceed the native-clipped level, so users should start at the default or lower. Export is always PCM16 stereo44100Hz. If hardware cannot run an AudioContext at44100Hz, only the final output is linearly resampled; sample-identical claims do not apply to that hardware output path.

## Results: what actually matches

### All banks

All1,024 program/bank cases were rendered in both implementations. **992 aligned prefixes are identical in both PCM16 channels.** These are124 programs perbank. Each prefix begins at the first stereo sample whose absolute value exceeds3 PCM units and contains at most10,000 frames (about226.8ms). Program118 stops earlier, so its shorter bank-specific prefix length is recorded. Programs122,123,126,127 depend on noise or additional internal state and are excluded from exact-equality assertions, not from the native corpus or results.

Golden SHA256 values in `tests/pcm-reference-fixtures.json` were calculated from the original WAVs, not from the new kernel. Each of eight tests concatenates the124 original-defined prefix ranges and checks the aggregate digest. The full per-case measurements remain in the evidence package.

### Violin, guitar and control timbres

All45 additional pitch/velocity cases have identical aligned10,000-frame prefixes and equal peak levels. They cover programs0,16,24,29,40; notes48,60,72; velocities32,100,127. The previous +4.557dB violin and +1.851dB overdrive peak discrepancies therefore do not persist in these measured cases. This does not prove every pitch, velocity, release, controller history or song.

### Chords and initial state

With the reproducible kernel default stagger state0, the1-,2- and4-voice chord prefixes match, while six denser chord cases do not. The original preserves a small global onset stagger between notes. Its initial state in the mixer-reference export can be inferred as240 from the first isolated note, before examining chord waveforms.

Using **that one shared initial-state value**, then replaying the same entire input, makes all nine10,000-frame chord prefixes identical:1,2,4,8,32,45,46,47,64 requested voices. Individual chord gain, phase or voice parameters were not fitted. Prefix start alignment is still applied. This is a state-conditioned result; the player default remains state0 and does not claim to know the original application's playback history. The result supports the inspected45-slot path that refuses overflow, but does not settle every allocation/reclamation route or the README's46-voice description.

### Clock

Addresses `0x40c9f0..0x40ca4c` and `0x40d598..0x40d5f5` select an integer MIDI-tick batch. The batch loop at `0x40d02c` advances several ticks per sample-count interval. The implemented rule is:

1. Convert tempo to integer BPM.
2. Choose the smallest integer q for which `floor(q * 44100 * 60 / (BPM * PPQ)) >= 100`.
3. Advance q MIDI ticks each such truncated frame interval, without carrying fractional frames forward.

At120BPM/480PPQ, q=3 and interval=137frames. This is derived from the code, not a fitted playback-speed correction. The original's default when tempo is absent is180BPM in the inspected route; the generic parser/legacy engine keeps the standard120BPM default. SMPTE timing uses the ordinary parser time path.

The four-minute probe contains241 detected onsets in each output. First-to-last onset spacing is **10,521,720 frames in both**, versus10,584,000 for ideal standard timing. Individual new-minus-original onset differences remain19 or-241frames due to initial/stagger state; the final difference is19frames (0.431ms). The cumulative clock-rate discrepancy is removed for this fixed-tempo case, not every event's absolute start. Dynamic tempo transitions, unusual PPQ, and mixed-track boundary cases need more native tests.

## MIDI and percussion compatibility changes

The PCM mode follows the inspected native routes, which can differ from generic MIDI behavior and from the retained legacy engine:

| Behavior | PCM mode |
|---|---|
| CC7 volume | Captured by new Note On; existing voice amplitude is not changed by CC7 alone. |
| CC11 expression and CC10 pan | Updated on owned active voices at cycle boundaries. |
| Pitch bend | Integer cents and native interpolation; RPN sensitivity0..24. |
| Hold1 | Selects the inspected finite25000-frame key-off decay, not an infinite pedal latch. |
| Repeated same-pitch notes | Matching owned voices release together in the inspected Note Off path. |
| Drum PC50 | Pitch below60 selects kick; pitch60 and above selects snare. No parity rule. |
| GM/GS messages | Recognized mode routes and Roland master volume; unsupported SysEx is warned. |
| Saturation | Native signed integer summation/clipping; a deliberate coherent45-note stress probe clips without NaNs. |

The native control probe's Roland master-volume message has an invalid checksum. The original nevertheless applies it. PCM mode similarly accepts it with a visible diagnostic warning; this is documented compatibility behavior, not a recommendation for authoring malformed MIDI. Mode messages do not invent a blanket voice/state reset absent from the inspected path.

Noise now uses an independently implemented MT generator with the older split-word69069 initializer, shared within the kernel, instead of the previous independent xorshift approximation. The original runtime seed and earlier random consumption remain unknown. Consequently percussion noise is not PCM-identical. The six tested PC50 kick-note cases match their aligned kick PCM, while the three tested snare-note cases retain noise and component-start differences.

## Browser architecture and regression requirements

`js/pcm-core.js` is pure logic usable in Node and the browser. `js/pcm-worklet.js` runs it on the audio rendering thread. `js/pcm-bridge.js` handles transport, asynchronous bounded replay for seek, state snapshots, and WAV export. The original UI, file picker, drag/drop and controls are retained; the user can switch back to `Anterior · Web Audio`.

Pause and resume preserve kernel state. Seeking rebuilds that state, including phase, controller history, release tails and RNG; long seeks replay in small asynchronous chunks instead of discarding all sounding notes. Playback at44100Hz and export are required to match the same kernel PCM, tested using a real OfflineAudioContext with an actual AudioWorkletNode, not a mocked processor.

Run:

```sh
node --test tests/regressions.cjs
node --test tests/pcm-regressions.cjs tests/pcm-polyphony.cjs
python tests/browser_regressions.py test-results
python tests/reference_audio_regressions.py test-results
python tests/pcm_browser.py test-results
```

Local Chromium HTTP navigation is blocked in the analysis environment. The legacy browser suite was run locally with its documented embedded-asset mode. The new Worklet suite is run on the actual HTTP site in GitHub Actions. Its completed run, counts and exact tested-source verification are recorded on the pull request before merge. A test definition is not itself evidence of a passing run.

## Remaining gaps

The32 program/bank cases involving GM122/123/126/127 do not have exact validated prefixes. Native random/stagger startup state is not reconstructed from arbitrary program history. Full release tails and absolute event onset can still differ. Some control updates and multi-tempo boundaries need more native tests. Drum PC48 has an additional undecoded route; other SysEx, original filters, detune/effects and all MIDI features are not implemented. CC120 is a safety hard-stop extension whose native support has not been established.

The kernel is fixed at44100Hz; dense real-song performance across browsers/devices, long-play memory behavior and perceptual equivalence have not been exhaustively validated. PCM export is bounded to10minutes to limit memory use. Current seek restores using the selected bank, not a historical log of user bank-selector changes. No whole-file PCM identity or general percentage of fidelity is claimed.
