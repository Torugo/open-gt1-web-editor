import { RolandMidi, addrToInt, to14, from14 } from './midi.js';
import * as store from './store.js';
import { parsePresets } from './extract.js';
import { createVirtualDevice, scratchPresets } from './demo.js';
import { GT, setDefs, Patch, chainOf, buildTsl, fromDisplay } from './model.js';
import { blockById, blockByChain, typeList, typeName, subInfo, typeHint, subHint, paramDefs, dropdownFor, stepperFor, stepperSplit, labelOf, isEnabled, pretty } from './blocks.js';
import { DEVICE, setDevice, pad2 } from './device.js';
import { $, $$, el, sleep, toast } from './dom.js';
import { knob, isDragging, anyKnobDragging } from './knob.js';
import { runSetup } from './setup.js';

// Everything device-specific comes from the active profile (device.js, devices/*.js).
const tempStart = () => addrToInt([...DEVICE.memory.temp, 0, 0]);
const tempEnd = () => tempStart() + DEVICE.memory.patchSpan;
const userSource = (n) => ({ kind: 'user', index: n, label: `${DEVICE.name} ${DEVICE.memory.userLabel(n)}` });
// Source label for a patch number as the unit reports it (user memory or preset)
function sourceForNumber(n) {
  if (n == null) return { kind: 'device', label: DEVICE.name };
  const at = DEVICE.memory.decodePatchNumber(n);
  return at.kind === 'user' ? userSource(at.index) : { kind: 'device', label: `${DEVICE.name} ${DEVICE.memory.presetLabel(at.index)}` };
}
const factorySource = (i) => ({ kind: 'factory', index: i, label: state.demoOnly ? `Sample ${pad2(i + 1)}` : `Factory ${DEVICE.memory.presetLabel(i)}` });

const state = {
  patch: null,
  source: { kind: 'none', label: '—' },
  block: 'preA',            // id of the block shown in the panel
  connected: false,
  demo: false,              // talking to the simulated unit
  demoOnly: false,          // no Roland data imported: made-up parameter set, real hardware off limits
  pendingSelect: null,      // user memory we just asked the unit to switch to
  chainView: 'simple',      // 'simple' | 'full'
  tab: 'user',
  userNames: [],          // the unit's user memories
  factory: [],            // [{name, category, params}]
  file: [],               // patches from an imported .tsl
  fileName: '',
};
const midi = new RolandMidi();

// ---------------------------------------------------------------- log & connection status
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
  $('#btnConnect').textContent = state.connected && !state.demo ? 'Re-sync' : `Connect ${DEVICE.name}`;
  $('#btnDemo').textContent = state.demo ? 'New demo' : 'Try demo';
  document.body.classList.toggle('demo', !!state.demo);
}
function connLabel() {
  return state.demo ? 'Demo (simulated)' : 'Connected';
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
  clearTimeout(sendTimer); sendTimer = null;
  for (const key of sendQueue) {
    const [addr, data] = state.patch.paramMessage(key);
    try { midi.dt1(addr, data); } catch (e) { toast(e.message, true); }
  }
  sendQueue.clear();
}

// Controls currently on screen, by parameter id: how to show a new value without rebuilding.
// Used for values the GT-1 streams back (expression pedal, assigns, wave modulation…).
const liveControls = new Map();

function control(def) {
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
    liveControls.set(def.id, (r) => {
      const s = stepperSplit(st, r);
      if (!isDragging(k)) k.update(s.numeric ? s.number : st.min);
      if (document.activeElement !== sel) sel.value = s.numeric ? st.stepperIndex : st.dropdown.findIndex((o) => o.val === r);
      valEl.textContent = labelOf(def, r);
    });
  } else if (dd) {
    const maxRaw = fromDisplay(def, def.max);
    const sel = el('select', { 'aria-label': def.name, onchange: (e) => update(+e.target.value, { rerender: true }) },
      dd.slice(0, maxRaw + 1).map((name, i) => el('option', { value: i, selected: i === raw }, name)));
    liveControls.set(def.id, (r) => { if (document.activeElement !== sel) sel.value = r; });
    return el('div', { class: 'ctrl' }, el('div', { class: 'name' }, def.name), sel);
  } else {
    widget = knob({ value: raw, min: fromDisplay(def, def.min), max: fromDisplay(def, def.max), label: def.name, onInput: (r) => update(r) });
    liveControls.set(def.id, (r) => { if (!isDragging(widget)) widget.update(r); valEl.textContent = labelOf(def, r); });
  }
  return el('div', { class: 'ctrl' }, el('div', { class: 'name' }, def.name), widget, valEl);
}

function renderPanel() {
  const panel = $('#panel');
  panel.replaceChildren();
  liveControls.clear();
  const p = state.patch;
  const b = blockById(state.block);
  if (!p) { panel.append(el('div', { class: 'empty' }, `Pick a patch on the left, or connect your ${DEVICE.name}.`)); return; }
  if (!b || b.fixed) { panel.append(el('div', { class: 'empty' }, 'This block has no settings.')); return; }

  const head = el('div', { class: 'panel-head' },
    el('span', { class: 'bar', style: `background:${b.color}` }), el('h3', {}, b.name));
  if (b.sw) {
    const cb = el('input', { type: 'checkbox', checked: p.get(b.sw) === 1, onchange: (e) => changeParam(b.sw, e.target.checked ? 1 : 0) });
    head.append(el('label', { class: 'switch' }, cb, 'On'));
  }
  // Type and sub type, with what each model is based on (hint under the select and on hover)
  const withHint = (label, sel, hint) => el('label', { class: 'sel-wrap' }, label, sel, el('span', { class: 'type-hint' }, hint || ''));
  const types = typeList(b);
  if (types) {
    const hint = typeHint(b, typeName(b, p));
    const sel = el('select', { class: 'big', title: hint || '', onchange: (e) => changeParam(b.type, +e.target.value, { rerender: true }) },
      types.map((t) => el('option', { value: t.val, selected: t.val === p.get(b.type), title: typeHint(b, t.name) || '' }, pretty(t.name))));
    head.append(withHint('Type', sel, hint));
  }
  const sub = subInfo(b, p);
  if (sub) {
    const hint = subHint(sub, sub.name);
    const sel = el('select', { class: 'big', title: hint || '', onchange: (e) => changeParam(sub.param, +e.target.value, { rerender: true }) },
      sub.list.map((t) => el('option', { value: t.val, selected: t.val === p.get(sub.param), title: subHint(sub, t.name) || '' }, t.name)));
    head.append(withHint('Sub type', sel, hint));
  }
  panel.append(head);

  const defs = paramDefs(b, p).filter((d) => isEnabled(d, b, p));
  const grid = el('div', { class: 'params' }, defs.map(control));
  panel.append(defs.length ? grid : el('div', { class: 'empty' }, 'No adjustable parameters for this type.'));
}

// ---------------------------------------------------------------- chain
let dragFrom = null;

// Small line icons for the simple chain view (drawn for this project)
const ICON_PATHS = {
  pedal: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="9" cy="7.5" r="1.4"/><circle cx="15" cy="7.5" r="1.4"/><rect x="8.5" y="13" width="7" height="5" rx="1"/>',
  amp: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="6" cy="7" r=".6"/><circle cx="9" cy="7" r=".6"/><circle cx="12" cy="7" r=".6"/><path d="M6 12h12M6 15h12"/>',
  treadle: '<path d="M4 19h16v-2L7 9 4 11z"/><path d="M9 19v-3"/>',
  guitar: '<path d="M13.5 10.5 20 4"/><path d="M18 2.5l3.5 3.5"/><path d="M11 9.5a3.5 3.5 0 0 0-5 0c-1 1-.8 2-1.8 3S2 14 2.8 16.7 7.3 21.2 10 20.8s2-2.4 3.3-3.6 2-1.6.4-4.2"/><circle cx="9" cy="15" r="1.3"/>',
  speaker: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13.5" r="4.5"/><circle cx="12" cy="13.5" r="1.2"/><path d="M8 6.5h8"/>',
};
const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICON_PATHS[name] || ICON_PATHS.pedal;
  return s;
};

// "PREAMP A · DELUXE CRUNCH — Models a Fender Deluxe Reverb"
function blockTitle(b, p) {
  const t = typeName(b, p);
  const hint = typeHint(b, t);
  return b.name + (t ? ` · ${pretty(t)}` : '') + (hint ? ` — ${hint}` : '');
}

// Two views: "simple" (IN → main blocks with LEDs and icons → OUT, like BOSS TONE STUDIO)
// and "full" (every block, including routing). Choice is remembered per browser.
try { state.chainView = localStorage.getItem('chainView') || 'simple'; } catch { /* storage blocked: default view */ }
function setChainView(v) {
  state.chainView = v;
  try { localStorage.setItem('chainView', v); } catch { /* storage blocked: still works for this visit */ }
  renderChain();
}

function renderChain() {
  const c = $('#chain');
  c.replaceChildren();
  const simple = state.chainView === 'simple' && !!DEVICE.simpleChain;
  c.classList.toggle('simple', simple);
  for (const x of $$('#chainView button')) x.setAttribute('aria-pressed', String(x.dataset.view === (simple ? 'simple' : 'full')));
  const p = state.patch;
  if (!p) return;
  const order = chainOf(p);
  if (simple) c.append(el('div', { class: 'chain-end', title: 'Guitar input' }, el('span', {}, 'IN'), icon('guitar')));
  order.forEach((val, idx) => {
    const b = blockByChain(val);
    if (!b) return;
    if (simple && !DEVICE.simpleChain.includes(b.id)) return;
    const on = b.sw ? p.get(b.sw) === 1 : true;
    const t = typeName(b, p);
    const node = el('div', {
      class: `blk${on ? '' : ' off'}${b.fixed ? ' fixed' : ''}${state.block === b.id ? ' sel' : ''}`,
      style: `--c:${b.color}`, draggable: 'true', title: blockTitle(b, p),
      onclick: () => { if (!b.fixed) { state.block = b.id; render(); } },
      ondragstart: (e) => { dragFrom = idx; node.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; },
      ondragend: () => { dragFrom = null; node.classList.remove('dragging'); },
      ondragover: (e) => { e.preventDefault(); node.classList.add('drop-before'); },
      ondragleave: () => node.classList.remove('drop-before'),
      ondrop: (e) => { e.preventDefault(); node.classList.remove('drop-before'); moveChain(dragFrom, idx); },
    });
    const led = b.sw
      ? el('span', { class: 'led', title: 'On/off', onclick: (e) => { e.stopPropagation(); changeParam(b.sw, on ? 0 : 1, { rerender: true }); } })
      : el('span', { class: 'led none' });
    if (simple) {
      node.append(el('span', { class: 'nm' }, b.short), led, el('span', { class: 'ico' }, icon(DEVICE.icons?.[b.id])));
    } else {
      if (b.sw) node.append(led);
      node.append(el('span', {}, b.short));
      if (t && !b.fixed) node.append(el('span', { class: 't' }, pretty(t)));
    }
    c.append(node);
  });
  // Master settings are not part of the chain order but edited the same way
  const m = blockById('master');
  if (m) {
    c.append(el('div', {
      class: `blk master${state.block === m.id ? ' sel' : ''}`, style: `--c:${m.color}`, title: 'Master settings',
      onclick: () => { state.block = m.id; render(); },
    }, simple
      ? [el('span', { class: 'nm' }, m.short), el('span', { class: 'led none' }), el('span', { class: 'ico' }, icon('pedal'))]
      : [el('span', {}, m.short), el('span', { class: 't' }, m.name)]));
  }
  if (simple) c.append(el('div', { class: 'chain-end', title: 'Output' }, el('span', {}, 'OUT'), icon('speaker')));
}

function moveChain(from, to) {
  if (from == null || from === to) return;
  const order = chainOf(state.patch);
  const [item] = order.splice(from, 1);
  order.splice(from < to ? to - 1 : to, 0, item);
  // Some blocks must keep their relative order (GT-1: divider -> channel B -> mixer)
  const fixedOrder = (DEVICE.patch.chainOrder || []).map((v) => order.indexOf(v));
  if (fixedOrder.some((pos, i) => i > 0 && pos < fixedOrder[i - 1])) {
    const names = DEVICE.patch.chainOrder.map((v) => blockByChain(v)?.name.toLowerCase()).join(', ');
    toast(`These blocks must stay in this order: ${names}`, true); return;
  }
  const keys = DEVICE.patch.chainKeys;
  order.forEach((v, i) => state.patch.set(keys[i], v));
  // chain positions are consecutive bytes, so one message updates them all
  if (state.connected) { const [b2, b3] = GT.addr[keys[0]]; midi.dt1([...DEVICE.memory.temp, b2, b3], order); }
  renderChain();
}

// ---------------------------------------------------------------- library
function setTab(tab) {
  state.tab = tab;
  for (const t of $$('.tab')) t.classList.toggle('active', t.dataset.tab === tab);
  renderLibrary();
}

function renderLibrary() {
  const list = $('#libList');
  list.replaceChildren();
  const f = $('#libFilter').value.trim().toLowerCase();
  let items = [];
  let hint = '';
  if (state.tab === 'user') {
    items = state.userNames.map((name, i) => ({ no: DEVICE.memory.userLabel(i), name, i }));
    if (!state.connected) {
      hint = RolandMidi.supported() || state.demoOnly ? `Connect the ${DEVICE.name} to see its user memories.`
        : 'Web MIDI is not available in this browser — use Chrome or Edge to connect.';
    }
    else if (!items.length) hint = 'Reading patch names…';
  } else if (state.tab === 'factory') {
    items = state.factory.map((p, i) => ({ no: DEVICE.memory.presetLabel(i), name: p.name, cat: p.category, i }));
  } else {
    items = state.file.map((p, i) => ({ no: pad2(i + 1), name: p.name, cat: p.category, i }));
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
      state.source = kind === 'factory' ? factorySource(i) : { kind, index: i, label: `File #${i + 1}` };
      render();
      if (state.connected) await sendWholePatch();
      toast(state.connected ? `Loaded “${patch.name}” into the ${DEVICE.name} (not stored yet)` : `Loaded “${patch.name}”`);
    }
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- device
// Read a whole patch from the unit; base2 = first two address bytes (edit buffer or a memory).
async function readPatch(base2) {
  const { readBlocks, readSize } = DEVICE.memory;
  const base = addrToInt([...base2, 0, 0]);
  const image = new Map();
  for (const [b2, b3] of readBlocks) {
    const got = await midi.rq1([...base2, b2, b3], readSize);
    got.forEach((v, a) => image.set(a - base, v));
  }
  return Patch.fromImage(image);
}
const readTemp = () => readPatch(DEVICE.memory.temp);

async function sendWholePatch() {
  for (const [addr, data] of state.patch.chunks()) { midi.dt1(addr, data); await sleep(15); }
}

// Each new patch pick bumps this; an older load that is still running then gives up,
// so fast clicking through the list always ends on the last patch clicked.
let loadSeq = 0;

async function selectUserPatch(n) {
  const my = ++loadSeq;
  setConn('busy', 'Loading…');
  state.pendingSelect = n; // so the unit's echo of this change is not treated as a panel change
  midi.dt1(DEVICE.memory.currentPatch, to14(n));
  await sleep(250);
  if (my !== loadSeq) return;
  let patch = await readTemp();
  if (my !== loadSeq) return;
  const expected = (state.userNames[n] || '').trim();
  if (expected && patch.name.trim() !== expected) {
    // The unit did not switch: read the memory directly and put it in the edit buffer.
    patch = await readPatch(DEVICE.memory.user(n));
    if (my !== loadSeq) return;
    state.patch = patch;
    await sendWholePatch();
    if (my !== loadSeq) return;
  }
  state.patch = patch;
  state.source = userSource(n);
  setConn('on', connLabel());
  render();
  // the unit's echo arrives within milliseconds; after that, changes to this patch on the panel count again
  setTimeout(() => { if (state.pendingSelect === n) state.pendingSelect = null; }, 1000);
}

// A newer run (e.g. Re-sync pressed while names are loading) stops the older one, so two runs
// never write into the same list.
let namesSeq = 0;
async function readUserNames() {
  const my = ++namesSeq;
  const names = [];
  state.userNames = names;
  const { user, userCount } = DEVICE.memory;
  const nameLen = DEVICE.patch.nameKeys.length;
  const [n2, n3] = GT.addr[DEVICE.patch.nameKeys[0]];
  for (let n = 0; n < userCount; n++) {
    let name;
    try {
      const at = [...user(n), n2, n3];
      const got = await midi.rq1(at, nameLen, 1500);
      const base = addrToInt(at);
      let s = '';
      for (let i = 0; i < nameLen; i++) s += String.fromCharCode(got.get(base + i) || 32);
      name = s.replace(/\s+$/, '');
    } catch { name = '?'; }
    if (my !== namesSeq) return; // a newer run took over
    names[n] = name;
    if (state.tab === 'user' && n % 10 === 9) renderLibrary();
  }
  renderLibrary();
}

// Demo mode: plug a simulated unit into the same MIDI path the real one uses.
function startDemo() {
  if (!state.factory.length) { toast('Demo needs the factory presets from the setup step', true); return; }
  state.demo = true;
  const v = createVirtualDevice(state.factory);
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
  if (!state.demo && !RolandMidi.supported()) {
    toast('This browser has no Web MIDI. Use Chrome or Edge.', true); return;
  }
  try {
    setConn('busy', 'Connecting…');
    if (!midi.access && !state.demo) await midi.init();
    if (!midi.output) {
      const g = midi.guessPorts();
      if (!g.input || !g.output) {
        state.connected = false; setConn('off', `No ${DEVICE.name} found`);
        openSettings();
        toast(`${DEVICE.name} not found. Check the USB cable and driver, or pick the ports by hand.`, true);
        return;
      }
      midi.select(g.input, g.output);
    }
    await midi.identity();
    await midi.rq1(DEVICE.commands.editorLevel, 1, 1500).catch(() => null);
    midi.dt1(DEVICE.commands.editorMode, [1]);
    await sleep(50);
    const no = await midi.rq1(DEVICE.memory.currentPatch, 2, 1500).catch(() => null);
    state.patch = await readTemp();
    state.connected = true;
    state.source = sourceForNumber(no ? from14(...no.values()) : null);
    setConn('on', connLabel());
    render();
    toast(state.demo ? `Demo mode: a simulated ${DEVICE.name} with ${DEVICE.memory.userCount} random patches. Nothing is sent to real hardware.` : `Connected to ${midi.output.name}`);
    readUserNames();
  } catch (e) {
    state.connected = false;
    setConn('off', 'Error');
    toast(e.message || String(e), true);
  }
}

// MIDI ports appeared or went away. If ours is gone (cable pulled, unit switched off), say so
// instead of staying "Connected" and sending into nothing.
function onPortsChanged() {
  fillPortSelects();
  if (!state.connected || state.demo) return;
  if (midi.output?.state !== 'disconnected' && midi.input?.state !== 'disconnected') return;
  state.connected = false;
  midi.select(null, null);
  setConn('off', 'Disconnected');
  renderLibrary();
  toast(`${DEVICE.name} disconnected. Plug it back in and click Connect.`, true);
}

// The unit tells us about changes made on its own panel.
let resyncTimer;
function onDeviceData(e) {
  const { start, bytes } = e.detail;
  if (start === addrToInt(DEVICE.memory.currentPatch)) {
    // The unit announces every patch change, including the ones this editor asked for.
    const hi = bytes.get(start);
    const n = hi === undefined ? null : from14(hi, bytes.get(start + 1));
    if (n !== null && n === state.pendingSelect) return; // echo of our own selection
    clearTimeout(resyncTimer);
    resyncTimer = setTimeout(async () => {
      const my = ++loadSeq;
      const patch = await readTemp();
      if (my !== loadSeq) return;
      state.patch = patch;
      state.source = sourceForNumber(n);
      render();
    }, 200);
    return;
  }
  if (start >= tempStart() && start < tempEnd() && state.patch) {
    const image = new Map(state.patch.image);
    bytes.forEach((v, a) => image.set(a - tempStart(), v));
    const before = state.patch.values;
    state.patch = Patch.fromImage(image);
    const changed = Object.keys(state.patch.values).filter((k) => state.patch.values[k] !== before[k]);
    if (!changed.length) return;
    // A pedal or assign sweeping a knob only moves that knob; anything that changes what is
    // shown (type, on/off, chain, name) redraws the editor, at most a few times a second.
    if (changed.some(isStructural)) scheduleRedraw();
    else for (const k of changed) liveControls.get(k)?.(state.patch.get(k));
  }
}

// Keys whose change alters which blocks/controls are shown, not just a value.
let structuralKeys = null;
function isStructural(key) {
  if (!structuralKeys) {
    structuralKeys = new Set([...DEVICE.patch.nameKeys, ...DEVICE.patch.chainKeys, ...(DEVICE.structural?.keys || [])]);
    for (const b of DEVICE.blocks) {
      if (b.sw) structuralKeys.add(b.sw);
      if (b.type) structuralKeys.add(b.type);
      for (const [param] of Object.values(b.sub || {})) structuralKeys.add(param);
    }
  }
  return structuralKeys.has(key) || !!DEVICE.structural?.pattern?.test(key);
}

let redrawTimer = null;
function scheduleRedraw() {
  if (redrawTimer) return;
  redrawTimer = setTimeout(() => {
    redrawTimer = null;
    if (anyKnobDragging()) { scheduleRedraw(); return; } // never pull a knob out from under the mouse
    $('#patchName').value = state.patch.name;
    renderChain();
    renderPanel();
  }, 250);
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
  if (RolandMidi.supported() && !midi.access) {
    try { await midi.init(); } catch (e) { toast(e.message, true); }
  }
  fillPortSelects();
  $('#settingsDlg').showModal();
}

// ---------------------------------------------------------------- files
function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importTsl(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!Array.isArray(j.patchList)) throw new Error('Not a BOSS TONE STUDIO .tsl file');
      if (j.device && j.device !== DEVICE.tslDevice) toast(`This file is for ${j.device}; loading anyway`, true);
      state.file = j.patchList.filter((p) => p.params).map((p) => ({ name: p.name || nameFromParams(p.params), category: p.category || '', params: p.params }));
      state.fileName = file.name;
      setTab('file');
      toast(`${state.file.length} patches in ${file.name}`);
    } catch (e) { toast(e.message, true); }
  };
  r.readAsText(file);
}
const nameFromParams = (p) => DEVICE.patch.nameKeys.map((k) => String.fromCharCode(p[k] || 32)).join('').trim();

// ---------------------------------------------------------------- render all
function render() {
  $('#patchName').value = state.patch ? state.patch.name : '';
  $('#patchName').disabled = !state.patch;
  $('#patchSource').textContent = state.source.label;
  renderChain();
  renderPanel();
  renderLibrary();
}

// ---------------------------------------------------------------- Roland data
async function loadRolandData() {
  let defs = await store.get('defs');
  let factory = await store.get('factory');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!defs && local) {
    // Local development: files generated by tools/build_defs.py (never committed)
    try {
      const r = await fetch(`data/${DEVICE.id}.json`);
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
  setDevice(defs.device || 'gt1'); // tables saved before device profiles existed are GT-1's
  setDefs(defs);
  state.factory = factory || [];
}

// Demo without any imported data: the device profile's made-up parameter set and
// randomly generated sample patches. Real hardware and .tsl files stay off limits,
// because the made-up addresses do not match a real unit.
function enterDemoOnly() {
  const demo = DEVICE.demo;
  setDefs(demo.buildTable(DEVICE));
  state.demoOnly = true;
  const typeLists = Object.fromEntries(DEVICE.blocks.filter((b) => b.type).map((b) => [b.type, typeList(b)]));
  state.factory = scratchPresets(30, demo.paramDefs(), demo.switches, demo.typeKeys, typeLists);
  document.body.classList.add('demo-only');
  $('#demoBanner').hidden = false;
  $('.tab[data-tab=factory]').textContent = 'Samples';
}

// Reloading is the simple way to swap the demo's made-up table for the imported one.
async function importForReal() {
  if (await runSetup({ cancelable: true })) location.reload();
}

function blockedInDemo() {
  if (!state.demoOnly) return false;
  toast(`The demo uses made-up effects. Import your BOSS TONE STUDIO files to use a real ${DEVICE.name} or .tsl files.`, true);
  importForReal();
  return true;
}

// ---------------------------------------------------------------- wire up
async function main() {
  window.__appStarted = true; // checked by the load guard in index.html
  await loadRolandData();
  // labels that name the device
  $('.tab[data-tab=user]').textContent = `${DEVICE.name} User`;
  for (const x of $$('#chainView button')) x.addEventListener('click', () => setChainView(x.dataset.view));
  if (!DEVICE.simpleChain) $('#chainView').hidden = true;
  $('#btnReimport').addEventListener('click', importForReal);
  $('#btnDemoImport').addEventListener('click', importForReal);

  for (const t of $$('.tab')) t.addEventListener('click', () => setTab(t.dataset.tab));
  midi.addEventListener('ports', onPortsChanged);
  midi.addEventListener('dt1', onDeviceData);
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
    if (state.connected) for (const k of DEVICE.patch.nameKeys) queueSend(k);
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
    sel.replaceChildren(...Array.from({ length: DEVICE.memory.userCount }, (_, i) => el('option', { value: i, selected: state.source.kind === 'user' && state.source.index === i },
      `${DEVICE.memory.userLabel(i)}  ${state.userNames[i] ?? ''}`)));
    $('#writeDlg').returnValue = ''; // so Esc never reuses a previous "ok"
    $('#writeDlg').showModal();
  });
  $('#writeDlg').addEventListener('close', async () => {
    if ($('#writeDlg').returnValue !== 'ok') return;
    const n = +$('#writeSlot').value;
    try {
      flushSend();
      midi.dt1(DEVICE.commands.patchWrite, to14(n));
      state.userNames[n] = state.patch.name;
      state.source = userSource(n);
      render();
      toast(`Written to ${DEVICE.memory.userLabel(n)}`);
    } catch (e) { toast(e.message, true); }
  });

  window.addEventListener('beforeunload', () => { if (state.connected) try { midi.dt1(DEVICE.commands.editorMode, [0]); } catch { /* closing */ } });

  // Start with a factory sound so the editor is usable offline.
  if (state.factory.length) {
    state.patch = Patch.fromTsl(state.factory[0].params);
    state.source = factorySource(0);
  }
  setConn('off', 'Offline');
  setTab('factory');
  render();
  if (state.demoOnly) startDemo();
}

main().catch((e) => { console.error(e); toast('Failed to start: ' + e.message, true); });
