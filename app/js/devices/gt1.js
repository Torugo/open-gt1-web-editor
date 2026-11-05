// Device profile: BOSS GT-1.
// Every GT-1-specific fact the editor needs. Values come from the original BOSS TONE STUDIO for GT-1
// (see tools/ and the README's protocol notes) and were tested on a real unit.
import { DEMO_DEFS_TABLE, buildDemoTable, demoParamDefs, DEMO_SWITCHES, DEMO_TYPE_KEYS } from './gt1-demo.js';
import { GT1_HINTS } from './gt1-hints.js';

const pad2 = (n) => String(n).padStart(2, '0');

// ---- effect blocks -----------------------------------------------------------------------
const VOICE = ['1VOICE', '2MONO', '2STEREO'].map((name, val) => ({ val, name }));

// FX type -> [parameter holding its sub type, sub type list (name in <FXn>_SUB_TYPE_LIST, or a list)]
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

// chain: value stored in fx_chain_positionN (order taken from ChainParams.getEffectName)
// color: effect family; the actual colors are theme variables (--f-*) in style.css
const BLOCKS = [
  { id: 'comp', chain: 0, short: 'CMP', name: 'COMP', sw: 'comp_on_off', type: 'comp_type', types: 'COMP_TYPE', params: 'COMP_PARAMS_LIST', color: 'var(--f-dyn)' },
  { id: 'sr', chain: 1, short: 'S/R', name: 'SEND/RETURN', sw: 'send_return_on_off', params: 'SEND_RETURN_PARAMS_LIST', color: 'var(--f-util)' },
  { id: 'preA', chain: 2, short: 'PrA', name: 'PREAMP A', sw: 'preamp_a_on_off', type: 'preamp_a_type', types: 'PREAMP_TYPE', params: 'PREAMP_A_PARAMS_LIST', sub: { CUSTOM: ['preamp_a_custom_type', 'PREAMP_SUB_TYPE_LIST'] }, color: 'var(--f-amp)' },
  { id: 'preB', chain: 3, short: 'PrB', name: 'PREAMP B', sw: 'preamp_b_on_off', type: 'preamp_b_type', types: 'PREAMP_TYPE', params: 'PREAMP_A_PARAMS_LIST', rename: ['preamp_a_', 'preamp_b_'], sub: { CUSTOM: ['preamp_b_custom_type', 'PREAMP_SUB_TYPE_LIST'] }, color: 'var(--f-amp)' },
  { id: 'eq', chain: 4, short: 'EQ', name: 'EQ', sw: 'eq_on_off', params: 'EQ_PARAMS_LIST', color: 'var(--f-amp)' },
  { id: 'fx1', chain: 5, short: 'FX1', name: 'FX1', sw: 'fx1_on_off', type: 'fx1_fx_type', types: 'FX1_TYPE', params: 'FX1_PARAMS_LIST', sub: FX_SUB('fx1'), subLists: 'FX1_SUB_TYPE_LIST', color: 'var(--f-mod)' },
  { id: 'fx2', chain: 6, short: 'FX2', name: 'FX2', sw: 'fx2_on_off', type: 'fx2_fx_type', types: 'FX2_TYPE', params: 'FX2_PARAMS_LIST', sub: FX_SUB('fx2'), subLists: 'FX2_SUB_TYPE_LIST', color: 'var(--f-mod)' },
  { id: 'delay', chain: 7, short: 'DLY', name: 'DELAY', sw: 'delay_on_off', type: 'delay_type', types: 'DELAY_TYPE', params: 'DELAY_PARAMS_LIST', color: 'var(--f-time)' },
  { id: 'chorus', chain: 8, short: 'CHO', name: 'CHORUS', sw: 'chorus_on_off', type: 'chorus_mode', types: 'CHORUS_TYPE', params: 'CHORUS_PARAMS_LIST', color: 'var(--f-mod)' },
  { id: 'reverb', chain: 9, short: 'REV', name: 'REVERB', sw: 'reverb_on_off', type: 'reverb_type', types: 'REVERB_TYPE', params: 'REVERB_PARAMS_LIST', color: 'var(--f-time)' },
  { id: 'accel', chain: 10, short: 'ACC', name: 'ACCEL FX', type: 'accel_fx_type', types: 'ACCEL_FX_TYPE', params: 'ACCEL_FX_PARAMS_LIST', sub: { FEEDBACKER: ['accel_fx_feedbacker_mode', 'ACCEL_FX_SUB_TYPE_LIST'] }, color: 'var(--f-mod)' },
  { id: 'pedal', chain: 11, short: 'PDL', name: 'PEDAL FX', sw: 'pedal_fx_on_off', type: 'pedal_fx_wah_type', types: 'PEDAL_FX_TYPE', params: 'PEDAL_FX_PARAMS_LIST', color: 'var(--f-drive)' },
  { id: 'fv', chain: 12, short: 'FV', name: 'FOOT VOLUME', params: 'FOOT_VOLUME_PARAMS_LIST', color: 'var(--f-util)' },
  { id: 'ns1', chain: 13, short: 'NS', name: 'NS', sw: 'ns1_on_off', params: 'NS1_PARAMS_LIST', color: 'var(--f-dyn)' },
  { id: 'ns2', chain: 14, short: 'NS2', name: 'NS2', sw: 'ns2_on_off', params: 'NS2_PARAMS_LIST', color: 'var(--f-dyn)' },
  { id: 'odds', chain: 15, short: 'OD', name: 'OD/DS', sw: 'od_ds_on_off', type: 'od_ds_type', types: 'ODDS_TYPE', params: 'ODDS_PARAMS_LIST', sub: { CUSTOM: ['od_ds_custom_type', 'ODDS_SUB_TYPE_LIST'] }, color: 'var(--f-drive)' },
  { id: 'usb', chain: 16, short: 'USB', name: 'USB OUT', fixed: true, color: 'var(--f-util)' },
  { id: 'div', chain: 17, short: 'DIV', name: 'DIVIDER', params: 'DIVIDER_PARAMS_LIST', color: 'var(--f-util)' },
  { id: 'mxdv', chain: 18, short: 'B', name: 'CH B', fixed: true, color: 'var(--f-util)' },
  { id: 'mix', chain: 19, short: 'MIX', name: 'MIXER', params: 'MIXER_PARAMS_LIST', color: 'var(--f-util)' },
  { id: 'master', chain: -1, short: 'MST', name: 'MASTER', params: 'MASTER_SETTING_PARAMS_LIST', color: 'var(--f-util)' },
];

export const GT1 = {
  id: 'gt1',
  name: 'GT-1',

  // ---- MIDI -------------------------------------------------------------------------------
  modelId: [0x00, 0x00, 0x00, 0x30],          // Roland SysEx model ID
  portName: /GT-1/i,                          // pick these MIDI ports automatically
  portAvoid: /CTRL|DAW/i,

  // ---- memory map ---------------------------------------------------------------------------
  memory: {
    temp: [0x60, 0x00],                        // edit buffer at 60 00 xx xx
    user: (n) => [0x10 + (n >> 7), n & 127],   // user memory n at 10 n xx xx
    preset: (n) => [0x20 + (n >> 7), n & 127], // preset n at 20 n xx xx
    userCount: 99,
    presetCount: 99,
    userLabel: (n) => `U${pad2(n + 1)}`,
    presetLabel: (n) => `P${pad2(n + 1)}`,
    // Current patch number (2 bytes, hi*128+lo): 0-98 user memories, 99-197 presets.
    currentPatch: [0x00, 0x01, 0x00, 0x00],
    decodePatchNumber: (n) => (n < 99 ? { kind: 'user', index: n } : { kind: 'preset', index: n - 99 }),
    // Read in 3 blocks of 8 pages (same as the original app), write in its exact chunks.
    readBlocks: [[0x00, 0x00], [0x08, 0x00], [0x10, 0x00]],
    readSize: 8 * 128,
    patchSpan: 24 * 128,                       // bytes a patch can occupy
    writeChunks: [
      [0x00, 0x00, 64], [0x00, 0x50, 48], [0x01, 0x00, 64], [0x01, 0x40, 64], [0x02, 0x00, 65], [0x02, 0x41, 63],
      [0x03, 0x00, 64], [0x03, 0x40, 64], [0x04, 0x00, 64], [0x04, 0x41, 63], [0x05, 0x01, 63], [0x05, 0x40, 64],
      [0x06, 0x00, 64], [0x06, 0x40, 64], [0x07, 0x00, 64], [0x07, 0x40, 64], [0x08, 0x00, 64], [0x08, 0x50, 48],
      [0x09, 0x10, 48], [0x09, 0x50, 48], [0x0a, 0x10, 33], [0x10, 0x10, 64], [0x10, 0x50, 48], [0x11, 0x00, 64],
    ],
  },

  // ---- editor commands ----------------------------------------------------------------------
  commands: {
    editorLevel: [0x7f, 0x00, 0x00, 0x00],     // read on connect
    editorMode: [0x7f, 0x00, 0x00, 0x01],      // 01 on connect, 00 on exit
    patchWrite: [0x7f, 0x00, 0x01, 0x04],      // [hi, lo] of the user memory to store into
  },

  // ---- patch layout -------------------------------------------------------------------------
  patch: {
    nameKeys: Array.from({ length: 16 }, (_, i) => `patch_name${i + 1}`),
    chainKeys: Array.from({ length: 20 }, (_, i) => `fx_chain_position${i + 1}`),
    // Chain values that must keep this relative order: divider -> channel B -> mixer
    chainOrder: [17, 18, 19],
  },

  // ---- editor UI ----------------------------------------------------------------------------
  blocks: BLOCKS,
  // Nicer names for the FX type ids used internally by the original app
  pretty: {
    TWAH: 'T.WAH', GEQ: 'GRAPHIC EQ', PEQ: 'PARAMETRIC EQ', TONEMODIFY: 'TONE MODIFY', GTRSIM: 'GUITAR SIM',
    ACSIM: 'AC.GUITAR SIM', SLOWGEAR: 'SLOW GEAR', PITCHSHIFTER: 'PITCH SHIFTER', AC_PROC: 'AC.PROCESSOR',
    UNI_V: 'UNI-V', SUBDELAY: 'SUB DELAY',
  },
  // Visibility rules (ENABLE_PATTERN_LIST) that depend on another parameter's value
  ruleParams: {
    DIVIDER_MODE: 'divider_mode',
    SEND_RETURN_MODE: 'send_return_mode',
    PRE_AMP_A_SP_TYPE: 'preamp_a_sp_type',
    PRE_AMP_B_SP_TYPE: 'preamp_b_sp_type',
  },
  ruleParamPattern: { re: /^(FX\d)_(HR\d):HARM$/, param: (m) => `${m[1].toLowerCase()}_harmonist_${m[2].toLowerCase()}harm` },
  // Parameters whose change alters what is shown (besides block types/switches, chain and name)
  structural: { keys: ['divider_mode', 'send_return_mode', 'preamp_a_sp_type', 'preamp_b_sp_type'], pattern: /_harmonist_hr\dharm$/ },
  // Preamp B reuses Preamp A's dropdowns and rules
  aliases: [['preamp_b_', 'preamp_a_']],
  // Hover hints: which real gear an effect type models (from the GT-1 Parameter Guide)
  hints: GT1_HINTS,
  // Simple chain view (like BOSS TONE STUDIO's): the main blocks only, in their chain order
  simpleChain: ['fx1', 'pedal', 'odds', 'preA', 'ns1', 'fv', 'fx2', 'delay', 'reverb'],
  // Icon per block in the simple view: amp, treadle (expression pedal) or pedal (default)
  icons: { preA: 'amp', preB: 'amp', pedal: 'treadle', fv: 'treadle' },

  // ---- files ----------------------------------------------------------------------------------
  tslDevice: 'GT-1',
  extract: {
    swf: /BOSS_TONE_STUDIO_for_GT1\.swf$/i,
    presets: /gt_preset_patches\.tsl$/i,
    definitionsClass: 'ParameterDefinitionGT',  // static tables: blocks, types, ranges, labels
    offsetsMethod: 'TemporaryParams::setData',  // byte offset of every patch parameter
    minParams: 900,
    download: 'boss.info → GT-1 → Support → Updates & Drivers (e.g. bts_gt1_w102.zip)',
    installedFolder: 'C:\\Program Files (x86)\\BOSS TONE STUDIO for GT-1',
  },

  // ---- demo -----------------------------------------------------------------------------------
  demo: {
    table: DEMO_DEFS_TABLE,
    buildTable: buildDemoTable,
    paramDefs: demoParamDefs,
    switches: DEMO_SWITCHES,
    typeKeys: DEMO_TYPE_KEYS,
    // Chain for scratch patches (divider -> ch B -> mixer kept in order)
    chain: [0, 15, 5, 11, 17, 2, 13, 18, 3, 19, 4, 6, 8, 7, 9, 10, 12, 14, 1, 16],
    // Blocks the variation generator may switch on/off, and how likely scratch patches have them on
    toggleBlocks: ['fx1', 'fx2', 'delay', 'chorus', 'reverb', 'comp', 'eq'],
    onChance: { preamp_a_on_off: 0.95, preamp_b_on_off: 0.3, od_ds_on_off: 0.6, ns1_on_off: 0.8, reverb_on_off: 0.75, delay_on_off: 0.6 },
  },
};
