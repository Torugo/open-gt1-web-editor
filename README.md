# REA-BOSS — GT-1 editor in the browser

A rebuild of **BOSS TONE STUDIO for GT-1** (Adobe AIR) as a plain web app.
It talks to the GT-1 over USB with **Web MIDI**, using the normal Roland GT-1 driver — no AIR, no plugins.

## Run it

1. Install the Roland GT-1 USB driver (same one the old app needed) and plug in the GT-1.
2. Double-click `start.bat` (needs Python). It serves `app/` on <http://localhost:8123> and opens it.
3. Use **Chrome or Edge** (Firefox/Safari lack proper Web MIDI SysEx). Click **Connect GT-1** and allow MIDI access.

Close the old BOSS TONE STUDIO first: on Windows only one program can open the GT-1 MIDI port at a time.

## What works

- Connect / handshake (editor mode on, off when the tab closes)
- Read the current sound, live editing of every patch parameter (all 20 chain blocks + master)
- Effect type / sub type selection, parameters shown/hidden exactly like the original
- Effect chain: on/off LEDs, drag to reorder
- GT-1 user memories U01–U99: list, load, **Write** current sound into a memory
- 99 factory presets (from the original app's data), playable through the GT-1 without storing
- Import / export `.tsl` liveset files (compatible with BOSS TONE STUDIO / BOSS Tone Central)
- Changes made on the unit's own panel are picked up

Not rebuilt (yet): system settings, tuner, CTL/EXP assign editor, librarian copy/move between memories,
online Tone Central (Roland's servers for the old app are gone).

## Layout

| Path | What |
|---|---|
| `app/` | The web app (static files, no build step) |
| `app/data/gt1.json` | Parameter table: addresses, ranges, labels, visibility rules — generated |
| `app/data/factory_presets.tsl` | Factory presets, copied from the original install |
| `app/js/midi.js` | Web MIDI + Roland SysEx (RQ1/DT1, checksum) |
| `app/js/model.js` | Patch bytes ⇄ values ⇄ `.tsl` |
| `app/js/blocks.js` | Effect blocks, types, sub types, labels |
| `app/js/app.js` | UI |
| `tools/` | Extraction pipeline from the original app (`build_defs.py`) |
| `backup/` | Untouched copy of the installer zip and installed program |

## Regenerating the parameter table

```
python -I tools/build_defs.py
```

This decompresses `backup/installed-program/BOSS_TONE_STUDIO_for_GT1.swf`, disassembles its ActionScript
(`tools/disasm.py`), replays the `ParameterDefinitionGT` table (`tools/evalcinit.py`) and reads byte offsets
from `TemporaryParams.setData`, then writes `app/data/gt1.json`.

## Protocol notes (GT-1)

- SysEx: `F0 41 <dev> 00 00 00 30 <11=RQ1|12=DT1> <addr×4> <data | size×4> <checksum> F7`, device id from the identity reply (usually `10`).
- Edit buffer at `60 00 xx xx`; user memory *n* (0–98) at `10 n xx xx`; presets at `20 n xx xx`.
- Two-byte values are sent high byte first (value = hi×128 + lo).
- Stored value = (display − min) ÷ step when min < 0, otherwise display ÷ step.
- Editor mode: write `01` to `7F 00 00 01` on connect, `00` on exit. Store to memory: write `[hi, lo]` of the memory index to `7F 00 01 04`.
- Current patch number: `00 01 00 00` (2 bytes).

The factory preset data and parameter names come from Roland's software; keep that in mind before publishing this publicly.
