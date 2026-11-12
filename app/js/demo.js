// Demo mode: a simulated unit that lives in the browser, so the editor can be tried without the
// hardware. Its user memories are random variations of the factory presets, generated on the fly
// from the data the user imported (nothing from Roland is stored in this project).
// Device-neutral: memory map, commands and demo settings come from the active profile.
import { addrToInt, intToAddr, checksum, from14 } from './midi.js';
import { Patch } from './model.js';
import { typeList, paramDefs, dropdownFor, stepperFor, fromDisplay } from './blocks.js';
import { DEVICE, pad2 } from './device.js';

const ADJ = ['WARM', 'FAT', 'DARK', 'BRIGHT', 'WILD', 'SMOOTH', 'ANGRY', 'DREAMY', 'VINTAGE', 'MODERN', 'GLASSY', 'FUZZY', 'SPACEY', 'TIGHT', 'HOT', 'COSMIC', 'DUSTY', 'ROYAL', 'NEON', 'LOW'];
const NOUN = ['LEAD', 'CRUNCH', 'CLEAN', 'RIFF', 'SOLO', 'STACK', 'DRIVE', 'WALL', 'ECHO', 'SWIRL', 'BLUES', 'METAL', 'FUNK', 'DRONE', 'TWANG', 'ROAR', 'HAZE', 'SHIMMER', 'JET', 'CHUG'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function demoName(i) {
  for (;;) {
    const n = `${pick(ADJ)} ${pick(NOUN)}`;
    if (n.length <= 13) return `${n} ${pad2(i + 1)}`.slice(0, 16);
  }
}

// One random variation: start from a factory preset, maybe swap effect types,
// flip a few blocks on/off, and nudge every knob by up to ±20 % of its range.
export function randomPatch(factory, i) {
  const base = pick(factory);
  const p = Patch.fromTsl(base.params);
  for (const b of DEVICE.blocks) {
    const types = typeList(b);
    if (types && Math.random() < 0.3) p.set(b.type, pick(types).val);
    if (b.sw && DEVICE.demo.toggleBlocks.includes(b.id) && Math.random() < 0.2) {
      p.set(b.sw, p.get(b.sw) ? 0 : 1);
    }
    for (const d of paramDefs(b, p)) {
      if (dropdownFor(d.id) || stepperFor(d.id)) continue;
      const lo = fromDisplay(d, d.min); const hi = fromDisplay(d, d.max);
      if (hi - lo < 4) continue;
      const span = Math.round((hi - lo) * 0.2);
      p.set(d.id, Math.max(lo, Math.min(hi, p.get(d.id) + randInt(-span, span))));
    }
  }
  p.name = demoName(i);
  return p;
}

// ---- patches made from scratch (demo without any imported data) ------------------------
const CATEGORIES = ['ROCK', 'BLUES', 'METAL', 'CLEAN', 'AMBIENT', 'FUNK'];

// Knob values lean toward the middle of their range (average of two dice), like real sounds do.
const centred = (lo, hi) => Math.round(lo + ((Math.random() + Math.random()) / 2) * (hi - lo));

export function scratchPresets(count, paramDefs, switches, typeKeys, typeLists) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const params = {};
    for (const d of Object.values(paramDefs)) {
      const lo = fromDisplay(d, d.min); const hi = fromDisplay(d, d.max);
      params[d.id] = hi - lo <= 4 ? randInt(lo, hi) : centred(lo, hi);
    }
    switches.forEach((k) => { params[k] = Math.random() < (DEVICE.demo.onChance[k] ?? 0.4) ? 1 : 0; });
    typeKeys.forEach((k) => { const list = typeLists[k]; params[k] = list ? pick(list).val : 0; });
    DEVICE.demo.chain.forEach((v, j) => { params[DEVICE.patch.chainKeys[j]] = v; });
    const name = demoName(i).replace(/ \d+$/, '');
    const keys = DEVICE.patch.nameKeys;
    [...name.padEnd(keys.length, ' ')].forEach((c, j) => { params[keys[j]] = c.charCodeAt(0); });
    out.push({ name, category: pick(CATEGORIES), params });
  }
  return out;
}

// ---- simulated device -----------------------------------------------------------
// Behaves like the real unit on the SysEx level: identity reply, RQ1 answers, DT1 writes,
// patch select and patch write (addresses from the device profile).
export function createVirtualDevice(factory) {
  const { memory, commands, modelId, name: devName } = DEVICE;
  const mem = new Map();
  const put = (base2, patch) => { const b = addrToInt([...base2, 0, 0]); for (const [o, v] of patch.image) mem.set(b + o, v); };
  const copy = (fromBase2, toBase2) => {
    const f = addrToInt([...fromBase2, 0, 0]); const t = addrToInt([...toBase2, 0, 0]);
    for (let i = 0; i < memory.patchSpan; i++) if (mem.has(f + i)) mem.set(t + i, mem.get(f + i));
  };
  const TEMP = memory.temp;
  const patchNo = addrToInt(memory.currentPatch);
  for (let n = 0; n < memory.userCount; n++) put(memory.user(n), randomPatch(factory, n));
  copy(memory.user(0), TEMP);
  mem.set(patchNo, 0); mem.set(patchNo + 1, 0);

  const input = { id: 'demo-in', name: `Demo ${devName} (simulated)`, onmidimessage: null };
  // Answer asynchronously like real MIDI, but without timers (browsers throttle them in background tabs)
  const reply = (bytes) => queueMicrotask(() => input.onmidimessage && input.onmidimessage({ data: new Uint8Array(bytes) }));
  const dt1 = (addr, data) => { const body = [...intToAddr(addr), ...data]; reply([0xf0, 0x41, 0x10, ...modelId, 0x12, ...body, checksum(body), 0xf7]); };

  const output = {
    id: 'demo-out', name: `Demo ${devName} (simulated)`,
    send(d) {
      d = [...d];
      if (d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x01) { reply([0xf0, 0x7e, 0x10, 0x06, 0x02, 0x41, 0x30, 0x03, 0, 0, 0, 0, 0, 0, 0xf7]); return; }
      if (d[0] !== 0xf0 || d[1] !== 0x41) return;
      const cmdAt = 3 + modelId.length;
      const addr = addrToInt(d.slice(cmdAt + 1, cmdAt + 5));
      if (d[cmdAt] === 0x12) {
        const data = d.slice(cmdAt + 5, d.length - 2);
        data.forEach((b, i) => mem.set(addr + i, b));
        const n = from14(data[0], data[1]);
        if (addr === patchNo) copy(memory.user(n), TEMP); // select patch
        if (addr === addrToInt(commands.patchWrite)) copy(TEMP, memory.user(n)); // write patch
      } else if (d[cmdAt] === 0x11) {
        const size = addrToInt(d.slice(cmdAt + 5, cmdAt + 9));
        for (let s = 0; s < size; s += 128) {
          const chunk = [];
          for (let i = s; i < Math.min(size, s + 128); i++) chunk.push(mem.get(addr + i) ?? 0);
          dt1(addr + s, chunk);
        }
      }
    },
  };
  return { input, output };
}
