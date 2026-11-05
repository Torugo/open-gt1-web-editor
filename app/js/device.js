// Device profiles: everything that differs between BOSS units lives in one profile per device
// (app/js/devices/*.js). The rest of the editor asks the active profile instead of hardcoding.
// To add a device, write its profile, add it to DEVICES, and test every operation on the real unit
// (see "Other BOSS devices" in the README).
import { GT1 } from './devices/gt1.js';

export const DEVICES = [GT1];

// The active profile. ES modules export live bindings, so importers always see the current one.
export let DEVICE = GT1;

export function setDevice(id) {
  DEVICE = DEVICES.find((d) => d.id === id) || GT1;
  return DEVICE;
}

export const pad2 = (n) => String(n).padStart(2, '0');
