# B236E reference correction: envelopes and standard PSG percussion

Version: `reference-fix-20260908.2`. Date: 2026-09-08.
Base web source: `c15afe7339c908c8996035dcb02f8356696c0052`.
This is a measured compatibility improvement, **not a bit-identical emulator**.

## What the executable actually does

Original SHA-256: `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`.
Disassembly was taken from the supplied, unchanged B236E. No executable is committed.

The program record at file offset `0x551b0 + 20 * program` has five DWORDs:

| Offset | Interpretation in the inspected SCC path |
|---|---|
| +0x00 | Attack duration |
| +0x04 | Decay from maximum to sustain level |
| +0x08 | Sustain level, 0..65535 |
| +0x0c | Further linear decay while the key remains held; zero means constant sustain |
| +0x10 | Normal Note Off release duration, starting at the current envelope level |

The previously named `unknown5` is **not unused**. That earlier claim is superseded.
At VA `0x413a94`, the key-off path reads `[eax+0x10]`; `0x413aa5` divides the current
level by this duration. `0x414000..0x414019` uses field +0x0c to initialize the
held-stage decrement. The sample loop at `0x401ad5..0x401b55` subtracts fixed integer
increments, rather than applying exponential ramps. The original's level scale is
`0x3fffc000` (65535 << 14). The new web implementation uses continuous linear
AudioParam segments, not every integer rounding operation of the original.

The original program0 record `[0,3649,40647,132300,2205]` means ~82.7 ms initial
decay, three seconds of held-key decay, and **50 ms key-off release** at 44100 Hz.
It does not mean a three-second key-off release. Program16 releases in **40 ms**.
An alternate Hold1-dependent branch exists at `0x413aac`; its special release rule
is not reconstructed by this patch.

A separate Web Audio scheduling bug made a later Note Off change PCM from before
that Note Off. The patch inserts an explicit timestamped level before the release
ramp; cancellation alone does not establish the intended start of that ramp.
A real OfflineAudioContext regression compares identical prefixes with different
future Note Off times. Maximum difference measured: 7.45e-9 in float PCM.

Reproduce the original-byte checks without executing it:

```sh
python tools/verify_b236_envelope.py GXSCC-B236E.zip static-evidence.json
```

## Standard PSG percussion

The standard dispatch table at VA `0x41512c` and constructors near
`0x4146a4..0x414cf0` supply the note mappings, reference frame counts, internal
pitches, initial levels, and linear amplitude/pitch slopes now used by `drumRecipes`.
For example, kick35/36 share a 540-frame, internal-note38 square component; a snare
combines 1600 frames of noise at internal pitch140 and 1200 frames of tone at pitch63.
These are not the previous guessed 110-to-43 Hz kicks and exponential noise clicks.

The noise sample loop performs a **signed** `idiv 65535` followed by subtraction
of32768 at `0x401ca2..0x401caa`. This produces biased, not centered +/-1, noise.
That distribution and the original linear amplitude trajectory are preserved.
The original uses a global MT random stream; this implementation deliberately uses
an independent deterministic xorshift stream. Noise samples are **not identical**.
Tonal components use continuous sample integration rather than the original
quantized phase grid; exact phase, random sharing and timing remain different.
The special drum Program50 mapping is still not implemented.

## Gain and comparison protocol

Default output gain changes from0.12 to0.25, calibrated against the isolated original
piano/organ outputs. Percussion shares the existing0.9 mix factor; this is a documented
approximation, not a claim to have recovered the complete mixer. Audio is louder by
default; the UI output slider remains available. No comparison WAV was normalized
or gain-adjusted after rendering. Peak matching is not perceptual equivalence.

Original: SCC like Full-Set, GASHISOFT PSG Drum,44100Hz, stereo, detune none,
low-pass off. Web: bank0,44100Hz, stereo, default gain0.25. Baseline web gain0.12.
All inputs explicitly specify120BPM. New web evidence requests a one-second export
tail; older baseline WAVs include eight seconds. File lengths are not musical
note-duration comparisons. Neither output is resampled for the measurements.

## Three original baseline probes

| Measurement | Original | Old web | Corrected web |
|---|---:|---:|---:|
| Piano held-level change, dB | -3.0101 | -19.3570 | -3.0138 |
| Piano peak, dBFS | -21.0431 | -27.5051 | -21.1181 |
| Organ peak, dBFS | -25.2422 | -31.6900 | -25.3104 |
| Snare peak, dBFS | -12.7708 | -31.5186 | -13.0212 |

Piano change compares RMS in0.15-0.20s and1.00-1.05s within each file, while held.
This ratio is independent of constant output gain. The key-off envelope and the
held decay were corrected; the improvement is not merely a volume increase.

## Independent native follow-up

The unmodified original was executed again on a native Windows runner. Two grids
contain **8 melodic cases and18 percussion cases**, varying pitch, velocity and
hold length, including early Note Off. The workflow independently verifies the
original hash and observed UI settings before exporting through Authoring.

Run: https://github.com/GrappePie/JSSCC/actions/runs/34239590541
Research commit: `8721dbfdf9c471ed8ccc4e23aa4d4c154cf35158`
Artifact: `10061399754`, `original-followup-envelopes-drums`
Artifact SHA-256: `23031e18bfe8feb0caab35402edce57cb9571b03b3267d77815ba1ef4b532df2`.
Its MIDI files are the exact inputs used by both web renders. No EXE in evidence.

Across18 tested percussion cases, the maximum absolute peak-level error is
**0.3671 dB** (rounded up), and the largest difference in threshold-active duration
is **0.885 ms** (rounded up). Threshold: maximum absolute stereo sample >1e-4.
Duration is measured relative to each actual onset; this is not phase matching or
correction of the original's drifting MIDI clock. A different random realization
can change percussion extrema. Toms have decoded recipes and functional tests, but
were not included in these18 native comparison cases.

The independent melodic results also expose remaining failures, not just successes:

| Case | Peak error, new minus original, dB |
|---|---:|
| GM0, note48, velocity32 | -0.028 |
| GM0, note72, velocity127 | -0.087 |
| GM0, note60, velocity100, early key-off | -0.060 |
| GM16, note48, velocity64 | -0.076 |
| GM24, note60, velocity100 | -0.030 |
| GM40, note60, velocity100 | **+4.557** |
| GM29, note67, velocity100 | **+1.851** |

GM40/29 still differ in waveform/mix. The current Fourier oscillator removes DC,
while those native reference waves have nonzero means. That is one identified
mechanism; it is not a complete causal explanation of every remaining error.
Do not describe the0.37dB percussion result as applying to all melodic instruments.

## Regression coverage and remaining limits

Local validation:49 Node tests,25 original browser integration assertions,
18 new real Web Audio assertions. Browser integration locally uses embedded asset
delivery; CI repeats the integration suite over HTTP. The18 new assertions use
real AudioContext output and do not mock PCM. They include release-during-attack,
no retroactive fade,22050/44100/48000Hz envelope consistency, percussion duration,
actual CC7 muting and clipping checks on isolated probes. Functional tests exercise
all128 programs through8 banks; this is not an original-audio comparison of all banks.

Still unverified: exact discrete oscillator/phase and noise stream, full mixer and
pan law, SysEx, special Program50, alternate Hold1 release, timing defaults/drift,
voice stealing, dense-song clipping and full musical/perceptual equivalence.
No percentage-of-fidelity claim is made. The legacy UI remains visibly experimental.
