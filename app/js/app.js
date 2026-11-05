import { GT1Midi, addrToInt } from './midi.js';
import * as store from './store.js';
import { findRolandFiles, buildDefsFromSwf, parsePresets } from './extract.js';
import { createVirtualGT1, scratchPresets } from './demo.js';
import { buildDemoDefs, demoParamDefs, DEMO_SWITCHES, DEMO_TYPE_KEYS } from './demo-defs.js';
import { GT, setDefs, Patch, READ_BLOCKS, READ_SIZE, TEMP_BASE, chainOf, buildTsl, fromDisplay } from './model.js';
import { BLOCKS, BLOCK_BY_CHAIN, typeList, typeName, subInfo, paramDefs, dropdownFor, stepperFor, stepperSplit, labelOf, isEnabled, pretty } from './blocks.js';

const $ = (s) => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CMD_EDITOR_LEVEL = [0x7f, 0, 0, 0];
const CMD_EDITOR_MODE = [0x7f, 0, 0, 1];
const CMD_PATCH_WRITE = [0x7f, 0, 1, 4];
const SETUP_PATCH_NO = [0, 1, 0, 0];
const TEMP_START = addrToInt([...TEMP_BASE, 0, 0]);
const TEMP_END = TEMP_START + 24 * 128;

const state = {
  patch: null,
  source: { kind: 'none', label: '—' },
  block: 'preA',
  connected: false,
  tab: 'user',
  userNames: [],          // GT-1 user memories U01-U99
  factory: [],            // [{name, category, params}]
  file: [],               // patches from an imported .tsl
  fileName: '',
  activeKnob: null,
};
const midi = new GT1Midi();

// ---------------------------------------------------------------- toast & log
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.className = 'toast'), err ? 6000 : 2500);
}
const logLines = [];
midi.log = (dir, bytes) => {
  if (!$('#chkLog').checked) return;
  logLines.push(`${dir === 'out' ? '→' : '←'} ${bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
  if (logLines.length > 300) logLines.splice(0, logLines.length - 300);
  $('#midiLog').textContent = logLines.join('\n');
};

function setConn(kind, text) {
  $('#connDot').className = 'dot ' + kind;
  $('#connText').textContent = text;
  $('#btnWrite').disabled = !state.connected;
  $('#btnConnect').textContent = state.connected && !state.demo ? 'Re-sync' : 'Connect GT-1';
  $('#btnDemo').textContent = state.demo ? 'New demo' : 'Try demo';
  document.body.classList.toggle('demo', !!state.demo);
}
function connLabel() {
  return state.demo ? 'Demo (simulated)' : 'Connected';
}

// ---------------------------------------------------------------- knob widget
function knob({ value, min, max, onInput, label }) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 60 60');
  svg.setAttribute('class', 'knob');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-label', label);
  const arcPath = (a0, a1) => {
    const r = 24, cx = 30, cy = 30;
    const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); svg.append(n); return n; };
  mk('path', { d: arcPath(A0, A1), class: 'track', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
  const arc = mk('path', { class: 'arc', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' });
  mk('circle', { cx: 30, cy: 30, r: 17, class: 'cap', 'stroke-width': 1.5 });
  const ptr = mk('line', { x1: 30, y1: 30, x2: 30, y2: 16, class: 'ptr', 'stroke-width': 3, 'stroke-linecap': 'round' });
  let v = value;
  const draw = () => {
    const f = max > min ? (v - min) / (max - min) : 0;
    const a = A0 + f * (A1 - A0);
    arc.setAttribute('d', f > 0.002 ? arcPath(A0, a) : '');
    ptr.setAttribute('x2', 30 + 13 * Math.cos(a)); ptr.setAttribute('y2', 30 + 13 * Math.sin(a));
    svg.setAttribute('aria-valuenow', v);
  };
  const set = (nv) => {
    nv = Math.max(min, Math.min(max, Math.round(nv)));
    if (nv !== v) { v = nv; draw(); onInput(v); }
  };
  svg.setAttribute('aria-valuemin', min); svg.setAttribute('aria-valuemax', max);
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); svg.focus();
    drag = { y: e.clientY, v }; state.activeKnob = svg;
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const per = (max - min) / (e.shiftKey ? 600 : 150);
    set(drag.v + (drag.y - e.clientY) * Math.max(per, e.shiftKey ? 0.05 : 0.12));
  });
  const end = () => { drag = null; state.activeKnob = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); set(v + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const big = Math.max(1, Math.round((max - min) / 10));
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: big, PageDown: -big };
    if (e.key in map) { e.preventDefault(); set(v + map[e.key]); }
    if (e.key === 'Home') set(min);
    if (e.key === 'End') set(max);
  });
  draw();
  svg.update = (nv) => { v = nv; draw(); };
  return svg;
}

// ---------------------------------------------------------------- editing
function changeParam(key, raw, { rerender = false } = {}) {
  if (!state.patch) return;
  state.patch.set(key, raw);
  if (state.connected) queueSend(key);
  if (rerender) render(); else renderChain();
}

// Coalesce fast knob movements: send the latest value of each key at most every ~25 ms.
const sendQueue = new Set();
let sendTimer = null;
function queueSend(key) {
  sendQueue.add(key);
  if (!sendTimer) sendTimer = setTimeout(flushSend, 25);
}
function flushSend() {
  sendTimer = null;
  for (const key of sendQueue) {
    const [addr, data] = state.patch.paramMessage(key);
    try { midi.dt1(addr, data); } catch (e) { toast(e.message, true); }
  }
  sendQueue.clear();
}

function control(def, block) {
  const p = state.patch;
  const raw = p.get(def.id);
  const valEl = el('div', { class: 'val' }, labelOf(def, raw));
  const update = (r, opts) => { valEl.textContent = labelOf(def, r); changeParam(def.id, r, opts); };
  const st = stepperFor(def.id);
  const dd = dropdownFor(def.id);
  let widget;
  if (st) {
    // numeric knob + dropdown for OFF / tempo-synced note values
    const split = stepperSplit(st, raw);
    const sel = el('select', { 'aria-label': def.name + ' mode' },
      st.dropdown.map((o, i) => el('option', { value: i, selected: split.numeric ? i === st.stepperIndex : o.val === raw }, o.name)));
    const k = knob({ value: split.numeric ? split.number : st.min, min: st.min, max: st.max, label: def.name,
      onInput: (n) => { sel.value = st.stepperIndex; update(n + split.offset); } });
    sel.addEventListener('change', () => {
      const i = +sel.value;
      update(i === st.stepperIndex ? st.min + split.offset : st.dropdown[i].val);
      if (i === st.stepperIndex) k.update(st.min);
    });
    widget = el('div', { class: 'stepdd' }, k, sel);
  } else if (dd) {
    const maxRaw = fromDisplay(def, def.max);
    const sel = el('select', { 'aria-label': def.name, onchange: (e) => update(+e.target.value, { rerender: true }) },
      dd.slice(0, maxRaw + 1).map((name, i) => el('option', { value: i, selected: i === raw }, name)));
    return el('div', { class: 'ctrl' }, el('div', { class: 'name' }, def.name), sel);
  } else {
    widget = knob({ value: raw, min: fromDisplay(def, def.min), max: fromDisplay(def, def.max), label: def.name, onInput: (r) => update(r) });
  }
  return el('div', { class: 'ctrl' }, el('div', { class: 'name' }, def.name), widget, valEl);
}

function renderPanel() {
  const panel = $('#panel');
  panel.replaceChildren();
  const p = state.patch;
  const b = BLOCKS.find((x) => x.id === state.block);
  if (!p) { panel.append(el('div', { class: 'empty' }, 'Pick a patch on the left, or connect your GT-1.')); return; }
  if (!b || b.fixed) { panel.append(el('div', { class: 'empty' }, 'This block has no settings.')); return; }

  const head = el('div', { class: 'panel-head' },
    el('span', { class: 'bar', style: `background:${b.color}` }), el('h3', {}, b.name));
  if (b.sw) {
    const cb = el('input', { type: 'checkbox', checked: p.get(b.sw) === 1, onchange: (e) => changeParam(b.sw, e.target.checked ? 1 : 0) });
    head.append(el('label', { class: 'switch' }, cb, 'On'));
  }
  const types = typeList(b);
  if (types) {
    const sel = el('select', { class: 'big', onchange: (e) => changeParam(b.type, +e.target.value, { rerender: true }) },
      types.map((t) => el('option', { value: t.val, selected: t.val === p.get(b.type) }, pretty(t.name))));
    head.append(el('label', { class: 'sel-wrap' }, 'Type', sel));
  }
  const sub = subInfo(b, p);
  if (sub) {
    const sel = el('select', { class: 'big', onchange: (e) => changeParam(sub.param, +e.target.value, { rerender: true }) },
      sub.list.map((t) => el('option', { value: t.val, selected: t.val === p.get(sub.param) }, t.name)));
    head.append(el('label', { class: 'sel-wrap' }, 'Sub type', sel));
  }
  panel.append(head);

  const defs = paramDefs(b, p).filter((d) => isEnabled(d, b, p));
  const grid = el('div', { class: 'params' }, defs.map((d) => control(d, b)));
  panel.append(defs.length ? grid : el('div', { class: 'empty' }, 'No adjustable parameters for this type.'));
}

// ---------------------------------------------------------------- chain
let dragFrom = null;
function renderChain() {
  const c = $('#chain');
  c.replaceChildren();
  const p = state.patch;
  if (!p) return;
  const order = chainOf(p);
  order.forEach((val, idx) => {
    const b = BLOCK_BY_CHAIN[val];
    if (!b) return;
    const on = b.sw ? p.get(b.sw) === 1 : true;
    const t = typeName(b, p);
    const node = el('div', {
      class: `blk${on ? '' : ' off'}${b.fixed ? ' fixed' : ''}${state.block === b.id ? ' sel' : ''}`,
      style: `--c:${b.color}`, draggable: 'true', title: b.name + (t ? ` · ${pretty(t)}` : ''),
      onclick: () => { if (!b.fixed) { state.block = b.id; render(); } },
      ondragstart: (e) => { dragFrom = idx; node.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: () => { dragFrom = null; node.classList.remove('dragging'); },
      ondragover: (e) => { e.preventDefault(); node.classList.add('drop-before'); },
      ondragleave: () => node.classList.remove('drop-before'),
      ondrop: (e) => { e.preventDefault(); node.classList.remove('drop-before'); moveChain(dragFrom, idx); },
    });
    if (b.sw) {
      node.append(el('span', { class: 'led', title: 'On/off', onclick: (e) => { e.stopPropagation(); changeParam(b.sw, on ? 0 : 1, { rerender: true }); } }));
    }
    node.append(el('span', {}, b.short));
    if (t && !b.fixed) node.append(el('span', { class: 't' }, pretty(t)));
    c.append(node);
  });
  // Master settings are not part of the chain order but edited the same way
  const m = BLOCKS.find((b) => b.id === 'master');
  c.append(el('div', { class: `blk master${state.block === 'master' ? ' sel' : ''}`, style: `--c:${m.color}`, title: 'Master settings',
    onclick: () => { state.block = 'master'; render(); } }, el('span', {}, 'MST'), el('span', { class: 't' }, 'MASTER')));
}

function moveChain(from, to) {
  if (from == null || from === to) return;
  const order = chainOf(state.patch);
  const [item] = order.splice(from, 1);
  order.splice(from < to ? to - 1 : to, 0, item);
  // Divider must come before Ch B start, which must come before the mixer
  const iDiv = order.indexOf(17), iB = order.indexOf(18), iMix = order.indexOf(19);
  if (!(iDiv < iB && iB < iMix)) { toast('Divider, channel B and mixer must stay in that order', true); return; }
  order.forEach((v, i) => state.patch.set(`fx_chain_position${i + 1}`, v));
  if (state.connected) midi.dt1([...TEMP_BASE, 0x07, 0x20], order);
  renderChain();
}

// ---------------------------------------------------------------- library
function renderLibrary() {
  const list = $('#libList');
  list.replaceChildren();
  const f = $('#libFilter').value.trim().toLowerCase();
  let items = [];
  let hint = '';
  if (state.tab === 'user') {
    items = state.userNames.map((name, i) => ({ no: `U${String(i + 1).padStart(2, '0')}`, name, i }));
    if (!state.connected) hint = 'Connect the GT-1 to see its user memories.';
    else if (!items.length) hint = 'Reading patch names…';
  } else if (state.tab === 'factory') {
    items = state.factory.map((p, i) => ({ no: `P${String(i + 1).padStart(2, '0')}`, name: p.name, cat: p.category, i }));
  } else {
    items = state.file.map((p, i) => ({ no: String(i + 1).padStart(2, '0'), name: p.name, cat: p.category, i }));
    hint = state.file.length ? state.fileName : 'Use “Import .tsl” to open a liveset file.';
  }
  $('#libHint').textContent = hint;
  for (const it of items) {
    if (f && !(`${it.no} ${it.name} ${it.cat || ''}`.toLowerCase().includes(f))) continue;
    const active = state.source.kind === state.tab && state.source.index === it.i;
    list.append(el('li', { class: active ? 'active' : '', onclick: () => pickPatch(state.tab, it.i) },
      el('span', { class: 'no' }, it.no), el('span', {}, it.name || '(empty)'), it.cat ? el('span', { class: 'cat' }, it.cat) : null));
  }
}

async function pickPatch(kind, i) {
  try {
    if (kind === 'user') {
      if (!state.connected) return;
      await selectUserPatch(i);
    } else {
      loadSeq++; // cancel any user-memory load still in progress
      const src = kind === 'factory' ? state.factory[i] : state.file[i];
      const patch = Patch.fromTsl(src.params);
      if (state.patch?.image) for (const [k, v] of state.patch.image) if (!patch.image.has(k)) patch.image.set(k, v);
      state.patch = patch;
      const no = String(i + 1).padStart(2, '0');
      state.source = { kind, index: i, label: kind === 'factory' ? (state.demoOnly ? `Sample ${no}` : `Factory P${no}`) : `File #${i + 1}` };
      render();
      if (state.connected) await sendWholePatch();
      toast(state.connected ? `Loaded “${patch.name}” into the GT-1 (not stored yet)` : `Loaded “${patch.name}”`);
    }
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- device
async function readTemp() {
  const image = new Map();
  for (const [b2, b3] of READ_BLOCKS) {
    const got = await midi.rq1([...TEMP_BASE, b2, b3], READ_SIZE);
    got.forEach((v, a) => image.set(a - TEMP_START, v));
  }
  return Patch.fromImage(image);
}

async function readUserPatchDirect(n) {
  const base = addrToInt([0x10 + (n >> 7), n & 127, 0, 0]);
  const image = new Map();
  for (const [b2, b3] of READ_BLOCKS) {
    const got = await midi.rq1([0x10 + (n >> 7), n & 127, b2, b3], READ_SIZE);
    got.forEach((v, a) => image.set(a - base, v));
  }
  return Patch.fromImage(image);
}

async function sendWholePatch() {
  for (const [addr, data] of state.patch.chunks()) { midi.dt1(addr, data); await sleep(15); }
}

// Each new patch pick bumps this; an older load that is still running then gives up,
// so fast clicking through the list always ends on the last patch clicked.
let loadSeq = 0;

async function selectUserPatch(n) {
  const my = ++loadSeq;
  setConn('busy', 'Loading…');
  midi.dt1(SETUP_PATCH_NO, [(n >> 7) & 127, n & 127]);
  await sleep(250);
  if (my !== loadSeq) return;
  let patch = await readTemp();
  if (my !== loadSeq) return;
  const expected = (state.userNames[n] || '').trim();
  if (expected && patch.name.trim() !== expected) {
    // The unit did not switch: read the memory directly and put it in the edit buffer.
    patch = await readUserPatchDirect(n);
    if (my !== loadSeq) return;
    state.patch = patch;
    await sendWholePatch();
    if (my !== loadSeq) return;
  }
  state.patch = patch;
  state.source = { kind: 'user', index: n, label: `GT-1 U${String(n + 1).padStart(2, '0')}` };
  setConn('on', connLabel());
  render();
}

async function readUserNames() {
  state.userNames = [];
  for (let n = 0; n < 99; n++) {
    try {
      const got = await midi.rq1([0x10 + (n >> 7), n & 127, 0, 0], 16, 1500);
      const base = addrToInt([0x10 + (n >> 7), n & 127, 0, 0]);
      let s = '';
      for (let i = 0; i < 16; i++) s += String.fromCharCode(got.get(base + i) || 32);
      state.userNames[n] = s.replace(/\s+$/, '');
    } catch { state.userNames[n] = '?'; }
    if (state.tab === 'user' && n % 10 === 9) renderLibrary();
  }
  renderLibrary();
}

// Demo mode: plug a simulated GT-1 into the same MIDI path the real one uses.
function startDemo() {
  if (!state.factory.length) { toast('Demo needs the factory presets from the setup step', true); return; }
  state.demo = true;
  const v = createVirtualGT1(state.factory);
  midi.select(v.input, v.output);
  connect();
}
function leaveDemo() {
  if (!state.demo) return;
  state.demo = false;
  state.connected = false;
  midi.select(null, null);
}

async function connect() {
  if (!state.demo && !GT1Midi.supported()) {
    toast('This browser has no Web MIDI. Use Chrome or Edge.', true); return;
  }
  try {
    setConn('busy', 'Connecting…');
    if (!midi.access && !state.demo) {
      await midi.init();
      midi.addEventListener('ports', fillPortSelects);
      midi.addEventListener('dt1', onDeviceData);
    }
    if (!midi.output) {
      const g = midi.guessPorts();
      if (!g.input || !g.output) {
        state.connected = false; setConn('off', 'No GT-1 found');
        openSettings();
        toast('GT-1 not found. Check the USB cable and driver, or pick the ports by hand.', true);
        return;
      }
      midi.select(g.input, g.output);
    }
    await midi.identity();
    await midi.rq1(CMD_EDITOR_LEVEL, 1, 1500).catch(() => null);
    midi.dt1(CMD_EDITOR_MODE, [1]);
    await sleep(50);
    const no = await midi.rq1(SETUP_PATCH_NO, 2, 1500).catch(() => null);
    state.patch = await readTemp();
    state.connected = true;
    let cur = null;
    if (no) { const v = [...no.values()]; cur = v[0] * 128 + (v[1] || 0); }
    state.source = cur != null && cur < 99 ? { kind: 'user', index: cur, label: `GT-1 U${String(cur + 1).padStart(2, '0')}` }
      : cur != null ? { kind: 'device', label: `GT-1 P${String(cur - 98).padStart(2, '0')}` } : { kind: 'device', label: 'GT-1' };
    setConn('on', connLabel());
    render();
    toast(state.demo ? 'Demo mode: a simulated GT-1 with 99 random patches. Nothing is sent to real hardware.' : `Connected to ${midi.output.name}`);
    readUserNames();
  } catch (e) {
    state.connected = false;
    setConn('off', 'Error');
    toast(e.message || String(e), true);
  }
}

// The unit tells us about changes made on its own panel.
let resyncTimer;
function onDeviceData(e) {
  const { start, bytes } = e.detail;
  if (start === addrToInt(SETUP_PATCH_NO)) {
    clearTimeout(resyncTimer);
    resyncTimer = setTimeout(async () => { state.patch = await readTemp(); state.source = { kind: 'device', label: 'GT-1' }; render(); }, 200);
    return;
  }
  if (start >= TEMP_START && start < TEMP_END && state.patch) {
    const image = new Map(state.patch.image);
    bytes.forEach((v, a) => image.set(a - TEMP_START, v));
    state.patch = Patch.fromImage(image);
    if (!state.activeKnob) render();
  }
}

// ---------------------------------------------------------------- settings dialog
function fillPortSelects() {
  if (!midi.access) return;
  const { ins, outs } = midi.ports();
  const fill = (sel, list, cur) => {
    sel.replaceChildren(...list.map((p) => el('option', { value: p.id, selected: cur && cur.id === p.id }, p.name)));
  };
  fill($('#selIn'), ins, midi.input || midi.guessPorts().input);
  fill($('#selOut'), outs, midi.output || midi.guessPorts().output);
}
async function openSettings() {
  if (GT1Midi.supported() && !midi.access) {
    try { await midi.init(); midi.addEventListener('ports', fillPortSelects); midi.addEventListener('dt1', onDeviceData); } catch (e) { toast(e.message, true); }
  }
  fillPortSelects();
  $('#settingsDlg').showModal();
}

// ---------------------------------------------------------------- files
function download(name, text) {
  const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
  document.body.append(a); a.click(); a.remove();
}

function importTsl(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!Array.isArray(j.patchList)) throw new Error('Not a BOSS TONE STUDIO .tsl file');
      if (j.device && j.device !== 'GT-1') toast(`This file is for ${j.device}; loading anyway`, true);
      state.file = j.patchList.filter((p) => p.params).map((p) => ({ name: p.name || nameFromParams(p.params), category: p.category || '', params: p.params }));
      state.fileName = file.name;
      state.tab = 'file';
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'file'));
      renderLibrary();
      toast(`${state.file.length} patches in ${file.name}`);
    } catch (e) { toast(e.message, true); }
  };
  r.readAsText(file);
}
const nameFromParams = (p) => Array.from({ length: 16 }, (_, i) => String.fromCharCode(p[`patch_name${i + 1}`] || 32)).join('').trim();

// ---------------------------------------------------------------- render all
function render() {
  $('#patchName').value = state.patch ? state.patch.name : '';
  $('#patchName').disabled = !state.patch;
  $('#patchSource').textContent = state.source.label;
  renderChain();
  renderPanel();
  renderLibrary();
}

// ---------------------------------------------------------------- Roland data setup
// Folders dropped onto the page: walk them, keeping only files we might need.
async function filesFromDrop(dt) {
  const out = [];
  const wanted = (n) => /\.(zip|exe|swf|tsl)$/i.test(n);
  const walk = (entry) => new Promise((resolve) => {
    if (entry.isFile) {
      if (!wanted(entry.name)) return resolve();
      entry.file((f) => { out.push(f); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const next = () => reader.readEntries(async (batch) => {
        if (!batch.length) { for (const e of all) await walk(e); resolve(); } else { all.push(...batch); next(); }
      }, () => resolve());
      next();
    } else resolve();
  });
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.length) for (const e of entries) await walk(e);
  else out.push(...[...dt.files].filter((f) => wanted(f.name)));
  return out;
}

function runSetup({ cancelable = false } = {}) {
  return new Promise((resolve) => {
    const dlg = $('#setupDlg');
    const status = $('#setupStatus');
    const say = (msg, err = false) => { status.textContent = msg; status.className = 'setup-status' + (err ? ' err' : ''); };
    say('');
    let busy = false;
    const process = async (files) => {
      if (busy || !files.length) return;
      busy = true;
      try {
        say('Looking for the GT-1 data…');
        const found = await findRolandFiles(files, say);
        if (!found.swf) throw new Error('Could not find BOSS_TONE_STUDIO_for_GT1.swf in what you picked. Try the BOSS download zip or the installed folder.');
        say('Reading the parameter list…');
        const defs = await buildDefsFromSwf(found.swf);
        const factory = found.tsl ? parsePresets(found.tsl) : [];
        const saved = (await store.set('defs', defs)) && (await store.set('factory', factory));
        say(`Done: ${Object.keys(defs.addr).length} parameters, ${factory.length} factory presets.` + (saved ? '' : ' (Could not save in this browser; you will need to do this again next time.)'));
        cleanup();
        dlg.close();
        resolve({ defs, factory });
      } catch (e) {
        console.error(e);
        say(e.message || String(e), true);
      } finally { busy = false; }
    };
    const onFiles = (e) => { process([...e.target.files]); e.target.value = ''; };
    const zone = $('#dropZone');
    const onOver = (e) => { e.preventDefault(); zone.classList.add('over'); };
    const onLeave = () => zone.classList.remove('over');
    const onDrop = async (e) => { e.preventDefault(); zone.classList.remove('over'); process(await filesFromDrop(e.dataTransfer)); };
    const onCancel = (e) => { if (!cancelable) e.preventDefault(); };
    const pickFile = () => $('#setupFiles').click();
    const pickFolder = () => $('#setupFolder').click();
    const tryDemo = () => { cleanup(); dlg.close(); resolve({ demo: true }); };
    const cleanup = () => {
      $('#setupFiles').removeEventListener('change', onFiles); $('#setupFolder').removeEventListener('change', onFiles);
      zone.removeEventListener('dragover', onOver); zone.removeEventListener('dragleave', onLeave); zone.removeEventListener('drop', onDrop);
      dlg.removeEventListener('cancel', onCancel);
      $('#btnPickFile').removeEventListener('click', pickFile); $('#btnPickFolder').removeEventListener('click', pickFolder);
      $('#btnSetupDemo').removeEventListener('click', tryDemo);
    };
    $('#setupFiles').addEventListener('change', onFiles); $('#setupFolder').addEventListener('change', onFiles);
    zone.addEventListener('dragover', onOver); zone.addEventListener('dragleave', onLeave); zone.addEventListener('drop', onDrop);
    dlg.addEventListener('cancel', onCancel);
    $('#btnPickFile').addEventListener('click', pickFile); $('#btnPickFolder').addEventListener('click', pickFolder);
    // Offered only on first run; from inside the demo the dialog is opened to import for real.
    $('#btnSetupDemo').hidden = cancelable;
    $('#btnSetupDemo').addEventListener('click', tryDemo);
    dlg.addEventListener('close', cleanup, { once: true }); // also when dismissed with Esc
    dlg.showModal();
  });
}

async function loadRolandData() {
  let defs = await store.get('defs');
  let factory = await store.get('factory');
  if (!defs) {
    // Local development: files generated by tools/build_defs.py (never committed)
    try {
      const r = await fetch('data/gt1.json');
      if (r.ok) {
        defs = await r.json();
        const t = await fetch('data/factory_presets.tsl');
        if (t.ok) factory = parsePresets(new Uint8Array(await t.arrayBuffer()));
      }
    } catch { /* not available */ }
  }
  if (!defs) {
    const result = await runSetup();
    if (result.demo) return enterDemoOnly();
    ({ defs, factory } = result);
  }
  setDefs(defs);
  state.factory = factory || [];
}

// Demo without any imported data: a made-up parameter set (demo-defs.js) and
// randomly generated sample patches. Real hardware and .tsl files stay off limits,
// because the made-up addresses do not match a real GT-1.
function enterDemoOnly() {
  setDefs(buildDemoDefs());
  state.demoOnly = true;
  const typeLists = Object.fromEntries(BLOCKS.filter((b) => b.type).map((b) => [b.type, typeList(b)]));
  state.factory = scratchPresets(30, demoParamDefs(), DEMO_SWITCHES, DEMO_TYPE_KEYS, typeLists);
  document.body.classList.add('demo-only');
  $('#demoBanner').hidden = false;
  document.querySelector('.tab[data-tab=factory]').textContent = 'Samples';
}

async function importForReal() {
  await runSetup({ cancelable: true });
  location.reload();
}

function blockedInDemo() {
  if (!state.demoOnly) return false;
  toast('The demo uses made-up effects. Import your BOSS TONE STUDIO files to use a real GT-1 or .tsl files.', true);
  importForReal();
  return true;
}

// ---------------------------------------------------------------- wire up
async function main() {
  await loadRolandData();
  $('#btnReimport').addEventListener('click', importForReal);
  $('#btnDemoImport').addEventListener('click', importForReal);

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
    state.tab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    renderLibrary();
  }));
  $('#libFilter').addEventListener('input', renderLibrary);
  $('#btnConnect').addEventListener('click', () => { if (blockedInDemo()) return; leaveDemo(); connect(); });
  $('#btnDemo').addEventListener('click', startDemo);
  $('#btnSettings').addEventListener('click', openSettings);
  $('#chkLog').addEventListener('change', (e) => { $('#midiLog').hidden = !e.target.checked; });
  $('#btnApplyPorts').addEventListener('click', () => {
    if (blockedInDemo()) return;
    leaveDemo();
    const { ins, outs } = midi.ports();
    midi.select(ins.find((p) => p.id === $('#selIn').value), outs.find((p) => p.id === $('#selOut').value));
    setTimeout(connect, 50);
  });

  $('#patchName').addEventListener('input', (e) => {
    if (!state.patch) return;
    state.patch.name = e.target.value;
    if (state.connected) for (let i = 1; i <= 16; i++) queueSend(`patch_name${i}`);
  });

  $('#btnImport').addEventListener('click', () => { if (!blockedInDemo()) $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', (e) => { if (e.target.files[0]) importTsl(e.target.files[0]); e.target.value = ''; });
  $('#btnExport').addEventListener('click', () => {
    if (blockedInDemo()) return;
    if (!state.patch) return toast('Nothing to export yet', true);
    const name = state.patch.name || 'patch';
    download(`${name.replace(/[^\w\- ]+/g, '_')}.tsl`, JSON.stringify(buildTsl([state.patch], name)));
  });

  $('#btnWrite').addEventListener('click', () => {
    const sel = $('#writeSlot');
    sel.replaceChildren(...Array.from({ length: 99 }, (_, i) => el('option', { value: i, selected: state.source.kind === 'user' && state.source.index === i },
      `U${String(i + 1).padStart(2, '0')}  ${state.userNames[i] ?? ''}`)));
    $('#writeDlg').returnValue = ''; // so Esc never reuses a previous "ok"
    $('#writeDlg').showModal();
  });
  $('#writeDlg').addEventListener('close', async () => {
    if ($('#writeDlg').returnValue !== 'ok') return;
    const n = +$('#writeSlot').value;
    try {
      flushSend();
      midi.dt1(CMD_PATCH_WRITE, [(n >> 7) & 127, n & 127]);
      state.userNames[n] = state.patch.name;
      state.source = { kind: 'user', index: n, label: `GT-1 U${String(n + 1).padStart(2, '0')}` };
      render();
      toast(`Written to U${String(n + 1).padStart(2, '0')}`);
    } catch (e) { toast(e.message, true); }
  });

  window.addEventListener('beforeunload', () => { if (state.connected) try { midi.dt1(CMD_EDITOR_MODE, [0]); } catch { /* closing */ } });

  // Start with a factory sound so the editor is usable offline.
  if (state.factory.length) {
    state.patch = Patch.fromTsl(state.factory[0].params);
    state.source = { kind: 'factory', index: 0, label: state.demoOnly ? 'Sample 01' : 'Factory P01' };
  }
  if (!GT1Midi.supported() && !state.demoOnly) $('#libHint').textContent = 'Web MIDI is not available in this browser — use Chrome or Edge to connect.';
  state.tab = 'factory';
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === 'factory'));
  setConn('off', 'Offline');
  render();
  if (state.demoOnly) startDemo();
}

main().catch((e) => { console.error(e); toast('Failed to start: ' + e.message, true); });
