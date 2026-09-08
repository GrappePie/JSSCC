# GXSCC B236E browser compatibility v2

This pass moves the browser engine closer to verified B236E behavior while keeping unresolved details explicitly approximate.

Implemented:

- exact recovered 33 wavetables and amplitude scales
- exact recovered eight instrument-set maps
- exact recovered per-program ADSR fields
- verified linear MIDI velocity scaling
- 46-voice SCC compatibility target
- two-voice snare accounting
- RPN 0,0 pitch-bend sensitivity (0–24 semitones, default 2)
- Reset All Controllers handling for bend/sustain/expression/RPN state
- explicit `numberOfTracks` parser variable

Still approximate:

- precise PSG drum timbre generation
- final mixer saturation/clipping behavior
- some controller edge cases and GS/GM SysEx handling

The fifth DWORD in the 20-byte per-program table remains reserved/unknown because no read of offset `+0x10` was found in the inspected SCC envelope paths.
