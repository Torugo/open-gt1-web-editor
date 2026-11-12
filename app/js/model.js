// Patch model: parameter table, value conversion, patch <-> bytes / .tsl.
// Device-neutral: memory layout and key names come from the active profile (device.js).
import { addrToInt, intToAddr, to14, from14 } from './midi.js';
import { DEVICE } from './device.js';

export let GT = null; // { addr: {key: [b2, b3, size]}, defs: {...} }

// The table comes from the user's own copy of BOSS TONE STUDIO (see extract.js).
export function setDefs(defs) { GT = defs; }

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
      p.values[key] = size === 2 ? from14(p.image.get(o), p.image.get(o + 1)) : p.image.get(o);
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

  syncImage() {
    for (const [key, v] of Object.entries(this.values)) this.writeImage(key, v);
  }

  writeImage(key, v) {
    const [b2, b3, size] = GT.addr[key];
    const o = b2 * 128 + b3;
    if (size === 2) to14(v).forEach((b, i) => this.image.set(o + i, b));
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
    const data = size === 2 ? to14(v) : [v & 127];
    return [[...DEVICE.memory.temp, b2, b3], data];
  }

  // Whole patch as DT1 messages for a given 2-byte base (temp, user slot...)
  chunks(base = DEVICE.memory.temp) {
    return DEVICE.memory.writeChunks.map(([b2, b3, size]) => {
      const start = b2 * 128 + b3;
      const data = [];
      for (let i = 0; i < size; i++) data.push(this.image.get(start + i) ?? 0);
      const a = intToAddr(addrToInt([...base, 0, 0]) + start);
      return [a, data];
    });
  }

  get name() {
    return DEVICE.patch.nameKeys.map((k) => String.fromCharCode(this.get(k) || 32)).join('').replace(/\s+$/, '');
  }

  set name(s) {
    const len = DEVICE.patch.nameKeys.length;
    const padded = (s || '').slice(0, len).padEnd(len, ' ');
    DEVICE.patch.nameKeys.forEach((k, i) => {
      let c = padded.charCodeAt(i);
      if (c < 32 || c > 126) c = 32;
      this.set(k, c);
    });
  }

  toTslParams() {
    const out = { ...this.values };
    // .tsl files also carry split _h/_l bytes for two-byte values
    for (const [key, [, , size]] of Object.entries(GT.addr)) {
      if (size === 2) [out[key + '_h'], out[key + '_l']] = to14(this.get(key));
    }
    out.chainParams = { positionList: chainOf(this) };
    return out;
  }
}

export const chainOf = (patch) => DEVICE.patch.chainKeys.map((k) => patch.get(k));

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
export function buildTsl(patches, name = `${DEVICE.name} export`) {
  return {
    device: DEVICE.tslDevice,
    patchList: patches.map((p, i) => ({
      name: p.name, id: String(i + 1), orderNumber: i + 1, category: '', category2: '', note: '',
      params: p.toTslParams(),
    })),
    liveSetData: { name, id: null, orderNumber: 1, path: null, url: null, image: null },
    version: '1.0.0',
  };
}
