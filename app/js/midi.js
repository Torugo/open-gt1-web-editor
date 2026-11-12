// Web MIDI + Roland SysEx transport. Device-neutral: the model ID and MIDI port names come from
// the active profile (device.js).
// Message format (from the original app's SystemExclusive class):
//   F0 41 <dev> <model id x4> <cmd> <addr x4> <data | size x4> <checksum> F7
//   cmd 11 = RQ1 (request data), 12 = DT1 (data set)
import { DEVICE } from './device.js';

const ROLAND = 0x41;
const RQ1 = 0x11;
const DT1 = 0x12;

export function checksum(bytes) {
  const sum = bytes.reduce((a, b) => a + b, 0);
  return (128 - (sum % 128)) % 128;
}

// 4-byte 7-bit address <-> integer
export const addrToInt = (a) => ((a[0] * 128 + a[1]) * 128 + a[2]) * 128 + a[3];
export const intToAddr = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
// 14-bit value <-> two 7-bit bytes (high, low): patch numbers and two-byte parameters
export const to14 = (n) => [(n >> 7) & 127, n & 127];
export const from14 = (hi, lo = 0) => hi * 128 + lo;

export class RolandMidi extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.input = null;
    this.output = null;
    this.deviceId = 0x10;
    this.pending = []; // requests waiting for data: {start, end, got, resolve, reject, timer, idle}
    this.log = () => {};
  }

  static supported() {
    return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
  }

  async init() {
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.access.onstatechange = () => this.dispatchEvent(new Event('ports'));
    return this.ports();
  }

  ports() {
    const ins = [...this.access.inputs.values()];
    const outs = [...this.access.outputs.values()];
    return { ins, outs };
  }

  // Pick the device's ports automatically when their names say so.
  guessPorts() {
    const { ins, outs } = this.ports();
    const { portName, portAvoid } = DEVICE;
    const pick = (list) => list.find((p) => portName.test(p.name) && !(portAvoid && portAvoid.test(p.name))) || list.find((p) => portName.test(p.name));
    return { input: pick(ins), output: pick(outs) };
  }

  select(input, output) {
    if (this.input) this.input.onmidimessage = null;
    this.input = input;
    this.output = output;
    if (input) input.onmidimessage = (e) => this.onMessage(e.data);
  }

  sendRaw(bytes) {
    if (!this.output) throw new Error('No MIDI output selected');
    this.log('out', bytes);
    this.output.send(bytes);
  }

  build(cmd, addr, payload) {
    const body = [...addr, ...payload];
    return [0xf0, ROLAND, this.deviceId, ...DEVICE.modelId, cmd, ...body, checksum(body), 0xf7];
  }

  dt1(addr, data) {
    this.sendRaw(this.build(DT1, addr, data));
  }

  // Request `size` bytes at `addr`; resolves with a Map(int address -> byte)
  // once every requested byte has arrived (the unit may answer in several packets).
  rq1(addr, size, timeoutMs = 3000) {
    const start = addrToInt(addr);
    return new Promise((resolve, reject) => {
      const req = { start, end: start + size, got: new Map(), resolve, reject };
      req.timer = setTimeout(() => {
        this.pending = this.pending.filter((p) => p !== req);
        if (req.got.size) resolve(req.got);
        else reject(new Error(`Timed out waiting for the ${DEVICE.name} to reply`));
      }, timeoutMs);
      this.pending.push(req);
      // the size is written like an address: a 4-byte 7-bit number
      try { this.sendRaw(this.build(RQ1, addr, intToAddr(size))); } catch (e) {
        clearTimeout(req.timer);
        this.pending = this.pending.filter((p) => p !== req);
        reject(e);
      }
    });
  }

  identity(timeoutMs = 1500) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { this.removeEventListener('identity', h); resolve(null); }, timeoutMs);
      const h = (e) => { clearTimeout(t); this.removeEventListener('identity', h); resolve(e.detail); };
      this.addEventListener('identity', h);
      this.sendRaw([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
    });
  }

  onMessage(data) {
    const d = [...data];
    this.log('in', d);
    // Identity reply: F0 7E dev 06 02 41 ...
    if (d[0] === 0xf0 && d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x02) {
      if (d[5] === ROLAND) this.deviceId = d[2];
      this.dispatchEvent(new CustomEvent('identity', { detail: { deviceId: d[2], bytes: d } }));
      return;
    }
    // Model IDs differ in length between BOSS units, so the command byte position depends on it.
    const model = DEVICE.modelId;
    const cmdAt = 3 + model.length;
    if (d[0] !== 0xf0 || d[1] !== ROLAND || d[cmdAt] !== DT1) return;
    if (model.some((b, i) => d[3 + i] !== b)) return;
    const addr = d.slice(cmdAt + 1, cmdAt + 5);
    const payload = d.slice(cmdAt + 5, d.length - 2);
    const start = addrToInt(addr);
    const map = new Map();
    payload.forEach((b, i) => map.set(start + i, b));

    let consumed = false;
    for (const req of [...this.pending]) {
      if (start < req.end && start + payload.length > req.start) {
        consumed = true;
        map.forEach((v, k) => { if (k >= req.start && k < req.end) req.got.set(k, v); });
        const finish = () => {
          clearTimeout(req.timer); clearTimeout(req.idle);
          this.pending = this.pending.filter((p) => p !== req);
          req.resolve(req.got);
        };
        if (req.got.size >= req.end - req.start) finish();
        else { clearTimeout(req.idle); req.idle = setTimeout(finish, 400); }
      }
    }
    // Unsolicited DT1: the user turned a knob or changed patch on the unit.
    if (!consumed) this.dispatchEvent(new CustomEvent('dt1', { detail: { start, bytes: map } }));
  }
}
