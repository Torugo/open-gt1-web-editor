# GT-1 MIDI protocol

How the editor talks to a BOSS GT-1, as found by reverse-engineering BOSS TONE STUDIO for GT-1
(v1.0.2) and then verified on a real unit. Values are hexadecimal unless noted.

**Status** in the tables: **verified** = used by this editor and confirmed on a real GT-1;
**used** = used by the editor, not separately confirmed; **known** = found in the original app,
not used yet.

## Transport

The GT-1's USB driver exposes a normal MIDI port pair named `GT-1`. Everything goes through Roland
System Exclusive messages, so a browser can do it all with Web MIDI (`requestMIDIAccess({ sysex: true })`).

```
F0 41 <dev> 00 00 00 30 <cmd> <address x4> <data… | size x4> <sum> F7
```

| Part | Value |
|---|---|
| `41` | Roland manufacturer ID |
| `<dev>` | Device ID, taken from the identity reply. The original app defaults to `10`; the tested unit answered `00`. |
| `00 00 00 30` | GT-1 model ID (the original app calls it `model_id_gt001`; its sibling GT-100 uses `00 00 60`) |
| `<cmd>` | `11` = RQ1 (request data), `12` = DT1 (data set) |
| `<address>` | 4 bytes, 7 bits each |
| `<size>` | RQ1 only: 4 bytes, 7 bits each (e.g. `00 00 08 00` = 1024 bytes) |
| `<sum>` | Roland checksum: `(128 − (sum of address and data bytes mod 128)) mod 128` |

**Identity request:** `F0 7E 7F 06 01 F7`. The reply `F0 7E <dev> 06 02 41 …` gives the device ID.

The unit answers a large RQ1 with several DT1 messages of up to 128 data bytes each.

## Memory map

| Address | Contents | Status |
|---|---|---|
| `00 00 xx xx` | System settings (LCD, play options, tuner, metronome, output select, knob assignments…) | known |
| `00 01 00 00` | **Current patch number**, 2 bytes `hi lo` (value = hi×128+lo): 0–98 = U01–U99, 99–197 = P01–P99 | verified |
| `00 02 xx xx` | MIDI settings (channels, program map…) | known |
| `10 nn xx xx` | User memory *n* (0–98) | verified |
| `20 nn xx xx` | Preset *n* (0–98) | known |
| `60 00 xx xx` | **Edit buffer** (the sound you hear) | verified |
| `7F xx xx xx` | Commands, see below | |

Inside a patch (edit buffer or memory) the layout is the same: `<base> <b2> <b3>`, offsets up to
`11 19`.

## Commands (`7F …`)

All are written with DT1 unless noted.

| Address | Name in the original app | Data | What it does | Status |
|---|---|---|---|---|
| `7F 00 00 00` | editor_comunication_level | read 1 byte | Read on connect | verified |
| `7F 00 00 01` | editor_comunication_mode | `01` / `00` | Editor mode on (connect) / off (exit) | verified |
| `7F 00 00 02` | running_mode | 1 byte | | known |
| `7F 00 01 00` | patch_copy | 4 bytes | Copy one memory to another | known |
| `7F 00 01 04` | patch_write | `hi lo` of the user memory | Store the edit buffer into that memory | verified |
| `7F 00 02 00`–`0A` | tuner_multi_mode_str_1…6_pitch | 2 bytes each | Per-string tuner pitch | known |
| `7F 00 05 00` | tuner_single_mode_pitch | 2 bytes | Tuner pitch | known |
| `7F 00 06 00` | usb_direct_mon | 1 byte | USB direct monitor (set to `01` when the original app exits) | known |
| `7F 00 06 01` | usb_in_out_mode | 1 byte | | known |
| `7F 01 00 00` | quick_setting_write | 2 bytes | | known |
| `7F 01 00 02` | ab_utilty | 1 byte | | known |
| `7F 01 00 03` | patch_clear | 1 byte | | known |
| `7F 01 00 04` | patch_initialize | 1 byte | | known |
| `7F 01 00 07` | manual_sw | 1 byte | | known |
| `7F 70 00 00` | patch_map | read | Patch map | known |
| `7F 71 00 00` | update_patch_map | 1 byte | | known |

## Sequences

**Connect** (same order as the original app):

1. Identity request, keep the device ID.
2. RQ1 `7F 00 00 00`, 1 byte (editor communication level).
3. DT1 `7F 00 00 01` = `01` (editor mode on).
4. RQ1 `00 01 00 00`, 2 bytes (current patch number).
5. Read the edit buffer: RQ1 `60 00 00 00`, `60 00 08 00` and `60 00 10 00`, each `00 00 08 00` (1024) bytes.
6. Read the 99 names: RQ1 `10 nn 00 00`, 16 bytes each.

On exit: DT1 `7F 00 00 01` = `00`.

**Select a patch:** DT1 `00 01 00 00` = `hi lo`, then read the edit buffer. The unit switches by itself.
(The editor keeps a fallback: if the name it reads back is not the expected one, it reads the memory
at `10 nn …` and writes it into the edit buffer.)

**Edit a parameter:** DT1 to its edit-buffer address. The sound changes immediately; nothing is
stored until a write.

**Store into user memory *n*:** DT1 `7F 00 01 04` = `hi lo` of *n*. This stores the edit buffer.

**Load a whole patch into the edit buffer** (factory preset, `.tsl` file): DT1 in the original app's
24 chunks: `60 00 <b2> <b3>` with these offsets and lengths:

```
00 00 64  00 50 48  01 00 64  01 40 64  02 00 65  02 41 63  03 00 64  03 40 64
04 00 64  04 41 63  05 01 63  05 40 64  06 00 64  06 40 64  07 00 64  07 40 64
08 00 64  08 50 48  09 10 48  09 50 48  0A 10 33  10 10 64  10 50 48  11 00 64
```

## Things the unit sends by itself (found on hardware)

- **Patch change announcements.** Every patch change, including one the editor asked for, makes the
  unit send DT1 `00 01 00 00` with the new number. The editor ignores the echo of its own request and
  follows other changes (the patch knob on the unit).
- **Live values.** While a patch uses an expression pedal or an assign (for example SYNC TREMOLO's
  wave assign on FX2 tremolo depth), the unit streams the moving value to its edit-buffer address,
  about 30 DT1 messages a second. The editor updates only that knob and never redraws the page for
  these.

## Parameter values

- **Size.** Most parameters are 1 byte. A few are 2 bytes (delay times, pre-delays, BPM, assign
  targets), sent **high byte first**: value = hi×128 + lo. The original app's address map lists them
  as `<name>_l` at the first byte, but its code stores the high byte there.
- **Display value.** Stored value = (display − min) ÷ step when min < 0, otherwise display ÷ step.
  Example: TONE −50…+50 is stored 0–100; PATCH LEVEL 0–200 in steps of 2 is stored 0–100.
- **Tempo-synced values** (rates, delay times): a numeric range plus extra values for note lengths,
  e.g. DELAY TIME 1–2000 ms, then 2001 = 16th note, 2002 = triplet 8th, …
- **Patch name:** 16 bytes of ASCII at `60 00 00 00`.
- **Effect chain:** 20 bytes at `60 00 07 20`, one block per position:

| Value | Block | Value | Block | Value | Block | Value | Block |
|---|---|---|---|---|---|---|---|
| 0 | COMP | 5 | FX1 | 10 | ACCEL FX | 15 | OD/DS |
| 1 | SEND/RETURN | 6 | FX2 | 11 | PEDAL FX | 16 | USB out |
| 2 | PREAMP A | 7 | DELAY | 12 | FOOT VOLUME | 17 | DIVIDER |
| 3 | PREAMP B | 8 | CHORUS | 13 | NS | 18 | channel B start |
| 4 | EQ | 9 | REVERB | 14 | NS2 | 19 | MIXER |

  Divider (17), channel B start (18) and mixer (19) must stay in that order.

## Where this came from (reverse engineering)

BOSS TONE STUDIO for GT-1 is an Adobe AIR app: a compressed Flash file
(`BOSS_TONE_STUDIO_for_GT1.swf`) plus a small native extension (`RWCANE.dll`) that only opens MIDI
ports. Everything above was read from the Flash file's ActionScript bytecode:

| What | Where in the original app |
|---|---|
| SysEx framing, checksum | `SystemExclusive.createSysExAddress`, `SystemExclusive.getCheckSum` |
| Editor mode on/off | `SystemExclusive.setEditorComunicationnMode`, `ToneCentralLogic` |
| Read/write chunks | `SystemExclusive.blockParameterSetting` |
| Store into memory | `SelectWritePatchNoPopup.selectedPatchNoList` → `commandWriteFunc` |
| Memory addresses | `AddressMap.getPatchAddress`, `_assets/data/addressmap_gt.json` |
| Byte offset of every parameter | `TemporaryParams.setData` |
| Effect types, ranges, labels, visibility rules | static initializer of `ParameterDefinitionGT` |
| Effect chain block IDs | `ChainParams.getEffectName` |
| Two-byte encoding | `ParameterComponent.getDoubleByteValue` |

The tools that do this are in `tools/` (`disasm.py` disassembles the bytecode, `evalcinit.py` replays
static initializers, `build_defs.py` runs the whole pipeline). The browser does the same at first run
with `app/js/extract.js`. See [effects.md](effects.md) for the effect types.
