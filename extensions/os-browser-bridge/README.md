# JSSCC Online Sequencer Bridge

Optional Chrome / Opera extension for JSSCC — PCM Edition.

It lets the JSSCC catalog search use your normal browser session on Online Sequencer instead of the server-side search endpoint that may be blocked by anti-bot protection. Search results are returned to JSSCC as metadata only; playback still uses JSSCC's existing per-sequence bridge and PCM engine.

## Install unpacked

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome, or `opera://extensions` in Opera.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `extensions/os-browser-bridge` folder.
6. Reload `https://grappepie.github.io/JSSCC/`.

No extension ID is hard-coded into JSSCC. The page detects the bridge with a short handshake.

## What it does

When you search the catalog from JSSCC, the extension opens the corresponding official Online Sequencer search in an **inactive tab**, waits for the page to load in your normal browser session, reads the visible sequence cards, closes that tab, and returns the IDs/titles/authors/durations to JSSCC. JSSCC then renders those results with its own skin.

The extension does **not** bypass a browser verification page. If Online Sequencer asks you to verify your browser, open the site normally once and complete that check yourself.

## Permissions

- `tabs`: create/read/close the temporary inactive Online Sequencer catalog tab.
- `https://onlinesequencer.net/*`: read the catalog page that your browser loaded.
- `https://grappepie.github.io/JSSCC/*`: communicate with JSSCC.

The extension does not read arbitrary websites.
