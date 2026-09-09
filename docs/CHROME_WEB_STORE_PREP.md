# Chrome Web Store preparation

The companion extension remains in local-test status until it has been exercised in a real user browser against Online Sequencer.

Current local test version: **0.1.1**.

Before Store submission, verify:
- JSSCC detects the extension handshake.
- A normal catalog search returns visible cards.
- If Cloudflare asks for browser verification, the Online Sequencer tab is kept open and activated instead of silently falling back to the server search.
- After the user completes that verification, retrying the search returns results in JSSCC.
- Sort/date filters map to the official catalog query values.
- Direct chiptune playback still works from result cards.

Do not submit to the Store before this real-browser validation is complete.
