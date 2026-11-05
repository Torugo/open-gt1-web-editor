# Open GT-1 Web Editor

An unofficial, open-source editor for the **BOSS GT-1** that runs in the browser. It replaces
BOSS TONE STUDIO for GT-1 (Adobe AIR) and talks to the unit over USB with Web MIDI, using the normal
GT-1 driver. Not affiliated with Roland / BOSS.

**Open it:** <https://torugo.github.io/open-gt1-web-editor/> (Chrome, Edge or another Chromium browser)

## Getting started

1. Install the GT-1 USB driver, plug in the GT-1 and close the old BOSS TONE STUDIO.
2. Open the page. The first time, give it your own copy of BOSS TONE STUDIO for GT-1: the BOSS
   download zip (e.g. `bts_gt1_w102.zip`), the installer `.exe` or the installed folder. The editor
   reads the parameter list and factory presets from it, in the browser; nothing is uploaded and
   this repository contains no Roland files.
3. Click **Connect GT-1** and allow MIDI access.

No GT-1 at hand? **Try the demo first** on the setup screen runs the editor against a simulated unit.

## Features

- Live editing of every patch parameter: all chain blocks, types, sub types and master settings
- Effect chain in a simple (IN → pedals → OUT) or full view, with on/off LEDs and drag to reorder
- Hover hints with the real pedal or amp each effect models ([list](docs/effects.md))
- User memories U01–U99: load, and **Write** the current sound into one
- Factory presets, `.tsl` import and export
- Follows changes made on the unit itself, including pedal and assign movements
- Demo mode with a simulated GT-1 and random patches

Not rebuilt yet: system settings, tuner, CTL/EXP assign editor, copy/move between memories.
Tested on a real GT-1 with Chrome on Windows. Firefox and Safari lack the Web MIDI support it needs.

## Run it yourself

```
docker compose up -d      # http://localhost:8123
docker compose down
```

Web MIDI only works on `localhost` or `https`. The container only serves files; your browser talks
to the GT-1.

## Development

```
python -I tools/build_defs.py path/to/installed-program   # extract tables into app/data/ (git-ignored)
python -m http.server 8123 --bind 127.0.0.1 -d app      # serve app/; uses app/data/ and skips setup
```

| Path | What |
|---|---|
| `app/` | The web app: static files, no build step, deployed to GitHub Pages as-is |
| `app/js/devices/gt1.js` | Everything GT-1 specific (memory map, commands, blocks, hints) |
| `app/js/extract.js` | Reads the tables out of the user's BOSS TONE STUDIO |
| `tools/` | The same extraction in Python, plus `make_effects_doc.py` |
| `docs/` | [Protocol and commands](docs/protocol.md), [effects](docs/effects.md), [other devices](docs/devices.md) |

Other BOSS units (GT-100, GT-001…) are possible but need an owner to test:
see [docs/devices.md](docs/devices.md).

## License

[GNU AGPL-3.0](LICENSE): use, change and share it; if you share a modified version or run one as a
website, publish its source under the same license. See [NOTICE](NOTICE). Roland's data is not part
of this project; BOSS, GT-1 and BOSS TONE STUDIO are trademarks of Roland Corporation.
