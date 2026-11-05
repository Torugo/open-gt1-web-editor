// Demo mode: a simulated GT-1 that lives in the browser, so the editor can be tried without the
// hardware. Its user memories are random variations of the factory presets, generated on the fly
// from the data the user imported (nothing from Roland is stored in this project).
import { addrToInt, intToAddr, checksum } from './midi.js';
import { Patch, TEMP_BASE } from './model.js';
import { BLOCKS, typeList, paramDefs, dropdownFor, stepperFor, fromDisplay } from './blocks.js';

const ADJ = ['WARM', 'FAT', 'DARK', 'BRIGHT', 'WILD', 'SMOOTH', 'ANGRY', 'DREAMY', 'VINTAGE', 'MODERN', 'GLASSY', 'FUZZY', 'SPACEY', 'TIGHT', 'HOT', 'COSMIC', 'DUSTY', 'ROYAL', 'NEON', 'LOW'];
const NOUN = ['LEAD', 'CRUNCH', 'CLEAN', 'RIFF', 'SOLO', 'STACK', 'DRIVE', 'WALL', 'ECHO', 'SWIRL', 'BLUES', 'METAL', 'FUNK', 'DRONE', 'TWANG', 'ROAR', 'HAZE', 'SHIMMER', 'JET', 'CHUG'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

function demoName(i) {
  for (;;) {
    const n = `${pick(ADJ)} ${pick(NOUN)}`;
    if (n.length <= 13) return `${n} ${String(i + 1).padStart(2, '0')}`.slice(0, 16);
  }
}

// One random variation: start from a factory preset, maybe swap effect types,
// flip a few blocks on/off, and nudge every knob by up to ±20 % of its range.
export function randomPatch(factory, i) {
  const base = pick(factory);
  const p = Patch.fromTsl(base.params);
  for (const b of BLOCKS) {
    const types = typeList(b);
    if (types && Math.random() < 0.3) p.set(b.type, pick(types).val);
    if (b.sw && ['fx1', 'fx2', 'delay', 'chorus', 'reverb', 'comp', 'eq'].includes(b.id) && Math.random() < 0.2) {
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

// ---- simulated device -----------------------------------------------------------
// Behaves like the GT-1 on the SysEx level: identity reply, RQ1 answers, DT1 writes,
// patch select (00 01 00 00) and patch write (7F 00 01 04).
export function createVirtualGT1(factory) {
  const mem = new Map();
  const put = (base2, patch) => { const b = addrToInt([...base2, 0, 0]); for (const [o, v] of patch.image) mem.set(b + o, v); };
  const copy = (fromBase2, toBase2) => {
    const f = addrToInt([...fromBase2, 0, 0]); const t = addrToInt([...toBase2, 0, 0]);
    for (let i = 0; i < 24 * 128; i++) if (mem.has(f + i)) mem.set(t + i, mem.get(f + i));
  };
  const userBase = (n) => [0x10 + (n >> 7), n & 127];
  for (let n = 0; n < 99; n++) put(userBase(n), randomPatch(factory, n));
  copy(userBase(0), TEMP_BASE);
  mem.set(addrToInt([0, 1, 0, 0]), 0); mem.set(addrToInt([0, 1, 0, 1]), 0);

  const input = { id: 'demo-in', name: 'Demo GT-1 (simulated)', onmidimessage: null };
  // Answer asynchronously like real MIDI, but without timers (browsers throttle them in background tabs)
  const reply = (bytes) => queueMicrotask(() => input.onmidimessage && input.onmidimessage({ data: new Uint8Array(bytes) }));
  const dt1 = (addr, data) => { const body = [...intToAddr(addr), ...data]; reply([0xf0, 0x41, 0x10, 0, 0, 0, 0x30, 0x12, ...body, checksum(body), 0xf7]); };

  const output = {
    id: 'demo-out', name: 'Demo GT-1 (simulated)',
    send(d) {
      d = [...d];
      if (d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x01) { reply([0xf0, 0x7e, 0x10, 0x06, 0x02, 0x41, 0x30, 0x03, 0, 0, 0, 0, 0, 0, 0xf7]); return; }
      if (d[0] !== 0xf0 || d[1] !== 0x41) return;
      const addr = addrToInt(d.slice(8, 12));
      if (d[7] === 0x12) {
        const data = d.slice(12, d.length - 2);
        data.forEach((b, i) => mem.set(addr + i, b));
        if (addr === addrToInt([0, 1, 0, 0])) copy(userBase(data[0] * 128 + data[1]), TEMP_BASE); // select patch
        if (addr === addrToInt([0x7f, 0, 1, 4])) copy(TEMP_BASE, userBase(data[0] * 128 + data[1])); // write patch
      } else if (d[7] === 0x11) {
        const size = addrToInt(d.slice(12, 16));
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
