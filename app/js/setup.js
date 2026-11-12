// One-time setup dialog: reads the parameter table and factory presets out of the user's own
// BOSS TONE STUDIO files (see extract.js) and saves them in this browser (store.js).
import * as store from './store.js';
import { findRolandFiles, buildDefsFromSwf, parsePresets } from './extract.js';
import { DEVICES, setDevice } from './device.js';
import { $ } from './dom.js';

const WANTED = /\.(zip|exe|swf|tsl)$/i;

// Folders dropped onto the page: walk them, keeping only files we might need.
async function filesFromDrop(dt) {
  const out = [];
  const walk = (entry) => new Promise((resolve) => {
    if (entry.isFile) {
      if (!WANTED.test(entry.name)) return resolve();
      entry.file((f) => { out.push(f); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      // readEntries hands out a directory in batches; an empty batch means it is done
      const next = () => reader.readEntries(async (batch) => {
        if (!batch.length) { for (const e of all) await walk(e); resolve(); } else { all.push(...batch); next(); }
      }, () => resolve());
      next();
    } else resolve();
  });
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (entries.length) for (const e of entries) await walk(e);
  else out.push(...[...dt.files].filter((f) => WANTED.test(f.name)));
  return out;
}

// Resolves with { defs, factory } after an import, { demo: true } when the visitor picks the
// demo, or null when the dialog is dismissed (only possible with cancelable).
export function runSetup({ cancelable = false } = {}) {
  return new Promise((resolve) => {
    const dlg = $('#setupDlg');
    const status = $('#setupStatus');
    const zone = $('#dropZone');
    const say = (msg, err = false) => { status.textContent = msg; status.className = 'setup-status' + (err ? ' err' : ''); };
    say('');

    // every listener below is removed in one go when the dialog closes
    const listeners = new AbortController();
    const on = (target, type, fn) => target.addEventListener(type, fn, { signal: listeners.signal });
    const finish = (result) => { resolve(result); dlg.close(); };

    let busy = false;
    const process = async (files) => {
      if (busy || !files.length) return;
      busy = true;
      try {
        say('Looking for BOSS TONE STUDIO data…');
        const found = await findRolandFiles(files, say);
        if (!found.device) {
          const supported = DEVICES.map((d) => d.name).join(', ');
          throw new Error(`Could not find a supported BOSS TONE STUDIO in what you picked (supported: ${supported}). Try the BOSS download zip or the installed folder.`);
        }
        say(`Reading the ${found.device.name} parameter list…`);
        const defs = await buildDefsFromSwf(found.swf, found.device);
        setDevice(found.device.id);
        const factory = found.tsl ? parsePresets(found.tsl) : [];
        const saved = (await store.set('defs', defs)) && (await store.set('factory', factory));
        say(`Done: ${found.device.name}, ${Object.keys(defs.addr).length} parameters, ${factory.length} factory presets.` + (saved ? '' : ' (Could not save in this browser; you will need to do this again next time.)'));
        finish({ defs, factory });
      } catch (e) {
        console.error(e);
        say(e.message || String(e), true);
      } finally { busy = false; }
    };

    const onFiles = (e) => { process([...e.target.files]); e.target.value = ''; };
    on($('#setupFiles'), 'change', onFiles);
    on($('#setupFolder'), 'change', onFiles);
    on($('#btnPickFile'), 'click', () => $('#setupFiles').click());
    on($('#btnPickFolder'), 'click', () => $('#setupFolder').click());
    on(zone, 'dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    on(zone, 'dragleave', () => zone.classList.remove('over'));
    on(zone, 'drop', async (e) => { e.preventDefault(); zone.classList.remove('over'); process(await filesFromDrop(e.dataTransfer)); });
    on(dlg, 'cancel', (e) => { if (!cancelable) e.preventDefault(); }); // Esc
    // The demo is offered only on first run; from inside the demo the dialog is opened to import for real.
    $('#btnSetupDemo').hidden = cancelable;
    on($('#btnSetupDemo'), 'click', () => finish({ demo: true }));
    dlg.addEventListener('close', () => { listeners.abort(); resolve(null); }, { once: true });
    dlg.showModal();
  });
}
