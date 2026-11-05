// Effect blocks of the GT-1 and how their parameters are shown.
// Everything here points into the tables extracted from the original app (GT.defs).
import { GT, toDisplay, fromDisplay } from './model.js';

const VOICE = ['1VOICE', '2MONO', '2STEREO'].map((name, val) => ({ val, name }));

const FX_SUB = (p) => ({
  COMPRESSOR: [`${p}_adv_comp_type`, 'COMPRESSOR'],
  LIMITER: [`${p}_limiter_type`, 'LIMITER'],
  TONEMODIFY: [`${p}_tone_modify_type`, 'TONEMODIFY'],
  GTRSIM: [`${p}_guitar_sim_type`, 'GTRSIM'],
  AC_PROC: [`${p}_ac_processor_type`, 'AC_PROC'],
  PHASER: [`${p}_phaser_type`, 'PHASER'],
  SUBDELAY: [`${p}_sub_delay_type`, 'SUBDELAY'],
  CHORUS: [`${p}_chorus_mode`, 'CHORUS'],
  PITCHSHIFTER: [`${p}_pitch_shifter_voice`, VOICE],
  HARMONIST: [`${p}_harmonist_voice`, VOICE],
});

// Nicer names for the FX type ids used internally by the original app
export const PRETTY = {
  TWAH: 'T.WAH', GEQ: 'GRAPHIC EQ', PEQ: 'PARAMETRIC EQ', TONEMODIFY: 'TONE MODIFY', GTRSIM: 'GUITAR SIM',
  ACSIM: 'AC.GUITAR SIM', SLOWGEAR: 'SLOW GEAR', PITCHSHIFTER: 'PITCH SHIFTER', AC_PROC: 'AC.PROCESSOR',
  UNI_V: 'UNI-V', SUBDELAY: 'SUB DELAY',
};
export const pretty = (n) => PRETTY[n] || n;

// chain: value stored in fx_chain_positionN (order taken from ChainParams.getEffectName)
export const BLOCKS = [
  { id: 'comp', chain: 0, short: 'CMP', name: 'COMP', sw: 'comp_on_off', type: 'comp_type', types: 'COMP_TYPE', params: 'COMP_PARAMS_LIST', color: '#d9a400' },
  { id: 'sr', chain: 1, short: 'S/R', name: 'SEND/RETURN', sw: 'send_return_on_off', params: 'SEND_RETURN_PARAMS_LIST', color: '#7a8a99' },
  { id: 'preA', chain: 2, short: 'PrA', name: 'PREAMP A', sw: 'preamp_a_on_off', type: 'preamp_a_type', types: 'PREAMP_TYPE', params: 'PREAMP_A_PARAMS_LIST', sub: { CUSTOM: ['preamp_a_custom_type', 'PREAMP_SUB_TYPE_LIST'] }, color: '#e0442e' },
  { id: 'preB', chain: 3, short: 'PrB', name: 'PREAMP B', sw: 'preamp_b_on_off', type: 'preamp_b_type', types: 'PREAMP_TYPE', params: 'PREAMP_A_PARAMS_LIST', rename: ['preamp_a_', 'preamp_b_'], sub: { CUSTOM: ['preamp_b_custom_type', 'PREAMP_SUB_TYPE_LIST'] }, color: '#e0442e' },
  { id: 'eq', chain: 4, short: 'EQ', name: 'EQ', sw: 'eq_on_off', params: 'EQ_PARAMS_LIST', color: '#3fa34d' },
  { id: 'fx1', chain: 5, short: 'FX1', name: 'FX1', sw: 'fx1_on_off', type: 'fx1_fx_type', types: 'FX1_TYPE', params: 'FX1_PARAMS_LIST', sub: FX_SUB('fx1'), subLists: 'FX1_SUB_TYPE_LIST', color: '#2e7fd9' },
  { id: 'fx2', chain: 6, short: 'FX2', name: 'FX2', sw: 'fx2_on_off', type: 'fx2_fx_type', types: 'FX2_TYPE', params: 'FX2_PARAMS_LIST', sub: FX_SUB('fx2'), subLists: 'FX2_SUB_TYPE_LIST', color: '#2e7fd9' },
  { id: 'delay', chain: 7, short: 'DLY', name: 'DELAY', sw: 'delay_on_off', type: 'delay_type', types: 'DELAY_TYPE', params: 'DELAY_PARAMS_LIST', color: '#13a8a8' },
  { id: 'chorus', chain: 8, short: 'CHO', name: 'CHORUS', sw: 'chorus_on_off', type: 'chorus_mode', types: 'CHORUS_TYPE', params: 'CHORUS_PARAMS_LIST', color: '#8b5cd6' },
  { id: 'reverb', chain: 9, short: 'REV', name: 'REVERB', sw: 'reverb_on_off', type: 'reverb_type', types: 'REVERB_TYPE', params: 'REVERB_PARAMS_LIST', color: '#5c6bd6' },
  { id: 'accel', chain: 10, short: 'ACC', name: 'ACCEL FX', type: 'accel_fx_type', types: 'ACCEL_FX_TYPE', params: 'ACCEL_FX_PARAMS_LIST', sub: { FEEDBACKER: ['accel_fx_feedbacker_mode', 'ACCEL_FX_SUB_TYPE_LIST'] }, color: '#d64f9a' },
  { id: 'pedal', chain: 11, short: 'PDL', name: 'PEDAL FX', sw: 'pedal_fx_on_off', type: 'pedal_fx_wah_type', types: 'PEDAL_FX_TYPE', params: 'PEDAL_FX_PARAMS_LIST', color: '#c27c2c' },
  { id: 'fv', chain: 12, short: 'FV', name: 'FOOT VOLUME', params: 'FOOT_VOLUME_PARAMS_LIST', color: '#7a8a99' },
  { id: 'ns1', chain: 13, short: 'NS', name: 'NS', sw: 'ns1_on_off', params: 'NS1_PARAMS_LIST', color: '#7a8a99' },
  { id: 'ns2', chain: 14, short: 'NS2', name: 'NS2', sw: 'ns2_on_off', params: 'NS2_PARAMS_LIST', color: '#7a8a99' },
  { id: 'odds', chain: 15, short: 'OD', name: 'OD/DS', sw: 'od_ds_on_off', type: 'od_ds_type', types: 'ODDS_TYPE', params: 'ODDS_PARAMS_LIST', sub: { CUSTOM: ['od_ds_custom_type', 'ODDS_SUB_TYPE_LIST'] }, color: '#e07b00' },
  { id: 'usb', chain: 16, short: 'USB', name: 'USB OUT', fixed: true, color: '#555' },
  { id: 'div', chain: 17, short: 'DIV', name: 'DIVIDER', params: 'DIVIDER_PARAMS_LIST', color: '#555' },
  { id: 'mxdv', chain: 18, short: 'B', name: 'CH B', fixed: true, color: '#555' },
  { id: 'mix', chain: 19, short: 'MIX', name: 'MIXER', params: 'MIXER_PARAMS_LIST', color: '#555' },
  { id: 'master', chain: -1, short: 'MST', name: 'MASTER', params: 'MASTER_SETTING_PARAMS_LIST', color: '#555' },
];
export const BLOCK_BY_CHAIN = Object.fromEntries(BLOCKS.filter((b) => b.chain >= 0).map((b) => [b.chain, b]));

// ---- per-patch helpers ---------------------------------------------------------
export function typeList(block) { return block.types ? GT.defs[block.types] : null; }

export function typeName(block, patch) {
  const list = typeList(block);
  if (!list) return null;
  const v = patch.get(block.type);
  return (list.find((t) => t.val === v) || {}).name ?? `#${v}`;
}

export function subInfo(block, patch) {
  const t = typeName(block, patch);
  if (!block.sub || !t || !block.sub[t]) return null;
  const [param, listRef] = block.sub[t];
  if (!GT.addr[param]) return null;
  let list = listRef;
  if (typeof listRef === 'string') {
    const tables = GT.defs[block.subLists || listRef];
    list = block.subLists ? tables[listRef] : tables[t];
  }
  if (!list) return null;
  return { param, list, name: (list.find((x) => x.val === patch.get(param)) || {}).name };
}

export function paramDefs(block, patch) {
  if (!block.params) return [];
  const table = GT.defs[block.params];
  const t = typeName(block, patch);
  let list = (t && table[t]) || table.DEFAULT || [];
  if (block.rename) {
    const [a, b] = block.rename;
    list = list.map((d) => ({ ...d, id: d.id.replace(a, b) }));
  }
  return list.filter((d) => GT.addr[d.id]);
}

// Label shown for a dropdown-style parameter value
export function dropdownFor(id) {
  const dd = GT.defs.DROPDOWN_LIST[id] || GT.defs.DROPDOWN_LIST[id.replace('preamp_b_', 'preamp_a_')];
  return Array.isArray(dd) ? dd : null;
}

export function stepperFor(id) {
  return GT.defs.STEPPER_AND_DROPDOWN_LIST[id] || null;
}

// "Stepper + dropdown" values (rates / times that can also sync to tempo):
// a numeric range offset by dropdown[stepperIndex].val, plus fixed entries (OFF, note values).
export function stepperSplit(st, raw) {
  const offset = st.dropdown[st.stepperIndex].val;
  if (raw >= st.min + offset && raw <= st.max + offset) return { numeric: true, number: raw - offset, offset };
  return { numeric: false, entry: st.dropdown.find((x, i) => i !== st.stepperIndex && x.val === raw), offset };
}

export function labelOf(def, raw) {
  const st = stepperFor(def.id);
  if (st) {
    const s = stepperSplit(st, raw);
    return s.numeric ? String(s.number) : s.entry?.name ?? String(raw);
  }
  const dd = dropdownFor(def.id);
  if (dd) return dd[raw] ?? String(raw);
  return String(toDisplay(def, raw));
}

// Should this parameter be visible for the current type / sub type / mode?
export function isEnabled(def, block, patch) {
  const rule = GT.defs.ENABLE_PATTERN_LIST[def.id] || GT.defs.ENABLE_PATTERN_LIST[def.id.replace('preamp_b_', 'preamp_a_')];
  if (!rule) return true;
  let current = null; let options = null;
  const fromParam = (id) => { const dd = dropdownFor(id); options = dd; current = dd ? dd[patch.get(id)] : null; };
  switch (rule.key) {
    case 'EFFECT_TYPE': current = typeName(block, patch); options = (typeList(block) || []).map((t) => t.name); break;
    case 'SUB_TYPE': { const s = subInfo(block, patch); current = s?.name; options = s?.list.map((x) => x.name); break; }
    case 'DIVIDER_MODE': fromParam('divider_mode'); break;
    case 'SEND_RETURN_MODE': fromParam('send_return_mode'); break;
    case 'PRE_AMP_A_SP_TYPE': fromParam('preamp_a_sp_type'); break;
    case 'PRE_AMP_B_SP_TYPE': fromParam('preamp_b_sp_type'); break;
    default: {
      const m = rule.key.match(/^(FX\d)_(HR\d):HARM$/);
      if (m) fromParam(`${m[1].toLowerCase()}_harmonist_${m[2].toLowerCase()}harm`);
      else return true; // e.g. OUTPUT_SELECT is a system setting: always show
    }
  }
  // If none of the rule's values can ever occur in this list, don't hide the parameter.
  if (!options || !rule.value.some((v) => options.includes(v))) return true;
  return rule.value.includes(current);
}

export { toDisplay, fromDisplay };
