# GXSCC B236E audio findings — pass 2

Additional clean-room findings from static analysis of the original `GXSCC.exe` (SHA-256 `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`).

## Velocity transfer

The note-on path loads an internal channel-level integer, multiplies it by the float constant `0.007874015718698502` (`1/127`), multiplies by MIDI velocity, and then applies an output factor (`0.9` in the normal SCC path; another nearby path uses `0.7`). This confirms that note velocity is handled essentially linearly rather than with an exponential velocity curve.

Relevant constants recovered from `.rdata`:

- `0x444F60` = `1 / 127`
- `0x444F50` = `0.9`
- `0x444F54` = `0.7`

## Voice limits

The original README states for Standard/SCC mode:

- 16 channels × 2 ports
- maximum 46 voices
- conceptually SCC × 8 + AY-3-8910-compatible × 2
- snare drum is currently the only percussion instrument that consumes two voices

The browser compatibility engine should therefore use 46 as its compatibility polyphony target and account for snare as two voices.

## ADSR fifth field

The 20-byte per-program record is addressed at `0x4551B0 + program * 20`. The synthesis/envelope setup code dereferences only:

- `+0x00` Attack
- `+0x04` Decay
- `+0x08` Sustain level
- `+0x0C` Release

No dereference of `+0x10` was found through this record pointer in the SCC envelope paths inspected. The fifth DWORD should therefore remain labelled `reserved/unknown` and must not be assigned a speculative audible function.

## Fixed square table used by a special percussion/orchestral path

A 32-sample fixed waveform at VA `0x4510D8` is copied directly into the voice waveform buffer in a special path:

- samples 0–15: `+32000`
- samples 16–31: `-32000`

This is an exact 50% square wave in the internal 32-bit mixing representation. The associated branch includes special handling around GM/SC-88Pro compatibility notes and should not be treated as the complete PSG drumset definition.

## MIDI pitch-bend sensitivity

The supplied MIDI implementation document confirms RPN 0,0 controls pitch-bend sensitivity from 0 to 24 semitones, default 2 semitones. A compatible browser implementation should track RPN MSB/LSB and Data Entry MSB rather than permanently assuming ±2 semitones.
