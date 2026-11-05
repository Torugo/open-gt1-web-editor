// Hover hints for the GT-1's effect types: which real gear a model is based on, or what an
// original BOSS type does. Source: BOSS GT-1 Parameter Guide (the "This models ..." lines),
// condensed. Brand and model names are trademarks of their owners and only describe the sound.

const COMP = {
  'BOSS COMP': 'Models a BOSS CS-3',
  'HI-BAND': 'Original: stronger effect on the highs',
  LIGHT: 'Original: light compression',
  'D-COMP': 'Models an MXR Dyna Comp',
  ORANGE: 'Models a Dan Armstrong Orange Squeezer',
  FAT: 'Original: fat tone, boosted mids',
  MILD: 'Original: sweet tone, highs cut',
  'STEREO COMP': 'Original: stereo compressor',
};

const LIMITER = {
  'BOSS LIMITER': 'Original: stereo limiter',
  'RACK 160D': 'Models a dbx 160X',
  'VTG RACK U': 'Models a UREI 1178',
};

const ODDS = {
  'MID BOOST': 'Original: booster with a strong midrange',
  'CLEAN BOOST': 'Original: clean booster with punch',
  'TREBLE BOOST': 'Original: bright treble booster',
  CRUNCH: 'Original: crunch with amp-like distortion',
  'NATURAL OD': 'Original: natural-feeling overdrive',
  'WARM OD': 'Original: warm overdrive',
  'FAT DS': 'Original: thick distortion',
  'LEAD DS': 'Original: smooth, deep lead distortion',
  'METAL DS': 'Original: distortion for heavy riffs',
  'OCT FUZZ': 'Original: fuzz with rich octave harmonics',
  'A-DIST': 'Original (MDP): even distortion across the whole neck',
  'BLUES OD': 'Models a BOSS BD-2 Blues Driver',
  'OD-1': 'Models a BOSS OD-1',
  'T-SCREAM': 'Models an Ibanez TS-808 Tube Screamer',
  'TURBO OD': 'Models a BOSS OD-2 Turbo OverDrive',
  DISTORTION: 'Original: basic, traditional distortion',
  RAT: 'Models a ProCo RAT',
  'GUV DS': "Models a Marshall Guv'nor",
  'DST+': 'Models an MXR Distortion+',
  'METAL ZONE': 'Models a BOSS MT-2 Metal Zone',
  "'60S FUZZ": 'Models a Fuzz Face',
  'MUFF FUZZ': 'Models an Electro-Harmonix Big Muff π',
  CUSTOM: 'Build your own drive from a base type',
};

const PREAMP = {
  'NATURAL CLEAN': 'Original: uncoloured clean amp',
  'FULL RANGE': 'Original: flat, full-range amp (good for acoustic)',
  'COMBO CRUNCH': 'Original: combo-amp crunch',
  'STACK CRUNCH': 'Original: 4x12 stack crunch',
  'HiGAIN STACK': 'Vintage Marshall high gain, revamped by BOSS',
  'POWER DRIVE': 'Original: straight drive for rhythm and lead',
  'EXTREME LEAD': 'Original: smoothed-out big-stack lead',
  'CORE METAL': 'Original: big stack tuned for metal',
  'JC-120': 'Models a Roland JC-120',
  'CLEAN TWIN': 'Models a Fender Twin Reverb',
  'PRO CRUNCH': 'Models a Fender Pro Reverb',
  TWEED: 'Models a Fender Bassman 4x10 combo',
  'DELUXE CRUNCH': 'Models a Fender Deluxe Reverb',
  'VO DRIVE': 'Models a VOX AC-30TB (drive)',
  'VO LEAD': 'Models a VOX AC-30TB (lead)',
  'MATCH DRIVE': 'Models a Matchless D/C-30',
  'BG LEAD': 'Models a MESA/Boogie combo (lead)',
  'BG DRIVE': 'Models a MESA/Boogie with treble shift on',
  'MS1959 I': 'Models a Marshall 1959, input I',
  'MS1959 I+II': 'Models a Marshall 1959, inputs I and II linked',
  'R-FIER VINTAGE': 'Models a MESA/Boogie Dual Rectifier (ch. 2 Vintage)',
  'R-FIER MODERN': 'Models a MESA/Boogie Dual Rectifier (ch. 2 Modern)',
  'T-AMP LEAD': 'Models a Hughes & Kettner Triamp (AMP3)',
  SLDN: 'Models a Soldano SLO-100',
  '5150 DRIVE': 'Models a Peavey EVH 5150 (lead channel)',
  'BGNR UB METAL': 'Models a Bogner Uberschall (high-gain channel)',
  'ORNG ROCK REVERB': 'Models an Orange Rockerverb (dirty channel)',
  CUSTOM: 'Build your own amp from a base type',
};

const WAH = {
  'CRY WAH': "Models a '70s Cry Baby wah",
  'VO WAH': 'Models a VOX V846',
  'FAT WAH': 'Original: bold-toned wah',
  'LIGHT WAH': 'Original: refined, neutral wah',
  '7STRING WAH': 'Original: wide range for 7-string and baritone',
  'RESO WAH': 'Original: analog-synth filter resonance',
  'PEDAL BEND': 'Pitch bend from the expression pedal',
};

// FX1/FX2 types use the original app's internal names (see `pretty` in gt1.js)
const FX = {
  COMPRESSOR: 'Compressor (pick a model under Sub type)',
  LIMITER: 'Limiter (pick a model under Sub type)',
  TWAH: 'Auto wah that follows your picking',
  GEQ: '7-band graphic EQ',
  PEQ: '4-band parametric EQ',
  TONEMODIFY: "Reshapes your guitar's tone",
  GTRSIM: 'Makes your guitar sound like another type',
  ACSIM: 'Makes an electric sound acoustic',
  SLOWGEAR: 'Volume swell ("violin" sound)',
  OCTAVE: 'Adds notes one and two octaves down',
  PITCHSHIFTER: 'Shifts the pitch up to two octaves',
  HARMONIST: 'Adds harmonies in your key',
  OVERTONE: 'Original (MDP): adds new harmonics',
  FEEDBACKER: 'Controlled guitar feedback',
  AC_PROC: 'Makes an acoustic pickup sound miked',
  PHASER: 'Swirling phase shifter',
  FLANGER: 'Jet-plane flanger',
  TREMOLO: 'Pulsing volume',
  ROTARY: 'Rotary speaker cabinet',
  UNI_V: 'Models a Uni-Vibe',
  VIBRATO: 'Pitch wobble',
  CHORUS: 'Chorus',
  SUBDELAY: 'Short extra delay',
};

const TONEMODIFY = {
  FAT: 'Boosted mids', PRESENCE: 'Brighter high-mids', MILD: 'Highs cut', TIGHT: 'Lows cut', ENHANCE: 'Highs boosted',
  RESONATOR1: 'Adds body resonance', RESONATOR2: 'Adds body resonance', RESONATOR3: 'Adds body resonance',
};

const AC_PROC = {
  SMALL: 'Small-bodied acoustic', MEDIUM: 'Standard acoustic', BRIGHT: 'Bright acoustic', POWER: 'Powerful acoustic',
};

const DELAY = {
  STANDARD: 'Simple mono delay',
  PAN: 'Stereo tap delay',
  REVERSE: 'Delay played backwards',
  ANALOG: 'Mild analog-style delay',
  TAPE: 'Wavering tape echo',
  MODULATE: 'Delay with a gentle wobble',
  'TERA ECHO': 'Original (MDP): spacious ambient echo',
};

const REVERB = {
  AMBIENCE: 'Room-mic ambience: openness and depth',
  ROOM: 'Small room',
  HALL1: 'Concert hall, bright',
  HALL2: 'Concert hall, mild',
  PLATE: 'Plate reverb',
  SPRING: "Guitar amp's built-in spring reverb",
  MODULATE: 'Reverb with modulation',
  DELAY: 'Reverb mixed with delay',
};

const CHORUS = {
  MONO: 'Same chorus on left and right',
  STEREO1: 'Different chorus on left and right',
  STEREO2: 'Spatial: dry left, chorus right',
};

// Accel FX types are not described in the Parameter Guide, so they have no hints.
export const GT1_HINTS = {
  // by block id -> type name
  type: { comp: COMP, odds: ODDS, preA: PREAMP, preB: PREAMP, pedal: WAH, fx1: FX, fx2: FX, delay: DELAY, chorus: CHORUS, reverb: REVERB },
  // by sub type list -> sub type name
  sub: { COMPRESSOR: COMP, LIMITER, TONEMODIFY, AC_PROC, 'SUB WAH': WAH },
};
