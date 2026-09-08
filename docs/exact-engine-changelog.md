# Exact engine changelog

- Added `js/gxscc-exact-data.js` with recovered GXSCC B236E waveform, instrument-set and ADSR data.
- Added `js/gxscc-exact-engine.js` using those tables directly.
- Updated `index.html` to load the exact data and engine with cache-busting query strings.
- Replaced the previous implicit `trackCount` handling with an explicit `numberOfTracks` parser variable.
