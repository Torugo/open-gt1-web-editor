# Open GT-1 Web Editor

An unofficial rebuild of **BOSS TONE STUDIO for GT-1** (Adobe AIR) as a plain web app.
It talks to the GT-1 over USB with **Web MIDI**, using the normal Roland GT-1 driver — no AIR, no plugins.

**Open it:** <https://torugo.github.io/open-gt1-web-editor/> (Chrome or Edge)

Not affiliated with or endorsed by Roland / BOSS.

## First run: your own Roland files

This repository contains **no Roland files**. On first use the editor asks for your own copy of
BOSS TONE STUDIO for GT-1, and reads the parameter list and factory presets from it — in the browser,
nothing is uploaded. It is stored in the browser, so you do this once. Any of these works:

- the BOSS download (e.g. `bts_gt1_w102.zip`) or the installer `.exe` inside it
  (boss.info → GT-1 → Support → Updates & Drivers)
- the installed folder, usually `C:\Program Files (x86)\BOSS TONE STUDIO for GT-1`

## Use

1. Install the Roland GT-1 USB driver (Windows / macOS) and plug in the GT-1.
2. Close the old BOSS TONE STUDIO (only one program can use the GT-1 MIDI port at a time).
3. Open the page, click **Connect GT-1**, allow MIDI access.

Works in desktop **Chrome, Edge, Opera or other Chromium browsers** on Windows, macOS and Linux.
Firefox has Web MIDI only behind an add-on prompt and Safari has none.
On Linux the GT-1 must show up as a MIDI device (`aconnect -l`); this has not been tested yet.

## Run it yourself

Any of these serves the same static page on <http://localhost:8123>:

| How | Command |
|---|---|
| Docker | `docker compose up -d` (stop with `docker compose down`) |
| Windows | double-click `start.bat` (needs Python) |
| macOS / Linux | `./start.sh` (needs Python 3) |

The page must be opened as `http://localhost…` or `https://…`: browsers only allow Web MIDI there.
The Docker container only serves files; it needs no USB access, because the browser on your computer
talks to the GT-1.

## Demo mode (no GT-1 needed)

The editor can be tried two ways without hardware. Both connect it to a simulated GT-1 running in the
browser, where loading memories, editing and writing all work, and nothing reaches real hardware.
**New demo** rolls a fresh set of patches.

- **Before importing anything:** on the setup screen, choose **Try the demo first**. The demo then
  uses a small made-up parameter set (generic effects like CLEAN, CRUNCH, PHASER) written for this
  project (`app/js/demo-defs.js`) with randomly generated sample patches. Connecting a real GT-1 and
  `.tsl` import/export are blocked in this mode, because the made-up addresses don't match a real
  unit; the banner's **Import BOSS TONE STUDIO files** button switches to the real editor.
- **After importing:** **Try demo** fills the simulated unit with random variations of the real
  factory presets (effect types swapped, blocks switched, knobs nudged). **Connect GT-1** leaves it.

## What works

- Connect / handshake (editor mode on, off when the tab closes)
- Read the current sound, live editing of every patch parameter (all 20 chain blocks + master)
- Effect type / sub type selection, parameters shown/hidden like the original
- Effect chain: on/off LEDs, drag to reorder
- GT-1 user memories U01–U99: list, load, **Write** the current sound into a memory
- Factory presets, playable through the GT-1 without storing
- Import / export `.tsl` liveset files (BOSS TONE STUDIO / BOSS Tone Central format)
- Changes made on the unit's own panel are picked up

Not rebuilt yet: system settings, tuner, CTL/EXP assign editor, copy/move between memories, online Tone Central.

## Layout

| Path | What |
|---|---|
| `app/` | The web app (static files, no build step) — deployed to GitHub Pages as-is |
| `app/js/extract.js` | Reads the parameter table out of the user's BOSS TONE STUDIO files |
| `app/js/midi.js` | Web MIDI + Roland SysEx (RQ1/DT1, checksum) |
| `app/js/model.js` | Patch bytes ⇄ values ⇄ `.tsl` |
| `app/js/blocks.js` | Effect blocks, types, sub types, labels |
| `app/js/app.js` | UI and setup screen |
| `app/js/store.js` | Browser storage (IndexedDB) for the extracted data |
| `tools/` | The same extraction in Python, for development |
| `Dockerfile`, `compose.yaml`, `docker/` | nginx container serving `app/` |
| `start.bat`, `start.sh` | Local launchers (Windows / macOS, Linux) |

## Local development

```
python -I tools/build_defs.py path/to/installed-program   # writes app/data/ (git-ignored)
./start.sh   # or start.bat — serves app/ on http://localhost:8123
```

When `app/data/` exists locally the setup screen is skipped. `app/data/` is never committed, and the
Pages workflow refuses to deploy if it is.

## License

[GNU AGPL-3.0](LICENSE). You may use, change and share this editor. If you share a modified version,
or run one as a website, you must make its source code available under the same license
(for a website: keep a "Source" link like the one in the page footer). See [NOTICE](NOTICE).

Roland's parameter data and presets are not part of this project or its license. BOSS, GT-1 and
BOSS TONE STUDIO are trademarks of Roland Corporation, used here only to say which device this works with.

## Protocol notes (GT-1)

- SysEx: `F0 41 <dev> 00 00 00 30 <11=RQ1|12=DT1> <addr×4> <data | size×4> <checksum> F7`, device id from the identity reply (usually `10`).
- Edit buffer at `60 00 xx xx`; user memory *n* (0–98) at `10 n xx xx`; presets at `20 n xx xx`.
- Two-byte values are sent high byte first (value = hi×128 + lo).
- Stored value = (display − min) ÷ step when min < 0, otherwise display ÷ step.
- Editor mode: write `01` to `7F 00 00 01` on connect, `00` on exit. Store to memory: write `[hi, lo]` of the memory index to `7F 00 01 04`.
- Current patch number: `00 01 00 00` (2 bytes).
