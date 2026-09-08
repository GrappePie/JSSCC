# GXSCC B236E reverse-engineering notes

Source analyzed: `GXSCC.exe` from `GXSCC-B236E.zip`.

SHA-256: `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`

## Executable

- PE32 / x86 Windows GUI executable
- Timestamp: 2002-11-09
- 4 sections: `.text`, `.rdata`, `.data`, `.rsrc`
- Audio output uses `WINMM.dll` (`waveOutOpen`, `waveOutWrite`, `waveOutPause`, `waveOutRestart`, `waveOutGetPosition`, etc.)
- WAV writing uses MMIO APIs (`mmioOpenA`, `mmioCreateChunk`, `mmioWrite`, etc.)
- No external synthesizer DLL is present in the supplied archive.
- The executable contains a string referring to optional/expected `RCPCV.DLL`.

## Exact waveform records

A table begins at file offset `0x51158` / VA `0x451158` in `.data`.

Each record is exactly 72 bytes:

```
+0x00  uint32 amplitude_scale
+0x04  uint32 flag2
+0x08  char name[32]
+0x28  int8 waveform[32]
```

The synthesis code uses a 72-byte stride and multiplies each signed 8-bit waveform sample by `amplitude_scale`, confirming this is live synthesis data rather than UI data.

33 records were recovered:

0. SQUARE 50%
1. SQUARE 25%
2. SQUARE 12%
3. TRIANGLE
4. TRIANGLE HIGH
5. PURE SIN
6. X6 SQUARE
7. RANDOM SQUARE
8. RIGHT-DOWN SAW
9. HENSOKU SQUARE
10. HENSOKU SIN
11. CHURCH SIN
12. METAL SIN
13. ROUNDED SAW
14. SCRATCH SIN
15. BIG SAWED SQUARE
16. SIN OR 2X
17. TRIANGLE OR 2X
18. SIN AND TRIANGLE 2X
19. LINNER SQUARE 25
20. DISTORTION 1
21. SIN AND 2X SAW
22. ROUNDED SQUARE 50%
23. TOGE SIN
24. TOGE AND BIG SIN
25. TOGETOGE AND BIG SIN
26. DISTORTION TRIANGLE
27. ELGUIZA
28. OSAKANA
29. HARMONICA
30. DISTORTION 2
31. SLAP
32. PULSE SQUARE 50%

## Instrument-set maps

The program->waveform table begins at VA `0x453DAC` / file offset `0x53DAC`.

The code indexes it as:

```
selected_set * 128 + midi_program
```

Eight consecutive 128-entry maps are present and align with the UI instrument sets:

0. SCC like Full-Set
1. Famicom like Set
2. All Square Set
3. All Triangle Set
4. All Steel Set
5. All HyperSin Set
6. All Sin Set
7. All PulsedSquare Set

The SCC bank uses 29 of the 33 recovered waveform indices. The Famicom bank primarily uses waveform indices 0, 1, 2, 3 and 5.

## Per-program envelope table

A 20-byte-per-program table begins at VA `0x4551B0` / file offset `0x551B0`.

The code references the first four fields as an ADSR-style envelope:

```
struct ProgramEnvelope {
    uint32 attack_samples;
    uint32 decay_samples;
    uint32 sustain_level;   // 0..65535
    uint32 release_samples;
    uint32 unknown5;
};
```

The envelope calculations use `0x3FFFC000` as an internal full-scale accumulator and derive attack/decay/release increments from the table values.

Examples at 44.1 kHz:

- GM 0: attack 0, decay 3649 (~82.7 ms), sustain 40647 (~62%), release 132300 (3 s), unknown5 2205
- GM 16: attack 882 (20 ms), decay 4410 (100 ms), sustain 65535 (100%), release 0, unknown5 1764
- GM 29: attack 0, decay 1323 (30 ms), sustain 54647 (~83%), release 264600 (6 s), unknown5 882

`unknown5` is not identified yet.

## Next targets

1. Identify `unknown5` in the envelope structure.
2. Locate PSG drum waveform/noise tables and note mapping.
3. Determine master/per-program gain and velocity curves.
4. Determine exact pitch-bend and RPN handling.
5. Replace the current procedural JSSCC approximation with the recovered 32-sample tables, exact GM map and exact envelopes.

This document records observed data structures and behavior for a clean-room compatible reimplementation; it does not contain copied executable code.
