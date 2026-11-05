// Reads the GT-1 parameter table and factory presets out of the user's own copy of
// BOSS TONE STUDIO for GT-1. Nothing from Roland is shipped with this app.
//
// Accepted input (any mix): Roland's download zip (bts_gt1_w102.zip), the installer .exe
// (it is a zip archive inside), the installed program folder, or the .swf / .tsl files.
//
// This is a JavaScript port of tools/disasm.py + tools/evalcinit.py + tools/build_defs.py.

const SWF_NAME = /BOSS_TONE_STUDIO_for_GT1\.swf$/i;
const TSL_NAME = /gt_preset_patches\.tsl$/i;

// ------------------------------------------------------------------ inflate helpers
async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ------------------------------------------------------------------ minimal zip reader
// Works for zips with data prepended (like the AIR installer .exe).
function zipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const shift = eocd - cdSize - cdOffset; // bytes prepended before the zip
  const out = [];
  let p = eocd - cdSize;
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true) + shift;
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, csize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function zipRead(buf, entry) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const start = entry.local + 30 + dv.getUint16(entry.local + 26, true) + dv.getUint16(entry.local + 28, true);
  const data = buf.subarray(start, start + entry.csize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflate(data, 'deflate-raw');
  throw new Error(`Unsupported zip compression in ${entry.name}`);
}

// Look through files (and archives inside archives) for the .swf and the preset .tsl.
export async function findRolandFiles(files, onStatus = () => {}) {
  const found = { swf: null, tsl: null };
  async function visit(name, getBytes, depth) {
    if (found.swf && found.tsl) return;
    if (SWF_NAME.test(name) && !found.swf) { onStatus(`Reading ${name}…`); found.swf = await getBytes(); return; }
    if (TSL_NAME.test(name) && !found.tsl) { found.tsl = await getBytes(); return; }
    if (depth < 3 && /\.(zip|exe|air)$/i.test(name)) {
      onStatus(`Opening ${name.split('/').pop()}…`);
      const buf = await getBytes();
      const entries = zipEntries(buf);
      if (!entries) return;
      for (const e of entries) await visit(e.name, () => zipRead(buf, e), depth + 1);
    }
  }
  for (const f of files) {
    await visit(f.webkitRelativePath || f.name, async () => new Uint8Array(await f.arrayBuffer()), 0);
  }
  return found;
}

// ------------------------------------------------------------------ SWF / ABC parsing
async function swfBody(swf) {
  const sig = String.fromCharCode(swf[0], swf[1], swf[2]);
  if (sig === 'FWS') return swf.subarray(8);
  if (sig === 'CWS') return inflate(swf.subarray(8), 'deflate');
  throw new Error('This does not look like the BOSS TONE STUDIO .swf file');
}

function abcBlocks(body) {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const nbits = body[0] >> 3;
  let pos = Math.ceil((5 + nbits * 4) / 8) + 4;
  const out = [];
  while (pos < body.length) {
    const tc = dv.getUint16(pos, true); pos += 2;
    const code = tc >> 6;
    let len = tc & 0x3f;
    if (len === 0x3f) { len = dv.getUint32(pos, true); pos += 4; }
    if (code === 82) {
      let e = pos + 4;
      while (body[e] !== 0) e++;
      out.push(body.subarray(e + 1, pos + len));
    }
    pos += len;
    if (code === 0) break;
  }
  return out;
}

class Reader {
  constructor(b) { this.b = b; this.p = 0; this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.b[this.p++]; }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  s24() { let v = this.b[this.p] | (this.b[this.p + 1] << 8) | (this.b[this.p + 2] << 16); this.p += 3; return v & 0x800000 ? v - 0x1000000 : v; }
  u30() { let r = 0, sh = 0; for (;;) { const x = this.u8(); r += (x & 0x7f) * 2 ** sh; sh += 7; if (!(x & 0x80) || sh >= 35) return r; } }
  s32() {
    let r = 0, sh = 0;
    for (;;) { const x = this.u8(); r += (x & 0x7f) * 2 ** sh; sh += 7; if (!(x & 0x80) || sh >= 35) break; }
    if (sh < 35 && r >= 2 ** (sh - 1)) r -= 2 ** sh;
    return r >= 2 ** 31 ? r - 2 ** 32 : r;
  }
  d64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
}

// Operand layouts of the AVM2 opcodes we need to step over / understand
const OPS = (() => {
  const t = {};
  const set = (codes, name, args = []) => { for (const c of [].concat(codes)) t[c] = [typeof name === 'function' ? name(c) : name, args]; };
  const none = { 0x01: 'bkpt', 0x02: 'nop', 0x03: 'throw', 0x07: 'dxnslate', 0x09: 'label', 0x1c: 'pushwith', 0x1d: 'popscope', 0x1e: 'nextname', 0x1f: 'hasnext', 0x20: 'pushnull', 0x21: 'pushundefined', 0x23: 'nextvalue', 0x26: 'pushtrue', 0x27: 'pushfalse', 0x28: 'pushnan', 0x29: 'pop', 0x2a: 'dup', 0x2b: 'swap', 0x30: 'pushscope', 0x47: 'returnvoid', 0x48: 'returnvalue', 0x57: 'newactivation', 0x64: 'getglobalscope', 0x87: 'astypelate', 0xf3: 'timestamp', 0x90: 'negate', 0xd0: 'getlocal0', 0xd1: 'getlocal1', 0xd2: 'getlocal2', 0xd3: 'getlocal3', 0xd4: 'setlocal0', 0xd5: 'setlocal1', 0xd6: 'setlocal2', 0xd7: 'setlocal3' };
  const ranges = [[0x35, 0x3e], [0x50, 0x52], [0x70, 0x78], [0x81, 0x85], [0x88, 0x89], [0x90, 0xb4], [0xc0, 0xc7], [0xd0, 0xd7]];
  for (const [a, b] of ranges) for (let c = a; c <= b; c++) set(c, (x) => none[x] || `op_${x.toString(16)}`);
  for (const [c, n] of Object.entries(none)) set(+c, n);
  for (const [c, n] of [[0x04, 'getsuper'], [0x05, 'setsuper'], [0x59, 'getdescendants'], [0x5d, 'findpropstrict'], [0x5e, 'findproperty'], [0x5f, 'finddef'], [0x60, 'getlex'], [0x61, 'setproperty'], [0x66, 'getproperty'], [0x68, 'initproperty'], [0x6a, 'deleteproperty'], [0x80, 'coerce'], [0x86, 'astype'], [0xb2, 'istype']]) set(c, n, ['mn']);
  for (const [c, n] of [[0x06, 'dxns'], [0x08, 'kill'], [0x25, 'pushshort'], [0x31, 'pushnamespace'], [0x40, 'newfunction'], [0x41, 'call'], [0x42, 'construct'], [0x49, 'constructsuper'], [0x53, 'applytype'], [0x55, 'newobject'], [0x56, 'newarray'], [0x58, 'newclass'], [0x5a, 'newcatch'], [0x62, 'getlocal'], [0x63, 'setlocal'], [0x6c, 'getslot'], [0x6d, 'setslot'], [0x6e, 'getglobalslot'], [0x6f, 'setglobalslot'], [0x92, 'inclocal'], [0x94, 'declocal'], [0xc2, 'inclocal_i'], [0xc3, 'declocal_i'], [0xf0, 'debugline'], [0xf2, 'bkptline']]) set(c, n, ['u30']);
  set(0x2c, 'pushstring', ['str']); set(0x2d, 'pushint', ['int']); set(0x2e, 'pushuint', ['uint']); set(0x2f, 'pushdouble', ['dbl']);
  set(0x24, 'pushbyte', ['s8']); set(0x65, 'getscopeobject', ['u8']); set(0xf1, 'debugfile', ['str']);
  set([0x43, 0x44], (c) => (c === 0x43 ? 'callmethod' : 'callstatic'), ['u30', 'u30']);
  for (const [c, n] of [[0x45, 'callsuper'], [0x46, 'callproperty'], [0x4a, 'constructprop'], [0x4c, 'callproplex'], [0x4e, 'callsupervoid'], [0x4f, 'callpropvoid']]) set(c, n, ['mn', 'u30']);
  set(0x32, 'hasnext2', ['u30', 'u30']);
  set(0xef, 'debug', ['u8', 'u30', 'u8', 'u30']);
  ['ifnlt', 'ifnle', 'ifngt', 'ifnge', 'jump', 'iftrue', 'iffalse', 'ifeq', 'ifne', 'iflt', 'ifle', 'ifgt', 'ifge', 'ifstricteq', 'ifstrictne'].forEach((n, i) => set(0x0c + i, n, ['s24']));
  return t;
})();

// Parse one ABC block; returns { bodies: Map(ownerName -> code bytes), decode(code) }
function parseAbc(a) {
  const r = new Reader(a);
  r.u16(); r.u16();
  const cnt = () => Math.max(r.u30() - 1, 0);
  const ints = [0]; for (let i = cnt(); i--;) ints.push(r.s32());
  const uints = [0]; for (let i = cnt(); i--;) uints.push(r.u30());
  const dbls = [0]; for (let i = cnt(); i--;) dbls.push(r.d64());
  const strs = [null];
  const td = new TextDecoder();
  for (let i = cnt(); i--;) { const l = r.u30(); strs.push(td.decode(a.subarray(r.p, r.p + l))); r.p += l; }
  for (let i = cnt(); i--;) { r.u8(); r.u30(); }               // namespaces
  for (let i = cnt(); i--;) { for (let n = r.u30(); n--;) r.u30(); } // ns sets
  const mns = [null];
  for (let i = cnt(); i--;) {
    const k = r.u8();
    if (k === 0x07 || k === 0x0d) { r.u30(); mns.push(strs[r.u30()] || '*'); }
    else if (k === 0x0f || k === 0x10) mns.push(strs[r.u30()]);
    else if (k === 0x11 || k === 0x12) mns.push('[rtl]');
    else if (k === 0x09 || k === 0x0e) { const nm = r.u30(); r.u30(); mns.push(strs[nm]); }
    else if (k === 0x1b || k === 0x1c) { r.u30(); mns.push('[late]'); }
    else if (k === 0x1d) { const q = r.u30(); for (let n = r.u30(); n--;) r.u30(); mns.push({ q }); }
    else throw new Error('Unknown multiname kind ' + k);
  }
  const mn = (i) => { const v = mns[i]; return v && typeof v === 'object' ? mn(v.q) : v ?? '?'; };
  const nMeth = r.u30();
  for (let i = 0; i < nMeth; i++) {
    const pc = r.u30(); r.u30();
    for (let n = pc; n--;) r.u30();
    r.u30();
    const fl = r.u8();
    if (fl & 0x08) for (let n = r.u30(); n--;) { r.u30(); r.u8(); }
    if (fl & 0x80) for (let n = pc; n--;) r.u30();
  }
  for (let i = r.u30(); i--;) { r.u30(); const n = r.u30(); for (let j = 2 * n; j--;) r.u30(); }
  const owner = new Map();
  const traits = (who) => {
    for (let n = r.u30(); n--;) {
      const name = mn(r.u30()); const kind = r.u8(); const t = kind & 0xf;
      if (t === 0 || t === 6) { r.u30(); r.u30(); if (r.u30()) r.u8(); }
      else if (t >= 1 && t <= 3) { r.u30(); owner.set(r.u30(), `${who}::${name}`); }
      else if (t === 4 || t === 5) { r.u30(); r.u30(); }
      if (kind & 0x40) for (let m = r.u30(); m--;) r.u30();
    }
  };
  const nCls = r.u30();
  const inst = [];
  for (let i = 0; i < nCls; i++) {
    const name = mn(r.u30()); r.u30(); const fl = r.u8();
    if (fl & 0x08) r.u30();
    for (let n = r.u30(); n--;) r.u30();
    owner.set(r.u30(), `${name}::<init>`);
    inst.push(name);
    traits(name);
  }
  for (let i = 0; i < nCls; i++) { owner.set(r.u30(), `${inst[i]}::<cinit>`); traits(inst[i] + '$'); }
  for (let i = r.u30(), s = 0; s < i; s++) { r.u30(); traits('script'); }
  const bodies = new Map();
  for (let i = r.u30(); i--;) {
    const m = r.u30(); r.u30(); r.u30(); r.u30(); r.u30();
    const cl = r.u30(); const code = a.subarray(r.p, r.p + cl); r.p += cl;
    for (let n = r.u30(); n--;) for (let k = 5; k--;) r.u30();
    traits('body');
    const who = owner.get(m);
    if (who) bodies.set(who, code);
  }
  const decode = (code) => {
    const c = new Reader(code); const out = [];
    while (c.p < code.length) {
      const o = c.u8();
      if (o === 0x1b) { c.s24(); const n = c.u30(); for (let k = 0; k <= n; k++) c.s24(); out.push({ op: 'lookupswitch', args: [] }); continue; }
      const spec = OPS[o];
      if (!spec) throw new Error('Unknown opcode 0x' + o.toString(16));
      const args = spec[1].map((k) => {
        switch (k) {
          case 'mn': return mn(c.u30());
          case 'u30': return c.u30();
          case 'str': return strs[c.u30()];
          case 'int': return ints[c.u30()];
          case 'uint': return uints[c.u30()];
          case 'dbl': return dbls[c.u30()];
          case 's8': { const v = c.u8(); return v > 127 ? v - 256 : v; }
          case 'u8': return c.u8();
          case 's24': return c.s24();
          default: return null;
        }
      });
      out.push({ op: spec[0], args });
    }
    return out;
  };
  return { bodies, decode };
}

// Replay a static initializer and collect the constants it builds.
function evalCinit(code) {
  const statics = {}; const st = [];
  for (const { op, args } of code) {
    switch (op) {
      case 'pushstring': case 'pushint': case 'pushuint': case 'pushdouble': case 'pushbyte': case 'pushshort': st.push(args[0]); break;
      case 'pushtrue': st.push(true); break;
      case 'pushfalse': st.push(false); break;
      case 'pushnull': st.push(null); break;
      case 'negate': st.push(-st.pop()); break;
      case 'newobject': { const n = args[0]; const items = st.splice(st.length - 2 * n, 2 * n); const o = {}; for (let i = 0; i < items.length; i += 2) o[items[i]] = items[i + 1]; st.push(o); break; }
      case 'newarray': { const n = args[0]; st.push(n ? st.splice(st.length - n, n) : []); break; }
      case 'getlex': st.push(args[0] in statics ? statics[args[0]] : { $ref: args[0] }); break;
      case 'findproperty': case 'findpropstrict': st.push({ $scope: args[0] }); break;
      case 'initproperty': case 'setproperty': { const v = st.pop(); const o = st.pop(); if (o && o.$scope) statics[args[0]] = v; break; }
      case 'callproperty': case 'constructprop': { const n = args[1]; const a = n ? st.splice(st.length - n, n) : []; st.pop(); st.push({ $call: args[0], args: a }); break; }
      case 'getlocal0': case 'pushscope': case 'returnvoid': case 'coerce': case 'convert_i': case 'convert_d': case 'coerce_a': case 'debugline': case 'debugfile': case 'debug': break;
      default: st.push({ $unk: op });
    }
  }
  return statics;
}

// Lists the original app generates at runtime with helper functions
const GENERATED = {
  createMixerChBalanceList: [...Array.from({ length: 50 }, (_, i) => `100:${i * 2}`), ...Array.from({ length: 51 }, (_, i) => `${100 - i * 2}:100`)],
  createReverbTimeList: Array.from({ length: 100 }, (_, i) => `${((i + 1) / 10).toFixed(1)}s`),
  createChorusPreDelayList: Array.from({ length: 81 }, (_, i) => `${(i * 0.5).toFixed(1)}ms`),
  createNSThresholdList: ['OFF', ...Array.from({ length: 100 }, (_, i) => String(i + 1))],
};
const resolve = (x) => {
  if (Array.isArray(x)) return x.map(resolve);
  if (x && typeof x === 'object') {
    if (x.$call) return GENERATED[x.$call];
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, resolve(v)]));
  }
  return x;
};

// Byte offset of every patch parameter, from TemporaryParams.setData's switch
function patchOffsets(code) {
  const offsets = {};
  for (let i = 0; i < code.length - 5; i++) {
    if (code[i].op === 'getlocal1' && /^push(byte|short|int)$/.test(code[i + 1].op) && code[i + 2].op === 'ifne') {
      for (let j = i + 3; j < i + 7; j++) {
        if (code[j].op === 'initproperty') { if (!(code[j].args[0] in offsets)) offsets[code[j].args[0]] = code[i + 1].args[0]; break; }
      }
    }
  }
  const addr = {};
  for (const [key, off] of Object.entries(offsets)) {
    const base = key.slice(0, -2);
    if (key.endsWith('_l') && offsets[base + '_h'] !== undefined) continue;
    if (key.endsWith('_h') && offsets[base + '_l'] !== undefined) addr[base] = [off >> 8, off & 0xff, 2];
    else addr[key] = [off >> 8, off & 0xff, 1];
  }
  return addr;
}

export async function buildDefsFromSwf(swfBytes) {
  const body = await swfBody(swfBytes);
  let cinit = null; let setData = null;
  for (const block of abcBlocks(body)) {
    const abc = parseAbc(block);
    if (abc.bodies.has('ParameterDefinitionGT::<cinit>')) cinit = abc.decode(abc.bodies.get('ParameterDefinitionGT::<cinit>'));
    if (abc.bodies.has('TemporaryParams::setData')) setData = abc.decode(abc.bodies.get('TemporaryParams::setData'));
  }
  if (!cinit || !setData) throw new Error('Could not find the GT-1 parameter tables in this file');
  const defs = resolve(evalCinit(cinit));
  const addr = patchOffsets(setData);
  if (Object.keys(addr).length < 900 || !defs.FX1_TYPE) throw new Error('The parameter tables look incomplete');
  return { source: 'BOSS TONE STUDIO for GT-1 (extracted in the browser)', addr, defs };
}

export function parsePresets(tslBytes) {
  const j = JSON.parse(new TextDecoder().decode(tslBytes));
  return j.patchList.map((p) => ({ name: p.name, category: p.category, params: p.params }));
}
