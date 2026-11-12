// Rotary knob widget (SVG). Drag up/down, mouse wheel or trackpad, arrow keys; Shift = fine.
const NS = 'http://www.w3.org/2000/svg';
const A0 = Math.PI * 0.75; // sweep start / end angles
const A1 = Math.PI * 2.25;
const WHEEL_NOTCH = 50;    // px: a wheel event at least this big is one notch of a mouse wheel
const WHEEL_STEP = 40;     // px of trackpad scrolling per step

function arcPath(a0, a1) {
  const r = 24, cx = 30, cy = 30;
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

// The knob being dragged right now, so incoming values never pull it out from under the mouse.
let dragging = null;
export const isDragging = (k) => dragging === k;
export const anyKnobDragging = () => dragging !== null;

export function knob({ value, min, max, onInput, label }) {
  const svg = document.createElementNS(NS, 'svg');
  const attrs = { viewBox: '0 0 60 60', class: 'knob', tabindex: '0', role: 'slider', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max };
  for (const k in attrs) svg.setAttribute(k, attrs[k]);
  const mk = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); svg.append(n); return n; };
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

  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId); svg.focus();
    drag = { y: e.clientY, v }; dragging = svg;
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const per = (max - min) / (e.shiftKey ? 600 : 150);
    set(drag.v + (drag.y - e.clientY) * Math.max(per, e.shiftKey ? 0.05 : 0.12));
  });
  const end = () => { drag = null; if (dragging === svg) dragging = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);

  // A mouse wheel sends one big event per notch: one step each. A trackpad (every Mac) sends a
  // stream of small ones, so those are added up; stepping once per event would spin the knob.
  let wheelSum = 0;
  svg.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // pinch-to-zoom arrives as ctrl+wheel: leave it to the browser
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * WHEEL_STEP : e.deltaY; // lines -> px
    if (Math.abs(px) >= WHEEL_NOTCH) { wheelSum = 0; set(v - Math.sign(px)); return; }
    if (Math.sign(px) !== Math.sign(wheelSum)) wheelSum = 0;
    wheelSum += px;
    const steps = Math.trunc(wheelSum / WHEEL_STEP);
    if (steps) { wheelSum -= steps * WHEEL_STEP; set(v - steps); }
  }, { passive: false });

  svg.addEventListener('keydown', (e) => {
    const big = Math.max(1, Math.round((max - min) / 10));
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: big, PageDown: -big };
    if (e.key in map) { e.preventDefault(); set(v + map[e.key]); }
    if (e.key === 'Home') set(min);
    if (e.key === 'End') set(max);
  });

  draw();
  svg.update = (nv) => { v = nv; draw(); }; // show a value without reporting it as an edit
  return svg;
}
