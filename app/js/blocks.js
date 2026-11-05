// Effect blocks and how their parameters are shown. Device-neutral: the block list, type names
// and visibility rules come from the active profile (device.js); the tables come from the
// user's own BOSS TONE STUDIO (GT.defs).
import { GT, toDisplay, fromDisplay } from './model.js';
import { DEVICE } from './device.js';

export const blocks = () => DEVICE.blocks;
export const blockById = (id) => DEVICE.blocks.find((b) => b.id === id);
export const blockByChain = (v) => DEVICE.blocks.find((b) => b.chain === v && b.chain >= 0);
export const pretty = (n) => DEVICE.pretty[n] || n;

// Some parameters share another's dropdown and rules (e.g. GT-1 Preamp B uses Preamp A's).
function aliased(table, id) {
  if (table[id]) return table[id];
  for (const [from, to] of DEVICE.aliases || []) if (id.startsWith(from)) return table[id.replace(from, to)];
  return undefined;
}

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
  const dd = aliased(GT.defs.DROPDOWN_LIST, id);
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
  const rule = aliased(GT.defs.ENABLE_PATTERN_LIST, def.id);
  if (!rule) return true;
  let current = null; let options = null;
  const fromParam = (id) => { const dd = dropdownFor(id); options = dd; current = dd ? dd[patch.get(id)] : null; };
  switch (rule.key) {
    case 'EFFECT_TYPE': current = typeName(block, patch); options = (typeList(block) || []).map((t) => t.name); break;
    case 'SUB_TYPE': { const s = subInfo(block, patch); current = s?.name; options = s?.list.map((x) => x.name); break; }
    default: {
      // rules that depend on another parameter's value, as listed in the device profile
      const direct = DEVICE.ruleParams?.[rule.key];
      const m = DEVICE.ruleParamPattern && rule.key.match(DEVICE.ruleParamPattern.re);
      if (direct) fromParam(direct);
      else if (m) fromParam(DEVICE.ruleParamPattern.param(m));
      else return true; // e.g. OUTPUT_SELECT is a system setting: always show
    }
  }
  // If none of the rule's values can ever occur in this list, don't hide the parameter.
  if (!options || !rule.value.some((v) => options.includes(v))) return true;
  return rule.value.includes(current);
}

export { toDisplay, fromDisplay };
