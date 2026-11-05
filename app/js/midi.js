// Web MIDI + Roland SysEx transport for the BOSS GT-1.
// Message format (from the original app's SystemExclusive class):
//   F0 41 <dev> 00 00 00 30 <cmd> <addr x4> <data | size x4> <checksum> F7
//   cmd 11 = RQ1 (request data), 12 = DT1 (data set)

const ROLAND = 0x41;
const MODEL = [0x00, 0x00, 0x00, 0x30];
const RQ1 = 0x11;
const DT1 = 0x12;

export function checksum(bytes) {
  const sum = bytes.reduce((a, b) => a + b, 0);
  return (128 - (sum % 128)) % 128;
}

// 4-byte 7-bit address <-> integer
export const addrToInt = (a) => ((a[0] * 128 + a[1]) * 128 + a[2]) * 128 + a[3];
export const intToAddr = (n) => [(n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];

export class GT1Midi extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.input = null;
    this.output = null;
    this.deviceId = 0x10;
    this.pending = []; // {start, end, resolve, timer, received}
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

  // Pick the GT-1 ports automatically when their names say so.
  guessPorts() {
    const { ins, outs } = this.ports();
    const pick = (list) => list.find((p) => /GT-1/i.test(p.name) && !/CTRL|DAW/i.test(p.name)) || list.find((p) => /GT-1/i.test(p.name));
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
    return [0xf0, ROLAND, this.deviceId, ...MODEL, cmd, ...body, checksum(body), 0xf7];
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
        else reject(new Error('Timed out waiting for GT-1 reply'));
      }, timeoutMs);
      this.pending.push(req);
      this.sendRaw(this.build(RQ1, addr, intToAddr7Size(size)));
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

  programChange(channel, program) {
    this.sendRaw([0xc0 | (channel & 15), program & 127]);
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
    if (d[0] !== 0xf0 || d[1] !== ROLAND || d[7] !== DT1) {
      if ((d[0] & 0xf0) === 0xc0) this.dispatchEvent(new CustomEvent('program', { detail: d[1] }));
      return;
    }
    if (d[3] !== MODEL[0] || d[4] !== MODEL[1] || d[5] !== MODEL[2] || d[6] !== MODEL[3]) return;
    const addr = d.slice(8, 12);
    const payload = d.slice(12, d.length - 2);
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

// Sizes in RQ1 are written as 7-bit 4-byte numbers.
function intToAddr7Size(n) {
  return intToAddr(n);
}
