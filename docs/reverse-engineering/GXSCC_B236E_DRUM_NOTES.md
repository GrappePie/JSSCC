# GXSCC B236E SCC drum compatibility notes

The original B236E README explicitly states that Standard/SCC mode has a 46-voice maximum and that the snare drum is currently the only percussion instrument that uses two voices. The compatibility engine v2 therefore treats snare (GM drum notes 38/40) as a layered two-voice event (noise + pitched square component), while other PSG drum events consume one voice.

This is still a clean-room approximation of the PSG drum timbres; exact drum synthesis tables/routines have not yet been fully recovered. The implementation deliberately separates verified behavior (voice accounting, snare two-voice rule, linear velocity scaling) from approximate timbre generation.

A special fixed 50% square table copied from VA `0x4510D8` was found in one compatibility path, but static analysis shows that path is tied to special GM/SC-88Pro handling and is not sufficient to claim it is the complete drumset implementation.
