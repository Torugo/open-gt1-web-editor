// A small, made-up parameter set used only by the "demo without importing" mode.
// It is written for this project (generic effect and knob names), contains no Roland data,
// and never reaches real hardware: the app blocks connecting to a GT-1 while it is loaded.
// It uses the same shape as the extracted table so the whole editor UI works with it.
// Part of the GT-1 profile (devices/gt1.js): it reuses the GT-1's block and parameter key names.

const P = (id, name, min = 0, max = 100, step = 1) => ({ id, name, min, max, step, page: 1, row: 1 });
const types = (...names) => names.map((name, val) => ({ val, name }));

const DROPDOWN_LIST = {};
const D = (id, name, labels) => { DROPDOWN_LIST[id] = labels; return P(id, name, 0, labels.length - 1); };

const CUT = ['FLAT', '1.0kHz', '2.0kHz', '4.0kHz', '8.0kHz'];

function fxLists(p) {
  const L = {
    WAH: [P(`${p}_wah_freq`, 'FREQ'), P(`${p}_wah_peak`, 'PEAK'), P(`${p}_wah_level`, 'LEVEL')],
    PHASER: [P(`${p}_phaser_rate`, 'RATE'), P(`${p}_phaser_depth`, 'DEPTH'), P(`${p}_phaser_reso`, 'RESONANCE'), P(`${p}_phaser_level`, 'LEVEL')],
    FLANGER: [P(`${p}_flanger_rate`, 'RATE'), P(`${p}_flanger_depth`, 'DEPTH'), P(`${p}_flanger_reso`, 'RESONANCE'), P(`${p}_flanger_level`, 'LEVEL')],
    TREMOLO: [P(`${p}_trem_rate`, 'RATE'), P(`${p}_trem_depth`, 'DEPTH'), P(`${p}_trem_level`, 'LEVEL')],
    VIBRATO: [P(`${p}_vib_rate`, 'RATE'), P(`${p}_vib_depth`, 'DEPTH'), P(`${p}_vib_level`, 'LEVEL')],
    OCTAVE: [P(`${p}_oct_level`, 'OCTAVE LEVEL'), P(`${p}_oct_direct`, 'DIRECT LEVEL')],
    PITCH: [P(`${p}_pitch_pitch`, 'PITCH', -24, 24), P(`${p}_pitch_fine`, 'FINE', -50, 50), P(`${p}_pitch_level`, 'LEVEL')],
    ROTARY: [D(`${p}_rot_speed`, 'SPEED', ['SLOW', 'FAST']), P(`${p}_rot_depth`, 'DEPTH'), P(`${p}_rot_level`, 'LEVEL')],
  };
  return { types: types(...Object.keys(L)), params: L };
}
const FX1 = fxLists('fx1');
const FX2 = fxLists('fx2');

export const DEMO_DEFS_TABLE = {
  EFECT_NAME: ['COMP', 'OD/DS', 'PREAMP', 'PREAMP B', 'EQ', 'FX1', 'FX2', 'DELAY', 'CHORUS', 'REVERB', 'PEDAL FX', 'FOOT VOLUME', 'DIVIDER', 'MIXER', 'SEND/RETURN', 'NS', 'NS2', 'ACCEL FX', 'MASTER SETTING'],
  COMP_TYPE: types('SOFT', 'STUDIO', 'SQUASH'),
  COMP_PARAMS_LIST: { DEFAULT: [P('comp_sustain', 'SUSTAIN'), P('comp_attack', 'ATTACK'), P('comp_tone', 'TONE', -50, 50), P('comp_level', 'LEVEL')] },
  ODDS_TYPE: types('BOOST', 'OVERDRIVE', 'WARM OD', 'DISTORTION', 'FUZZ', 'HEAVY'),
  ODDS_PARAMS_LIST: { DEFAULT: [P('od_ds_drive', 'DRIVE', 0, 120), P('od_ds_tone', 'TONE', -50, 50), P('od_ds_bottom', 'BOTTOM', -50, 50), P('od_ds_effect_level', 'LEVEL')] },
  PREAMP_TYPE: types('CLEAN', 'WARM CLEAN', 'BRIGHT CLEAN', 'CRUNCH', 'BLUES', 'BRIT CRUNCH', 'HIGH GAIN', 'LEAD', 'HEAVY', 'BASS AMP'),
  PREAMP_A_PARAMS_LIST: { DEFAULT: [P('preamp_a_gain', 'GAIN', 0, 120), P('preamp_a_level', 'LEVEL'), D('preamp_a_sp_type', 'SPEAKER', ['OFF', '1x12"', '2x12"', '4x12"']), P('preamp_a_bass', 'BASS'), P('preamp_a_middle', 'MIDDLE'), P('preamp_a_treble', 'TREBLE'), P('preamp_a_presence', 'PRESENCE')] },
  EQ_PARAMS_LIST: { DEFAULT: [P('eq_low_gain', 'LOW GAIN', -20, 20), D('eq_mid_freq', 'MID FREQ', ['200Hz', '400Hz', '800Hz', '1.6kHz', '3.2kHz']), P('eq_mid_gain', 'MID GAIN', -20, 20), P('eq_high_gain', 'HIGH GAIN', -20, 20), P('eq_level', 'LEVEL', -20, 20)] },
  FX1_TYPE: FX1.types, FX1_PARAMS_LIST: FX1.params, FX1_SUB_TYPE_LIST: {},
  FX2_TYPE: FX2.types, FX2_PARAMS_LIST: FX2.params, FX2_SUB_TYPE_LIST: {},
  DELAY_TYPE: types('DIGITAL', 'ANALOG', 'TAPE', 'REVERSE'),
  DELAY_PARAMS_LIST: { DEFAULT: [P('delay_delay_time', 'TIME (ms)', 1, 1000), P('delay_f_back', 'FEEDBACK'), D('delay_high_cut', 'HIGH CUT', CUT), P('delay_effect_level', 'LEVEL', 0, 120)] },
  CHORUS_TYPE: types('MONO', 'STEREO'),
  CHORUS_PARAMS_LIST: { DEFAULT: [P('chorus_rate', 'RATE'), P('chorus_depth', 'DEPTH'), P('chorus_effect_level', 'LEVEL')] },
  REVERB_TYPE: types('ROOM', 'HALL', 'PLATE', 'SPRING'),
  REVERB_PARAMS_LIST: { DEFAULT: [P('reverb_time', 'TIME'), P('reverb_pre_delay', 'PRE DELAY'), D('reverb_high_cut', 'HIGH CUT', CUT), P('reverb_effect_level', 'LEVEL')] },
  PEDAL_FX_TYPE: types('WAH', 'BEND'),
  PEDAL_FX_PARAMS_LIST: {
    DEFAULT: [P('pedal_fx_position', 'PEDAL POS'), P('pedal_fx_min', 'PEDAL MIN'), P('pedal_fx_max', 'PEDAL MAX'), P('pedal_fx_level', 'LEVEL')],
    BEND: [P('pedal_fx_bend_pitch', 'PITCH', -24, 24), P('pedal_fx_position', 'PEDAL POS'), P('pedal_fx_level', 'LEVEL')],
  },
  ACCEL_FX_TYPE: types('SWELL', 'LASER', 'RING'),
  ACCEL_FX_PARAMS_LIST: { DEFAULT: [P('accel_fx_rate', 'RATE'), P('accel_fx_depth', 'DEPTH'), P('accel_fx_level', 'LEVEL')] },
  ACCEL_FX_SUB_TYPE_LIST: {},
  FOOT_VOLUME_PARAMS_LIST: { DEFAULT: [P('foot_volume_min', 'VOLUME MIN'), P('foot_volume_max', 'VOLUME MAX'), P('foot_volume_level', 'LEVEL')] },
  NS1_PARAMS_LIST: { DEFAULT: [P('ns1_threshold', 'THRESHOLD'), P('ns1_release', 'RELEASE')] },
  NS2_PARAMS_LIST: { DEFAULT: [P('ns2_threshold', 'THRESHOLD'), P('ns2_release', 'RELEASE')] },
  SEND_RETURN_PARAMS_LIST: { DEFAULT: [P('send_return_send', 'SEND LEVEL'), P('send_return_return', 'RETURN LEVEL')] },
  DIVIDER_PARAMS_LIST: { DEFAULT: [D('divider_mode', 'MODE', ['SINGLE', 'DUAL']), D('divider_ch', 'CHANNEL', ['A', 'B'])] },
  MIXER_PARAMS_LIST: { DEFAULT: [D('mixer_mode', 'MODE', ['STEREO', 'PAN L/R']), P('mixer_balance', 'A/B BALANCE')] },
  MASTER_SETTING_PARAMS_LIST: { DEFAULT: [P('patch_level', 'PATCH LEVEL', 0, 200, 2), P('master_bpm', 'BPM', 40, 250), D('master_key', 'KEY', ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']), P('master_low', 'LOW GAIN', -20, 20), P('master_high', 'HIGH GAIN', -20, 20)] },
  ODDS_SUB_TYPE_LIST: {}, PREAMP_SUB_TYPE_LIST: {}, PEDAL_FX_SUB_TYPE_LIST: {},
  DROPDOWN_LIST,
  ENABLE_PATTERN_LIST: {},
  STEPPER_AND_DROPDOWN_LIST: {},
};

const SWITCHES = ['comp_on_off', 'od_ds_on_off', 'preamp_a_on_off', 'preamp_b_on_off', 'eq_on_off', 'fx1_on_off', 'fx2_on_off', 'delay_on_off', 'chorus_on_off', 'reverb_on_off', 'pedal_fx_on_off', 'send_return_on_off', 'ns1_on_off', 'ns2_on_off'];
const TYPE_KEYS = ['comp_type', 'od_ds_type', 'preamp_a_type', 'preamp_b_type', 'fx1_fx_type', 'fx2_fx_type', 'delay_type', 'chorus_mode', 'reverb_type', 'pedal_fx_wah_type', 'accel_fx_type'];

// Every parameter id the demo table can show, with its definition (Preamp B reuses A's list)
export function demoParamDefs() {
  const out = {};
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') { if (x.id && 'min' in x) out[x.id] = x; else Object.values(x).forEach(walk); }
  };
  for (const [k, v] of Object.entries(DEMO_DEFS_TABLE)) if (k.endsWith('_PARAMS_LIST')) walk(v);
  for (const d of Object.values({ ...out })) if (d.id.startsWith('preamp_a_')) { const id = d.id.replace('preamp_a_', 'preamp_b_'); out[id] = { ...d, id }; }
  return out;
}

// Lay the parameters out inside the same memory chunks the editor reads and writes.
export function buildDemoTable(device) {
  const free = [];
  for (const [b2, b3, size] of device.memory.writeChunks) for (let i = 0; i < size; i++) free.push(b2 * 128 + b3 + i);
  let n = 0;
  const addr = {};
  const place = (key, size) => {
    // two-byte values need two neighbouring free offsets
    while (size === 2 && free[n + 1] !== free[n] + 1) n++;
    const o = free[n]; n += size;
    addr[key] = [o >> 7, o & 127, size];
  };
  device.patch.nameKeys.forEach((k) => place(k, 1));
  device.patch.chainKeys.forEach((k) => place(k, 1));
  SWITCHES.forEach((k) => place(k, 1));
  TYPE_KEYS.forEach((k) => place(k, 1));
  for (const d of Object.values(demoParamDefs())) {
    const rawMax = Math.round((d.max - (d.min < 0 ? d.min : 0)) / (d.step || 1));
    place(d.id, rawMax > 127 ? 2 : 1);
  }
  return { source: `Built-in demo set (made up, not a real ${device.name} parameter list)`, device: device.id, demo: true, addr, defs: DEMO_DEFS_TABLE };
}

export const DEMO_SWITCHES = SWITCHES;
export const DEMO_TYPE_KEYS = TYPE_KEYS;
