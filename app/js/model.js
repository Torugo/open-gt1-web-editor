// GT-1 patch model: parameter table, value conversion, patch <-> bytes / .tsl
import { addrToInt, intToAddr } from './midi.js';

export let GT = null; // { addr: {key: [b2, b3, size]}, defs: {...} }

// The table comes from the user's own copy of BOSS TONE STUDIO (see extract.js).
export function setDefs(defs) { GT = defs; }

// Temporary (edit buffer) patch lives at 60 00 xx xx.
// User patch n (0-98) at 10 n xx xx, preset n at 20 n xx xx.
export const TEMP_BASE = [0x60, 0x00];
export const userBase = (n) => [0x10 + (n >> 7), n & 127];
export const presetBase = (n) => [0x20 + (n >> 7), n & 127];

// Read in 3 blocks of 8 pages (same as the original app), write in its exact chunks.
export const READ_BLOCKS = [[0x00, 0x00], [0x08, 0x00], [0x10, 0x00]];
export const READ_SIZE = 8 * 128;
export const WRITE_CHUNKS = [
  [0x00, 0x00, 64], [0x00, 0x50, 48], [0x01, 0x00, 64], [0x01, 0x40, 64], [0x02, 0x00, 65], [0x02, 0x41, 63],
  [0x03, 0x00, 64], [0x03, 0x40, 64], [0x04, 0x00, 64], [0x04, 0x41, 63], [0x05, 0x01, 63], [0x05, 0x40, 64],
  [0x06, 0x00, 64], [0x06, 0x40, 64], [0x07, 0x00, 64], [0x07, 0x40, 64], [0x08, 0x00, 64], [0x08, 0x50, 48],
  [0x09, 0x10, 48], [0x09, 0x50, 48], [0x0a, 0x10, 33], [0x10, 0x10, 64], [0x10, 0x50, 48], [0x11, 0x00, 64],
];

const NAME_KEYS = Array.from({ length: 16 }, (_, i) => `patch_name${i + 1}`);

export class Patch {
  constructor() {
    this.values = {};      // key -> raw value
    this.image = new Map(); // offset (b2*128+b3) -> byte, keeps bytes we don't know about
  }

  static fromImage(image) {
    const p = new Patch();
    p.image = new Map(image);
    for (const [key, [b2, b3, size]] of Object.entries(GT.addr)) {
      const o = b2 * 128 + b3;
      if (!p.image.has(o)) continue;
      p.values[key] = size === 2 ? p.image.get(o) * 128 + (p.image.get(o + 1) || 0) : p.image.get(o);
    }
    return p;
  }

  static fromTsl(params) {
    const p = new Patch();
    for (const key of Object.keys(GT.addr)) {
      if (typeof params[key] === 'number') p.values[key] = params[key];
    }
    p.syncImage();
    return p;
  }

  clone() {
    const p = new Patch();
    p.values = { ...this.values };
    p.image = new Map(this.image);
    return p;
  }

  syncImage() {
    for (const [key, v] of Object.entries(this.values)) this.writeImage(key, v);
  }

  writeImage(key, v) {
    const [b2, b3, size] = GT.addr[key];
    const o = b2 * 128 + b3;
    if (size === 2) { this.image.set(o, (v >> 7) & 127); this.image.set(o + 1, v & 127); }
    else this.image.set(o, v & 127);
  }

  get(key) { return this.values[key] ?? 0; }

  set(key, v) {
    this.values[key] = v;
    this.writeImage(key, v);
  }

  // Bytes to send for one parameter edit: [addr4, data[]]
  paramMessage(key) {
    const [b2, b3, size] = GT.addr[key];
    const v = this.get(key);
    const data = size === 2 ? [(v >> 7) & 127, v & 127] : [v & 127];
    return [[...TEMP_BASE, b2, b3], data];
  }

  // Whole patch as DT1 messages for a given 2-byte base (temp, user slot...)
  chunks(base = TEMP_BASE) {
    return WRITE_CHUNKS.map(([b2, b3, size]) => {
      const start = b2 * 128 + b3;
      const data = [];
      for (let i = 0; i < size; i++) data.push(this.image.get(start + i) ?? 0);
      const a = intToAddr(addrToInt([...base, 0, 0]) + start);
      return [a, data];
    });
  }

  get name() {
    return NAME_KEYS.map((k) => String.fromCharCode(this.get(k) || 32)).join('').replace(/\s+$/, '');
  }

  set name(s) {
    const padded = (s || '').slice(0, 16).padEnd(16, ' ');
    NAME_KEYS.forEach((k, i) => {
      let c = padded.charCodeAt(i);
      if (c < 32 || c > 126) c = 32;
      this.set(k, c);
    });
  }

  toTslParams() {
    const out = { ...this.values };
    // .tsl files also carry split _h/_l bytes for two-byte values
    for (const [key, [, , size]] of Object.entries(GT.addr)) {
      if (size === 2) { out[key + '_h'] = (this.get(key) >> 7) & 127; out[key + '_l'] = this.get(key) & 127; }
    }
    out.chainParams = { positionList: chainOf(this) };
    return out;
  }
}

export const chainOf = (patch) => Array.from({ length: 20 }, (_, i) => patch.get(`fx_chain_position${i + 1}`));

// ---- value <-> display conversion -------------------------------------------
// From the factory presets: stored = (display - min) / step when min < 0, else display / step.
export function toDisplay(def, raw) {
  const base = def.min < 0 ? def.min : 0;
  return raw * (def.step || 1) + base;
}
export function fromDisplay(def, disp) {
  const base = def.min < 0 ? def.min : 0;
  return Math.round((disp - base) / (def.step || 1));
}

// Build .tsl (BOSS TONE STUDIO liveset) JSON from patches.
export function buildTsl(patches, name = 'REA-BOSS export') {
  return {
    device: 'GT-1',
    patchList: patches.map((p, i) => ({
      name: p.name, id: String(i + 1), orderNumber: i + 1, category: '', category2: '', note: '',
      params: p.toTslParams(),
    })),
    liveSetData: { name, id: null, orderNumber: 1, path: null, url: null, image: null },
    version: '1.0.0',
  };
}
