# GXSCC B236E exact engine integration

This branch switches the browser player from the earlier procedural approximation to data recovered from the original GXSCC B236E executable.

Integrated so far:

- 33 exact 32-sample signed wavetables
- per-wave amplitude scale
- all 8 original 128-program instrument-set maps
- 128 recovered ADSR records (attack/decay/sustain/release plus an unresolved fifth field)
- explicit MIDI track-count parsing to avoid the previous `trackCount is not defined` failure
- cache-busted GitHub Pages script URLs

Still approximate:

- percussion/drum synthesis
- exact interpretation of the fifth per-program envelope field
- exact velocity/volume curve and mixer saturation/clipping behavior
- RPN pitch-bend sensitivity beyond the current default ±2 semitones

Source executable SHA-256: `1eeeecf6ff72f34841983e05579114159748c70d0b3725d85af3301004992f7a`
