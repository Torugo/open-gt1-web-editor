# Other BOSS devices (help wanted)

Only the **GT-1** is supported. Other BOSS multi-effects are very likely possible, but nobody is
working on them yet: it needs someone who owns the device. Contributions are welcome; open an issue
first so the work can be shared.

## Why it looks feasible

Most of the editor is not GT-1 specific: the Web MIDI / Roland SysEx transport, the patch model,
`.tsl` files, the knob UI, the demo and the setup screen. BOSS also reused code across the family:
the GT-1's BOSS TONE STUDIO still contains a GT-100 model ID, "quick setting" lists for the GT-100 and
GT-001, and effect types the GT-1 does not have.

| Device | Effort | Notes |
|---|---|---|
| GT-001 | Small | Desktop GT-1, same code family; the GT-1 app already references it |
| GT-100 | Medium | Same family, more effects, two channels, own memory layout (3-byte model ID `00 00 60`) |
| ME-80, ME-25 | Medium | Possibly the same platform; needs checking |
| Katana, GT-1000 | Unknown | Newer editors, may be built differently; look at the files first |

## What a new device needs

1. **That device's own BOSS TONE STUDIO files.** Each model has its own memory layout, effect list
   and chain. As with the GT-1, the data is read from the user's own copy, so the repository stays
   free of Roland files.
2. **The real unit to test with.** Several GT-1 bugs only showed up on hardware (the unit echoing
   patch changes, assigns streaming ~30 updates a second); the simulated unit did not catch them.

## How to add one

Everything device-specific lives in a *device profile*. `app/js/devices/gt1.js` is the GT-1's and the
template for others: SysEx model ID, MIDI port names, memory map (edit buffer, user and preset
memories, read/write chunks), editor commands, name and chain keys, effect blocks and their rules,
hover hints, which BOSS TONE STUDIO files and classes to extract from, and demo settings. The rest of
the editor only asks the active profile, and the setup screen picks the profile from the files it is
given.

1. Copy `devices/gt1.js` to `devices/<device>.js` and add it to `DEVICES` in `app/js/device.js`.
2. Run the extraction on that device's BOSS TONE STUDIO (`tools/build_defs.py` and `tools/disasm.py`;
   [protocol.md](protocol.md) shows where each GT-1 piece was found) and fill in the profile.
3. Test every operation on the real unit: connect, read all memories, switch patches, live edit,
   write to a memory, `.tsl` import and export.
